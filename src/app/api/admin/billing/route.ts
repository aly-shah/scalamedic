/**
 * @system MediCore ERP — Tenant plan management
 * @route GET  /api/admin/billing
 * @route PUT  /api/admin/billing
 *
 * GET returns the current tenant's plan + valid-until + computed
 * effective plan + the feature matrix so the /admin/billing page
 * can render side-by-side comparison without a second call.
 *
 * PUT (SUPER_ADMIN only) updates the plan + planValidUntil. In a
 * real billing-system world this would be hit by webhooks from
 * Stripe / Paddle / etc; for now an admin can set the tier
 * manually for testing.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/require-auth";
import { logger } from "@/lib/logger";
import { logAudit } from "@/lib/audit";
import { effectivePlan, featuresFor, FEATURE_LABELS, LIMITS_BY_PLAN, PLAN_METADATA } from "@/lib/feature-gate";
import type { TenantPlan } from "@prisma/client";

const VALID_PLANS = new Set(["FREE", "PRO", "ENTERPRISE"]);

export async function GET() {
  try {
    const auth = await requireAuth({ minRole: "ADMIN" });
    if (auth.response) return auth.response;

    const me = await prisma.user.findUnique({
      where: { id: auth.user.id },
      select: { tenant: { select: { id: true, name: true, plan: true, planValidUntil: true } } },
    });
    if (!me?.tenant) return NextResponse.json({ success: false, error: "Tenant not found" }, { status: 404 });

    const plan = effectivePlan(me.tenant);
    return NextResponse.json({
      success: true,
      data: {
        tenantId: me.tenant.id,
        tenantName: me.tenant.name,
        plan,
        rawPlan: me.tenant.plan,
        planValidUntil: me.tenant.planValidUntil?.toISOString() ?? null,
        // The full matrix — every plan + the features it includes
        // and its soft limits. The /admin/billing page renders
        // this as a comparison grid.
        matrix: (["FREE", "PRO", "ENTERPRISE"] as TenantPlan[]).map((p) => ({
          plan: p,
          ...PLAN_METADATA[p],
          features: featuresFor(p),
          limits: {
            ...LIMITS_BY_PLAN[p],
            // JSON-safe: Infinity → null
            maxBranches: Number.isFinite(LIMITS_BY_PLAN[p].maxBranches) ? LIMITS_BY_PLAN[p].maxBranches : null,
            maxStaff: Number.isFinite(LIMITS_BY_PLAN[p].maxStaff) ? LIMITS_BY_PLAN[p].maxStaff : null,
            aiCallsPerMonth: Number.isFinite(LIMITS_BY_PLAN[p].aiCallsPerMonth) ? LIMITS_BY_PLAN[p].aiCallsPerMonth : null,
          },
        })),
        labels: FEATURE_LABELS,
      },
    });
  } catch (error) {
    logger.api("GET", "/api/admin/billing", error);
    return NextResponse.json({ success: false, error: "Failed" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const auth = await requireAuth({ minRole: "SUPER_ADMIN" });
    if (auth.response) return auth.response;

    const body = await request.json().catch(() => ({}));
    const plan = typeof body.plan === "string" ? body.plan : "";
    if (!VALID_PLANS.has(plan)) {
      return NextResponse.json({ success: false, error: "Invalid plan" }, { status: 400 });
    }

    let planValidUntil: Date | null = null;
    if (body.planValidUntil) {
      planValidUntil = new Date(body.planValidUntil);
      if (Number.isNaN(planValidUntil.getTime())) {
        return NextResponse.json({ success: false, error: "Invalid planValidUntil" }, { status: 400 });
      }
    }

    const me = await prisma.user.findUnique({
      where: { id: auth.user.id },
      select: { tenant: { select: { id: true, plan: true } } },
    });
    if (!me?.tenant) return NextResponse.json({ success: false, error: "Tenant not found" }, { status: 404 });

    const updated = await prisma.tenant.update({
      where: { id: me.tenant.id },
      data: {
        plan: plan as TenantPlan,
        planValidUntil,
      },
      select: { plan: true, planValidUntil: true },
    });

    await logAudit({
      userId: auth.user.id,
      action: "CHANGE_PLAN",
      module: "BILLING",
      entityType: "Tenant",
      entityId: me.tenant.id,
      details: {
        from: me.tenant.plan,
        to: updated.plan,
        validUntil: updated.planValidUntil?.toISOString() ?? null,
      },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    logger.api("PUT", "/api/admin/billing", error);
    return NextResponse.json({ success: false, error: "Failed" }, { status: 500 });
  }
}
