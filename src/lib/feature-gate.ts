/**
 * Per-tenant feature gates.
 *
 * Single source of truth for "which features does this tenant
 * have access to?" — used by:
 *   - server-side route guards (`requireFeature()`)
 *   - client-side UI hiding (`useFeature()` hook in auth-context)
 *   - the `/admin/billing` page that renders the matrix
 *
 * Editing the table here is the entire pricing-page change. The
 * route layer + UI re-derive automatically.
 *
 * Plan precedence: ENTERPRISE ⊃ PRO ⊃ FREE. A feature that's in
 * FREE is in every tier; a feature in ENTERPRISE only is locked
 * behind that tier.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { TenantPlan } from "@prisma/client";

/** All gateable features. New features start in PRO or
 *  ENTERPRISE depending on cost / commercial weight; FREE
 *  stays minimal. */
export type Feature =
  // Free baseline — what every clinic gets even on the trial tier
  | "PATIENTS"
  | "APPOINTMENTS"
  | "BILLING"
  | "PHARMACY"
  // Pro tier — the AI / integrations layer
  | "AI_TRANSCRIPTION"
  | "AI_BRIEFING"
  | "PROCEDURE_PROTOCOLS"
  | "COLLABORATION"
  | "WHATSAPP"
  | "DOCTOR_REVENUE"
  | "VITALS_TRENDS"
  | "TIMELINE"
  // Enterprise tier — multi-clinic, advanced AI, compliance tooling
  | "AI_AMBIENT_SCRIBE"
  | "MULTI_BRANCH"
  | "AUDIT_EXPORT"
  | "CUSTOM_BRANDING"
  | "AI_AUDIT_DASHBOARD"
  | "ERROR_LOG_READER";

const FREE_FEATURES: Feature[] = [
  "PATIENTS", "APPOINTMENTS", "BILLING", "PHARMACY",
];

const PRO_FEATURES: Feature[] = [
  ...FREE_FEATURES,
  "AI_TRANSCRIPTION",
  "AI_BRIEFING",
  "PROCEDURE_PROTOCOLS",
  "COLLABORATION",
  "WHATSAPP",
  "DOCTOR_REVENUE",
  "VITALS_TRENDS",
  "TIMELINE",
];

const ENTERPRISE_FEATURES: Feature[] = [
  ...PRO_FEATURES,
  "AI_AMBIENT_SCRIBE",
  "MULTI_BRANCH",
  "AUDIT_EXPORT",
  "CUSTOM_BRANDING",
  "AI_AUDIT_DASHBOARD",
  "ERROR_LOG_READER",
];

const FEATURES_BY_PLAN: Record<TenantPlan, Set<Feature>> = {
  FREE:       new Set(FREE_FEATURES),
  PRO:        new Set(PRO_FEATURES),
  ENTERPRISE: new Set(ENTERPRISE_FEATURES),
};

/** Soft limits per plan. Not enforced as DB CHECKs (would require
 *  per-tenant counters); routes that care look these up directly. */
export const LIMITS_BY_PLAN: Record<TenantPlan, {
  maxBranches: number;
  maxStaff: number;
  aiCallsPerMonth: number;
}> = {
  FREE:       { maxBranches: 1, maxStaff: 10, aiCallsPerMonth: 50 },
  PRO:        { maxBranches: 5, maxStaff: 50, aiCallsPerMonth: 5_000 },
  ENTERPRISE: { maxBranches: Number.POSITIVE_INFINITY, maxStaff: Number.POSITIVE_INFINITY, aiCallsPerMonth: Number.POSITIVE_INFINITY },
};

/** Normalize a tenant's effective plan: if planValidUntil is set
 *  and in the past, the tenant degrades to FREE. */
export function effectivePlan(tenant: { plan: TenantPlan; planValidUntil?: Date | null }): TenantPlan {
  if (tenant.planValidUntil && tenant.planValidUntil.getTime() < Date.now()) return "FREE";
  return tenant.plan;
}

export function hasFeature(plan: TenantPlan, feature: Feature): boolean {
  return FEATURES_BY_PLAN[plan].has(feature);
}

/** All features for a given plan. Used by the billing page to
 *  render the comparison matrix. */
export function featuresFor(plan: TenantPlan): Feature[] {
  return Array.from(FEATURES_BY_PLAN[plan]);
}

/** Server-side gate. Returns null when the user's tenant has the
 *  feature, otherwise a 402 NextResponse. Pattern mirrors
 *  requireAuth(): callers do `if (gate) return gate;`. */
export async function requireFeature(userId: string, feature: Feature): Promise<NextResponse | null> {
  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: { tenant: { select: { plan: true, planValidUntil: true } } },
  });
  if (!me?.tenant) {
    return NextResponse.json(
      { success: false, error: "Tenant not found" },
      { status: 401 },
    );
  }
  const plan = effectivePlan(me.tenant);
  if (!hasFeature(plan, feature)) {
    return NextResponse.json(
      {
        success: false,
        error: `This feature requires a higher plan tier`,
        requiredFeature: feature,
        currentPlan: plan,
      },
      { status: 402 },
    );
  }
  return null;
}

/** Plan display metadata for the /admin/billing page. */
export const PLAN_METADATA: Record<TenantPlan, { label: string; tagline: string; tone: string }> = {
  FREE:       { label: "Free",       tagline: "Trial / single-doctor pilot",         tone: "stone" },
  PRO:        { label: "Pro",        tagline: "Multi-doctor clinic with AI",         tone: "teal" },
  ENTERPRISE: { label: "Enterprise", tagline: "Chains, custom branding, compliance", tone: "violet" },
};

/** Human-readable feature labels for the billing matrix. */
export const FEATURE_LABELS: Record<Feature, string> = {
  PATIENTS: "Patient records",
  APPOINTMENTS: "Appointments + scheduling",
  BILLING: "Invoicing + payments",
  PHARMACY: "Pharmacy inventory",
  AI_TRANSCRIPTION: "AI voice transcription",
  AI_BRIEFING: "AI continuity briefing",
  PROCEDURE_PROTOCOLS: "Procedure protocols",
  COLLABORATION: "Multi-doctor collaboration",
  WHATSAPP: "WhatsApp integration",
  DOCTOR_REVENUE: "Doctor revenue analytics",
  VITALS_TRENDS: "Vitals trend charts",
  TIMELINE: "Patient timeline",
  AI_AMBIENT_SCRIBE: "AI Ambient Scribe v2 (proposals)",
  MULTI_BRANCH: "Multi-branch operations",
  AUDIT_EXPORT: "Audit log CSV export",
  CUSTOM_BRANDING: "Custom logo + footer",
  AI_AUDIT_DASHBOARD: "AI Audit dashboard",
  ERROR_LOG_READER: "Error log reader",
};
