/**
 * @system MediCore ERP — Per-payer claim reports (v60 / Tier 4)
 * @route GET /api/billing/reports/payers?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Aggregates insurance_claims by payer (via insurances.payerId) within
 * the optional date window. Returns:
 *   {
 *     window: { from, to },
 *     totals: { claims, claimed, approved, paid, approvalRate },
 *     byPayer: [{
 *       payerId, payerName, payerCode,
 *       claims, claimed, approved, paid,
 *       approvalRate, denialRate,
 *       avgDaysToDecide,
 *       statusCounts: { DRAFT, SUBMITTED, ..., CANCELLED },
 *       topDenialReasons: [{ code, description, count }]
 *     }],
 *     unmappedClaims: number   // claims whose insurance has no payerId
 *   }
 *
 * BILLING / ADMIN / SUPER_ADMIN gated. Non-admin = own branch.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, isAdmin } from "@/lib/require-auth";
import { logger } from "@/lib/logger";

type Status =
  | "DRAFT" | "SUBMITTED" | "IN_REVIEW"
  | "APPROVED" | "PARTIAL" | "DENIED"
  | "PAID" | "APPEALED" | "CANCELLED";

const ALL_STATUSES: Status[] = [
  "DRAFT", "SUBMITTED", "IN_REVIEW", "APPROVED", "PARTIAL", "DENIED", "PAID", "APPEALED", "CANCELLED",
];

function emptyStatusBuckets(): Record<Status, number> {
  return ALL_STATUSES.reduce<Record<Status, number>>((acc, s) => { acc[s] = 0; return acc; }, {} as Record<Status, number>);
}

export async function GET(request: Request) {
  try {
    const auth = await requireAuth({ roles: ["SUPER_ADMIN", "ADMIN", "BILLING"] });
    if (auth.response) return auth.response;

    const { searchParams } = new URL(request.url);
    const from = searchParams.get("from"); // YYYY-MM-DD inclusive
    const to = searchParams.get("to");     // YYYY-MM-DD exclusive upper bound (we add a day)

    // Tenant scope: caller's tenant only.
    const me = await prisma.user.findUnique({
      where: { id: auth.user.id },
      select: { tenantId: true, branchId: true },
    });
    if (!me) return NextResponse.json({ success: false, error: "User not found" }, { status: 404 });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = { tenantId: me.tenantId };
    if (!isAdmin(auth.user)) where.branchId = me.branchId;
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(`${from}T00:00:00Z`);
      if (to)   where.createdAt.lt  = new Date(new Date(`${to}T00:00:00Z`).getTime() + 24 * 60 * 60 * 1000);
    }

    const claims = await prisma.insuranceClaim.findMany({
      where,
      select: {
        id: true,
        status: true,
        claimedAmount: true,
        approvedAmount: true,
        paidAmount: true,
        submittedAt: true,
        decidedAt: true,
        insurance: { select: { payerId: true, provider: true, payer: { select: { id: true, name: true, code: true } } } },
        denialReasonCode: { select: { code: true, description: true } },
      },
    });

    type Bucket = {
      payerId: string | null;
      payerName: string;
      payerCode: string | null;
      claims: number;
      claimed: number;
      approved: number;
      paid: number;
      decisionDays: number[];          // for avg days-to-decide
      statusCounts: Record<Status, number>;
      denialCounts: Map<string, { code: string; description: string; count: number }>;
    };

    const byPayer = new Map<string, Bucket>(); // key = payerId or `__free:<provider>`
    let unmapped = 0;

    for (const c of claims) {
      const payerId = c.insurance.payerId ?? null;
      const key = payerId ?? `__free:${c.insurance.provider}`;
      if (!payerId) unmapped++;

      let bucket = byPayer.get(key);
      if (!bucket) {
        bucket = {
          payerId,
          payerName: c.insurance.payer?.name ?? c.insurance.provider,
          payerCode: c.insurance.payer?.code ?? null,
          claims: 0,
          claimed: 0,
          approved: 0,
          paid: 0,
          decisionDays: [],
          statusCounts: emptyStatusBuckets(),
          denialCounts: new Map(),
        };
        byPayer.set(key, bucket);
      }

      bucket.claims++;
      bucket.claimed  += Number(c.claimedAmount);
      bucket.approved += Number(c.approvedAmount ?? 0);
      bucket.paid     += Number(c.paidAmount);
      bucket.statusCounts[c.status as Status] += 1;

      if (c.submittedAt && c.decidedAt) {
        const days = (c.decidedAt.getTime() - c.submittedAt.getTime()) / (24 * 60 * 60 * 1000);
        if (Number.isFinite(days) && days >= 0) bucket.decisionDays.push(days);
      }

      if (c.status === "DENIED" && c.denialReasonCode) {
        const dc = c.denialReasonCode;
        const existing = bucket.denialCounts.get(dc.code);
        if (existing) existing.count++;
        else bucket.denialCounts.set(dc.code, { code: dc.code, description: dc.description, count: 1 });
      }
    }

    // Roll into the response shape.
    const byPayerArr = Array.from(byPayer.values()).map((b) => {
      const decided = b.statusCounts.APPROVED + b.statusCounts.PARTIAL + b.statusCounts.DENIED + b.statusCounts.PAID;
      const denied  = b.statusCounts.DENIED;
      const approvedOrPaid = b.statusCounts.APPROVED + b.statusCounts.PARTIAL + b.statusCounts.PAID;
      const approvalRate = decided > 0 ? approvedOrPaid / decided : 0;
      const denialRate   = decided > 0 ? denied / decided : 0;
      const avgDaysToDecide = b.decisionDays.length > 0
        ? b.decisionDays.reduce((s, d) => s + d, 0) / b.decisionDays.length
        : null;
      const topDenials = Array.from(b.denialCounts.values())
        .sort((a, x) => x.count - a.count)
        .slice(0, 5);
      return {
        payerId: b.payerId,
        payerName: b.payerName,
        payerCode: b.payerCode,
        claims: b.claims,
        claimed: Math.round(b.claimed * 100) / 100,
        approved: Math.round(b.approved * 100) / 100,
        paid: Math.round(b.paid * 100) / 100,
        approvalRate: Math.round(approvalRate * 1000) / 1000,
        denialRate: Math.round(denialRate * 1000) / 1000,
        avgDaysToDecide: avgDaysToDecide != null ? Math.round(avgDaysToDecide * 10) / 10 : null,
        statusCounts: b.statusCounts,
        topDenialReasons: topDenials,
      };
    }).sort((a, b) => b.claimed - a.claimed); // largest billing first

    const totals = byPayerArr.reduce(
      (acc, p) => {
        acc.claims   += p.claims;
        acc.claimed  += p.claimed;
        acc.approved += p.approved;
        acc.paid     += p.paid;
        return acc;
      },
      { claims: 0, claimed: 0, approved: 0, paid: 0 },
    );
    const overallApprovalRate = totals.claimed > 0 ? Math.round((totals.approved / totals.claimed) * 1000) / 1000 : 0;

    return NextResponse.json({
      success: true,
      data: {
        window: { from: from || null, to: to || null },
        totals: {
          ...totals,
          claimed: Math.round(totals.claimed * 100) / 100,
          approved: Math.round(totals.approved * 100) / 100,
          paid: Math.round(totals.paid * 100) / 100,
          approvalRate: overallApprovalRate,
        },
        byPayer: byPayerArr,
        unmappedClaims: unmapped,
      },
    });
  } catch (error) {
    logger.api("GET", "/api/billing/reports/payers", error);
    return NextResponse.json({ success: false, error: "Failed to load payer report" }, { status: 500 });
  }
}
