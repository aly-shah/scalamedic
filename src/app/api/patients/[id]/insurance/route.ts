/**
 * @system MediCore ERP — Patient insurance
 * @route GET  /api/patients/[id]/insurance — list policies for a patient
 * @route POST /api/patients/[id]/insurance — add a policy
 *
 * v59 introduces the Payer master. New rows should set `payerId` (FK)
 * and the denormalized `provider` (free-text name); legacy rows can
 * still be created with just `provider` for niche / international
 * payers not yet in the master.
 *
 * The route accepts either or both of payerId + provider:
 *   - payerId only   → provider is auto-filled from the Payer.name
 *   - provider only  → payerId stays null (free-text legacy path)
 *   - both           → trusted as-is (allows a different display name)
 */
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/require-auth";
import { logAudit } from "@/lib/audit";
import { logger } from "@/lib/logger";

// ---------- GET ----------
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth();
    if (auth.response) return auth.response;
    const { id } = await params;

    const policies = await prisma.insurance.findMany({
      where: { patientId: id },
      orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
      include: { payer: { select: { id: true, code: true, name: true, isActive: true } } },
    });
    return NextResponse.json({ success: true, data: policies });
  } catch (error) {
    logger.api("GET", "/api/patients/[id]/insurance", error);
    return NextResponse.json({ success: false, error: "Failed to load insurance" }, { status: 500 });
  }
}

// ---------- POST ----------
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth();
    if (auth.response) return auth.response;
    const { id } = await params;
    const body = await request.json();

    const policyNumber = typeof body.policyNumber === "string" ? body.policyNumber.trim() : "";
    if (!policyNumber) {
      return NextResponse.json({ success: false, error: "Policy number is required" }, { status: 400 });
    }

    // Resolve payer: if payerId is sent, look it up + auto-fill provider.
    // Otherwise rely on free-text provider only.
    const rawPayerId = typeof body.payerId === "string" && body.payerId ? body.payerId : null;
    let payerId: string | null = null;
    let provider: string;

    if (rawPayerId) {
      // Cross-tenant guard: the payer must belong to the same tenant
      // as the patient.
      const patient = await prisma.patient.findUnique({
        where: { id },
        select: { tenantId: true },
      });
      if (!patient) {
        return NextResponse.json({ success: false, error: "Patient not found" }, { status: 404 });
      }
      const payer = await prisma.payer.findUnique({
        where: { id: rawPayerId },
        select: { id: true, name: true, tenantId: true, isActive: true },
      });
      if (!payer || payer.tenantId !== patient.tenantId) {
        return NextResponse.json({ success: false, error: "Invalid payer" }, { status: 400 });
      }
      if (!payer.isActive) {
        return NextResponse.json({ success: false, error: "Payer is inactive" }, { status: 400 });
      }
      payerId = payer.id;
      provider = typeof body.provider === "string" && body.provider.trim() ? body.provider.trim() : payer.name;
    } else {
      provider = typeof body.provider === "string" ? body.provider.trim() : "";
      if (!provider) {
        return NextResponse.json({ success: false, error: "Provider name is required" }, { status: 400 });
      }
    }

    const expiryDate = typeof body.expiryDate === "string" && body.expiryDate
      ? new Date(body.expiryDate)
      : null;
    const copayAmount = typeof body.copayAmount === "number" || (typeof body.copayAmount === "string" && body.copayAmount !== "")
      ? new Prisma.Decimal(body.copayAmount)
      : null;
    const coverageType = typeof body.coverageType === "string" && body.coverageType.trim()
      ? body.coverageType.trim()
      : null;

    const created = await prisma.insurance.create({
      data: {
        patientId: id,
        provider: provider.slice(0, 120),
        payerId,
        policyNumber: policyNumber.slice(0, 60),
        coverageType,
        copayAmount,
        expiryDate,
        isActive: body.isActive !== false,
      },
      include: { payer: { select: { id: true, code: true, name: true } } },
    });

    await logAudit({
      userId: auth.user.id,
      action: "CREATE",
      module: "PATIENT",
      entityType: "Insurance",
      entityId: created.id,
      details: { patientId: id, payerId, provider: created.provider, policyNumber: created.policyNumber },
    });

    return NextResponse.json({ success: true, data: created }, { status: 201 });
  } catch (error) {
    logger.api("POST", "/api/patients/[id]/insurance", error);
    return NextResponse.json({ success: false, error: "Failed to add insurance" }, { status: 500 });
  }
}
