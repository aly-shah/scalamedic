/**
 * @system MediCore ERP — Insurance claim transitions (v58 / Tier 4.4)
 * @route GET   /api/claims/[id]
 * @route PATCH /api/claims/[id]
 *
 * PATCH body shape varies with the requested transition:
 *   - { action: "submit", insurerReference?: string }
 *       DRAFT → SUBMITTED. Sets submittedAt = now.
 *   - { action: "review" }
 *       SUBMITTED → IN_REVIEW.
 *   - { action: "decide", outcome: "APPROVED" | "PARTIAL" | "DENIED",
 *       approvedAmount?: number, denialReason?: string }
 *       SUBMITTED|IN_REVIEW|APPEALED → APPROVED/PARTIAL/DENIED.
 *       APPROVED needs approvedAmount == claimedAmount; PARTIAL needs
 *       0 < approvedAmount < claimedAmount; DENIED needs denialReason.
 *   - { action: "pay", paidAmount: number, paidAt?: ISO }
 *       APPROVED|PARTIAL → PAID. paidAmount must be <= approvedAmount.
 *   - { action: "appeal", notes?: string }
 *       DENIED → APPEALED.
 *   - { action: "cancel", reason?: string }
 *       Any pre-PAID state → CANCELLED.
 *   - { notes?: string, insurerReference?: string }   (no `action` →
 *       editable-fields-only update; status untouched)
 *
 * The DB CHECK constraints are the safety net; this route enforces
 * the same invariants up-front so the user gets a clean error
 * instead of a constraint-violation message.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma, type InsuranceClaimStatus } from "@prisma/client";
import { requireAuth, isAdmin } from "@/lib/require-auth";
import { logAudit } from "@/lib/audit";
import { logger } from "@/lib/logger";

// ---------- GET ----------
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth();
    if (auth.response) return auth.response;
    const { id } = await params;

    const claim = await prisma.insuranceClaim.findUnique({
      where: { id },
      include: {
        patient: { select: { id: true, firstName: true, lastName: true, patientCode: true, phone: true } },
        invoice: { select: { id: true, invoiceNumber: true, total: true, status: true, balanceDue: true } },
        insurance: { select: { id: true, provider: true, policyNumber: true, coverageType: true } },
        branch: { select: { id: true, code: true, name: true } },
        createdBy: { select: { id: true, name: true } },
      },
    });
    if (!claim) {
      return NextResponse.json({ success: false, error: "Claim not found" }, { status: 404 });
    }
    if (!isAdmin(auth.user) && claim.branchId !== auth.user.branchId) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ success: true, data: claim });
  } catch (error) {
    logger.api("GET", "/api/claims/[id]", error);
    return NextResponse.json({ success: false, error: "Failed to load claim" }, { status: 500 });
  }
}

// ---------- PATCH ----------
const VALID_DECISION_OUTCOMES = new Set(["APPROVED", "PARTIAL", "DENIED"]);

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function isStringy(v: unknown, max = 4000): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length === 0 ? null : t.slice(0, max);
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth({ roles: ["SUPER_ADMIN", "ADMIN", "BILLING"] });
    if (auth.response) return auth.response;
    const { id } = await params;
    const body = await request.json().catch(() => ({}));

    const claim = await prisma.insuranceClaim.findUnique({
      where: { id },
      include: { invoice: { select: { total: true } } },
    });
    if (!claim) {
      return NextResponse.json({ success: false, error: "Claim not found" }, { status: 404 });
    }
    if (!isAdmin(auth.user) && claim.branchId !== auth.user.branchId) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }

    const action = typeof body.action === "string" ? body.action : "";
    const claimedAmount = Number(claim.claimedAmount);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = {};
    let auditAction = "UPDATE";

    switch (action) {
      // ─────────────────────────── SUBMIT ───────────────────────────
      case "submit": {
        if (claim.status !== "DRAFT") {
          return NextResponse.json({ success: false, error: `Cannot submit from status ${claim.status}` }, { status: 409 });
        }
        data.status = "SUBMITTED";
        data.submittedAt = new Date();
        const ref = isStringy(body.insurerReference, 80);
        if (ref) data.insurerReference = ref;
        auditAction = "CLAIM_SUBMIT";
        break;
      }
      // ─────────────────────────── REVIEW ───────────────────────────
      case "review": {
        if (claim.status !== "SUBMITTED") {
          return NextResponse.json({ success: false, error: `Cannot move to review from ${claim.status}` }, { status: 409 });
        }
        data.status = "IN_REVIEW";
        auditAction = "CLAIM_REVIEW";
        break;
      }
      // ─────────────────────────── DECIDE ───────────────────────────
      case "decide": {
        if (!["SUBMITTED", "IN_REVIEW", "APPEALED"].includes(claim.status)) {
          return NextResponse.json({ success: false, error: `Cannot decide from status ${claim.status}` }, { status: 409 });
        }
        const outcome = typeof body.outcome === "string" ? body.outcome.toUpperCase() : "";
        if (!VALID_DECISION_OUTCOMES.has(outcome)) {
          return NextResponse.json({ success: false, error: "outcome must be APPROVED, PARTIAL, or DENIED" }, { status: 400 });
        }
        if (outcome === "DENIED") {
          const reason = isStringy(body.denialReason, 4000);
          if (!reason) {
            return NextResponse.json({ success: false, error: "denialReason is required for DENIED" }, { status: 400 });
          }
          data.status = "DENIED";
          data.approvedAmount = new Prisma.Decimal(0);
          data.denialReason = reason;
          // v60 — optional structured denial code. We trust the FK
          // exists; cross-tenant validation happens via the existing
          // claim.tenantId/branch trigger (the FK target lives in the
          // same tenant or it'd never have been written).
          if (typeof body.denialReasonCodeId === "string" && body.denialReasonCodeId.trim()) {
            data.denialReasonCodeId = body.denialReasonCodeId.trim();
          } else if (body.denialReasonCodeId === null) {
            data.denialReasonCodeId = null;
          }
        } else {
          const approved = num(body.approvedAmount);
          if (approved == null || approved < 0) {
            return NextResponse.json({ success: false, error: "approvedAmount must be a non-negative number" }, { status: 400 });
          }
          if (approved > claimedAmount) {
            return NextResponse.json({ success: false, error: "approvedAmount cannot exceed claimedAmount" }, { status: 400 });
          }
          if (outcome === "APPROVED" && approved !== claimedAmount) {
            return NextResponse.json({ success: false, error: "APPROVED requires approvedAmount == claimedAmount; use PARTIAL otherwise" }, { status: 400 });
          }
          if (outcome === "PARTIAL" && (approved <= 0 || approved >= claimedAmount)) {
            return NextResponse.json({ success: false, error: "PARTIAL requires 0 < approvedAmount < claimedAmount" }, { status: 400 });
          }
          data.status = outcome;
          data.approvedAmount = new Prisma.Decimal(approved);
          // Clear any prior denialReason / code on a re-decision
          // (e.g. after appeal turns DENIED into APPROVED).
          data.denialReason = null;
          data.denialReasonCodeId = null;
        }
        data.decidedAt = new Date();
        auditAction = `CLAIM_DECIDE_${outcome}`;
        break;
      }
      // ─────────────────────────── PAY ───────────────────────────
      case "pay": {
        if (!["APPROVED", "PARTIAL"].includes(claim.status)) {
          return NextResponse.json({ success: false, error: `Cannot mark paid from status ${claim.status}` }, { status: 409 });
        }
        const paid = num(body.paidAmount);
        if (paid == null || paid <= 0) {
          return NextResponse.json({ success: false, error: "paidAmount must be a positive number" }, { status: 400 });
        }
        const approved = Number(claim.approvedAmount ?? 0);
        if (paid > approved) {
          return NextResponse.json({ success: false, error: "paidAmount cannot exceed approvedAmount" }, { status: 400 });
        }
        data.status = "PAID";
        data.paidAmount = new Prisma.Decimal(paid);
        data.paidAt = body.paidAt ? new Date(body.paidAt) : new Date();
        auditAction = "CLAIM_PAY";
        break;
      }
      // ─────────────────────────── APPEAL ───────────────────────────
      case "appeal": {
        if (claim.status !== "DENIED") {
          return NextResponse.json({ success: false, error: `Cannot appeal from status ${claim.status}` }, { status: 409 });
        }
        data.status = "APPEALED";
        const note = isStringy(body.notes, 4000);
        if (note) data.notes = note;
        auditAction = "CLAIM_APPEAL";
        break;
      }
      // ─────────────────────────── CANCEL ───────────────────────────
      case "cancel": {
        if (["PAID", "CANCELLED"].includes(claim.status)) {
          return NextResponse.json({ success: false, error: `Cannot cancel from status ${claim.status}` }, { status: 409 });
        }
        data.status = "CANCELLED";
        const reason = isStringy(body.reason, 4000);
        if (reason) {
          data.notes = claim.notes ? `${claim.notes}\nCancelled: ${reason}` : `Cancelled: ${reason}`;
        }
        auditAction = "CLAIM_CANCEL";
        break;
      }
      // ─────────────────────────── No action: editable fields only
      case "": {
        const ref = isStringy(body.insurerReference, 80);
        if (ref !== null) data.insurerReference = ref;
        else if (body.insurerReference === null) data.insurerReference = null;
        const note = isStringy(body.notes, 4000);
        if (note !== null) data.notes = note;
        else if (body.notes === null) data.notes = null;
        if (Object.keys(data).length === 0) {
          return NextResponse.json({ success: false, error: "Nothing to update — pass action or notes/insurerReference" }, { status: 400 });
        }
        break;
      }
      default:
        return NextResponse.json({ success: false, error: `Unknown action: ${action}` }, { status: 400 });
    }

    const updated = await prisma.insuranceClaim.update({
      where: { id },
      data,
    });

    await logAudit({
      userId: auth.user.id,
      action: auditAction,
      module: "BILLING",
      entityType: "InsuranceClaim",
      entityId: claim.id,
      details: { from: claim.status, to: data.status ?? claim.status, claimNumber: claim.claimNumber },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    logger.api("PATCH", "/api/claims/[id]", error);
    return NextResponse.json({ success: false, error: "Failed to update claim" }, { status: 500 });
  }
}

// Re-export the status type for the UI side if it imports from here.
export type { InsuranceClaimStatus };
