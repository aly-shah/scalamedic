/**
 * @system MediCore ERP — Insurance claims (v58 / Tier 4.4)
 * @route GET  /api/claims     — list with filters
 * @route POST /api/claims     — create DRAFT from invoice
 *
 * GET filters: status, patientId, branchId, insuranceId, from, to.
 * Non-admins are scoped to their own branch automatically.
 *
 * POST body: { invoiceId, insuranceId, claimedAmount?, diagnosisCodes?, notes? }
 *   - claimedAmount defaults to invoice.balanceDue (typical case: claim
 *     the unpaid portion)
 *   - diagnosisCodes defaults to the snapshot from the latest signed
 *     consultation note for the invoice's appointment, if one exists
 *   - claimNumber is auto-generated CLM-YYYY-NNNN, per-tenant
 *     monotonic via MAX (sequence-numbering rule from memory).
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { requireAuth, isAdmin } from "@/lib/require-auth";
import { logger } from "@/lib/logger";
import { logAudit } from "@/lib/audit";
import { tenantIdForBranch } from "@/lib/tenant";

// ============================================================
// GET — list claims
// ============================================================
export async function GET(request: Request) {
  try {
    const auth = await requireAuth();
    if (auth.response) return auth.response;

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const patientId = searchParams.get("patientId");
    const branchIdParam = searchParams.get("branchId");
    const insuranceId = searchParams.get("insuranceId");
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {};
    // Non-admins see only their own branch.
    if (!isAdmin(auth.user)) {
      where.branchId = auth.user.branchId;
    } else if (branchIdParam) {
      where.branchId = branchIdParam;
    }
    if (status) where.status = status;
    if (patientId) where.patientId = patientId;
    if (insuranceId) where.insuranceId = insuranceId;
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(`${from}T00:00:00Z`);
      if (to) where.createdAt.lt = new Date(`${to}T00:00:00Z`);
    }

    const claims = await prisma.insuranceClaim.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 200,
      include: {
        patient: { select: { id: true, firstName: true, lastName: true, patientCode: true, phone: true } },
        invoice: { select: { id: true, invoiceNumber: true, total: true, status: true } },
        insurance: { select: { id: true, provider: true, policyNumber: true } },
        branch: { select: { id: true, code: true, name: true } },
        createdBy: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({ success: true, data: claims });
  } catch (error) {
    logger.api("GET", "/api/claims", error);
    return NextResponse.json(
      { success: false, error: "Failed to load claims" },
      { status: 500 },
    );
  }
}

// ============================================================
// POST — create claim from invoice
// ============================================================
export async function POST(request: Request) {
  try {
    const auth = await requireAuth({ roles: ["SUPER_ADMIN", "ADMIN", "BILLING"] });
    if (auth.response) return auth.response;

    const body = await request.json();
    const invoiceId = typeof body.invoiceId === "string" ? body.invoiceId : "";
    const insuranceId = typeof body.insuranceId === "string" ? body.insuranceId : "";
    if (!invoiceId || !insuranceId) {
      return NextResponse.json(
        { success: false, error: "invoiceId and insuranceId are required" },
        { status: 400 },
      );
    }

    // Hydrate the invoice with everything we need for the claim
    // shape: branch (for tenant), patient, latest signed note for
    // diagnosis codes.
    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        branch: { select: { id: true, tenantId: true } },
        patient: { select: { id: true } },
        appointment: {
          include: {
            consultationNotes: {
              where: { isSigned: true },
              orderBy: { signedAt: "desc" },
              take: 1,
              select: { icd10Codes: true },
            },
          },
        },
      },
    });
    if (!invoice) {
      return NextResponse.json({ success: false, error: "Invoice not found" }, { status: 404 });
    }

    const insurance = await prisma.insurance.findUnique({
      where: { id: insuranceId },
      select: { id: true, patientId: true, isActive: true },
    });
    if (!insurance || insurance.patientId !== invoice.patientId) {
      return NextResponse.json(
        { success: false, error: "Insurance does not match this invoice's patient" },
        { status: 400 },
      );
    }
    if (!insurance.isActive) {
      return NextResponse.json(
        { success: false, error: "Insurance policy is inactive" },
        { status: 400 },
      );
    }

    // Default claimedAmount = invoice.balanceDue (whatever's still
    // unpaid). Caller may override with an explicit amount.
    const balanceDue = Number(invoice.balanceDue);
    const claimedRaw = typeof body.claimedAmount === "number" || typeof body.claimedAmount === "string"
      ? Number(body.claimedAmount)
      : balanceDue > 0 ? balanceDue : Number(invoice.total);
    if (!Number.isFinite(claimedRaw) || claimedRaw <= 0) {
      return NextResponse.json(
        { success: false, error: "Claimed amount must be a positive number" },
        { status: 400 },
      );
    }
    if (claimedRaw > Number(invoice.total)) {
      return NextResponse.json(
        { success: false, error: "Claimed amount cannot exceed invoice total" },
        { status: 400 },
      );
    }

    // Diagnosis snapshot: prefer caller-provided, fall back to the
    // signed consultation note linked through the invoice's
    // appointment. Validate format (mirror v57 array regex).
    const noteCodes = invoice.appointment?.consultationNotes[0]?.icd10Codes ?? [];
    const provided = Array.isArray(body.diagnosisCodes)
      ? (body.diagnosisCodes as unknown[]).filter(
          (c): c is string => typeof c === "string" && /^[A-Z]\d{2}(\.[\dA-Z]{1,4})?$/.test(c),
        )
      : null;
    const diagnosisCodes = provided ?? noteCodes;

    // Tenant scoping (sanity — branch.tenantId is the source of truth)
    const tenantId = await tenantIdForBranch(invoice.branchId);

    // Per-tenant CLM-YYYY-NNNN. Derive from MAX (sequence-numbering
    // rule from memory: never use count()+1 for these).
    const year = new Date().getFullYear();
    const last = await prisma.insuranceClaim.findFirst({
      where: { tenantId, claimNumber: { startsWith: `CLM-${year}-` } },
      orderBy: { claimNumber: "desc" },
      select: { claimNumber: true },
    });
    const lastNum = last ? parseInt(last.claimNumber.split("-").pop() || "0", 10) : 0;
    const claimNumber = `CLM-${year}-${String(lastNum + 1).padStart(4, "0")}`;

    const notes = typeof body.notes === "string" && body.notes.trim() ? body.notes.trim().slice(0, 4000) : null;

    const claim = await prisma.insuranceClaim.create({
      data: {
        claimNumber,
        invoiceId: invoice.id,
        patientId: invoice.patientId,
        insuranceId: insurance.id,
        branchId: invoice.branchId,
        tenantId,
        diagnosisCodes,
        claimedAmount: new Prisma.Decimal(claimedRaw),
        status: "DRAFT",
        notes,
        createdById: auth.user.id,
      },
    });

    await logAudit({
      userId: auth.user.id,
      action: "CREATE",
      module: "BILLING",
      entityType: "InsuranceClaim",
      entityId: claim.id,
      details: { claimNumber, invoiceId, insuranceId, claimedAmount: claimedRaw },
    });

    return NextResponse.json({ success: true, data: claim }, { status: 201 });
  } catch (error) {
    logger.api("POST", "/api/claims", error);
    return NextResponse.json(
      { success: false, error: "Failed to create claim" },
      { status: 500 },
    );
  }
}
