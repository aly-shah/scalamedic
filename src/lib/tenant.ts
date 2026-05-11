/**
 * Tenant resolution.
 *
 * The platform is multi-tenant-ready: every Branch belongs to a
 * Tenant, every User inherits their tenant via their branch, and
 * brand assets (logo, names, OTP issuer, footer credit) are read
 * from the tenant row at runtime.
 *
 * Today the deployment runs as a single tenant ("Nakhoda") so
 * `getCurrentTenant()` resolves either:
 *   - From the authenticated user's tenantId (preferred path), or
 *   - The single active tenant if the call is unauthenticated
 *     (login page asks for branding before the user is logged in)
 *
 * Future SaaS expansion adds hostname-based resolution
 * (clinic-a.scalamedic.com → tenant slug "clinic-a"); the
 * `resolveBy*` helpers below stage that path.
 */
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

// Public-safe tenant view. Fields the client may render directly
// without re-fetching from the API.
export interface TenantBrand {
  id: string;
  slug: string;
  name: string;
  legalName: string | null;
  shortName: string | null;
  logoUrl: string | null;
  /** v62: horizontal wordmark for wide surfaces (printed receipt).
   *  When null the receipt falls back to logoUrl, then to a text
   *  masthead. logoUrl stays the canonical square-ish brand mark
   *  used by favicon / topbar / login hero. */
  wordmarkUrl: string | null;
  faviconUrl: string | null;
  mfaIssuer: string | null;
  poweredByLine: string | null;
  primaryColor: string | null;
  // SaaS plan tier — drives client-side feature hiding via
  // useFeature(). Exposed here (rather than via a separate
  // /api/billing endpoint) so a single /me round-trip hydrates
  // the entire UI shell. The server still enforces via
  // requireFeature(); the client gate is purely cosmetic.
  plan: "FREE" | "PRO" | "ENTERPRISE";
  /** ISO timestamp when the plan expires; null = active forever. */
  planValidUntil: string | null;
  /** Demo workspace flag — drives the top-banner warning + the
   *  login page's "Try the demo" CTA. */
  isDemo: boolean;
  /** ISO 4217 currency code (e.g. "PKR", "USD"). Drives the currency
   *  symbol + amount formatting in lib/utils.ts:formatCurrency(). */
  currency: string;
  /** BCP 47 locale tag (e.g. "en-PK", "en-US"). Drives grouping +
   *  decimal rules in Intl.NumberFormat. Kept separate from currency
   *  because the two can validly cross (en-US tenant invoicing PKR). */
  locale: string;
  /** Tax scheme key ("PK" | "US"). lib/tax-rates.ts looks rates up by
   *  this; future regions get added there alongside this field's
   *  CHECK constraint in the v61 migration. */
  taxScheme: "PK" | "US";
}

const PLATFORM_DEFAULTS: Omit<TenantBrand, "id" | "slug"> = {
  name: "ScalaMedic",
  legalName: null,
  shortName: "ScalaMedic",
  logoUrl: null,
  wordmarkUrl: null,
  faviconUrl: null,
  mfaIssuer: "ScalaMedic",
  poweredByLine: "Powered by ScalaMedic",
  primaryColor: null,
  plan: "ENTERPRISE",
  planValidUntil: null,
  isDemo: false,
  currency: "PKR",
  locale: "en-PK",
  taxScheme: "PK",
};

function publicView(t: {
  id: string;
  slug: string;
  name: string;
  legalName: string | null;
  shortName: string | null;
  logoUrl: string | null;
  wordmarkUrl?: string | null;
  faviconUrl: string | null;
  mfaIssuer: string | null;
  poweredByLine: string | null;
  primaryColor: string | null;
  plan?: "FREE" | "PRO" | "ENTERPRISE";
  planValidUntil?: Date | null;
  isDemo?: boolean;
  currency?: string;
  locale?: string;
  taxScheme?: string;
}): TenantBrand {
  // Apply the same expiry-degrade logic feature-gate.ts uses, so
  // the client and server agree on what plan is "live".
  let plan: "FREE" | "PRO" | "ENTERPRISE" = t.plan ?? "ENTERPRISE";
  if (t.planValidUntil && t.planValidUntil.getTime() < Date.now()) plan = "FREE";
  // taxScheme widening: the column type is VARCHAR(2) with a CHECK
  // CHECK ("taxScheme" IN ('PK','US')), so by construction the value
  // is one of those two — but TS sees it as `string`. Narrow here.
  const taxScheme: "PK" | "US" = t.taxScheme === "US" ? "US" : "PK";
  return {
    id: t.id,
    slug: t.slug,
    name: t.name,
    legalName: t.legalName,
    shortName: t.shortName ?? t.name,
    logoUrl: t.logoUrl,
    wordmarkUrl: t.wordmarkUrl ?? null,
    faviconUrl: t.faviconUrl,
    mfaIssuer: t.mfaIssuer ?? PLATFORM_DEFAULTS.mfaIssuer,
    poweredByLine: t.poweredByLine ?? PLATFORM_DEFAULTS.poweredByLine,
    primaryColor: t.primaryColor,
    plan,
    planValidUntil: t.planValidUntil ? t.planValidUntil.toISOString() : null,
    isDemo: t.isDemo ?? false,
    currency: t.currency ?? PLATFORM_DEFAULTS.currency,
    locale: t.locale ?? PLATFORM_DEFAULTS.locale,
    taxScheme,
  };
}

const TENANT_SELECT = {
  id: true,
  slug: true,
  name: true,
  legalName: true,
  shortName: true,
  logoUrl: true,
  wordmarkUrl: true,
  faviconUrl: true,
  mfaIssuer: true,
  poweredByLine: true,
  primaryColor: true,
  plan: true,
  planValidUntil: true,
  isDemo: true,
  currency: true,
  locale: true,
  taxScheme: true,
} as const;

/**
 * Resolve the tenant for the current request. Order:
 *   1. Authenticated session → user's tenantId (most authoritative)
 *   2. Inbound Host header → tenant_hostnames lookup (pre-auth
 *      path; the login page hero needs the right brand BEFORE
 *      anyone has a session)
 *   3. Single-tenant fallback → the only active row
 *   4. Hard fallback → platform defaults
 *
 * Hostname resolution runs in the Node runtime (route handlers)
 * not the edge middleware — Prisma isn't edge-compatible.
 */
export async function getCurrentTenant(): Promise<TenantBrand> {
  const session = await getSession();
  if (session?.user) {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { tenant: { select: TENANT_SELECT } },
    });
    if (user?.tenant) return publicView(user.tenant);
  }
  // Pre-auth: try the Host header. Works in route handlers; the
  // import is dynamic so callers outside a request context (cron
  // jobs, scripts) don't crash on the missing context.
  try {
    const { headers } = await import("next/headers");
    const h = await headers();
    const host = h.get("host");
    if (host) {
      const t = await resolveByHostname(host);
      if (t) return t;
    }
  } catch { /* outside a request context — fall through */ }
  return resolveSingleTenant();
}

/**
 * Single-tenant resolution: returns the only active tenant. If
 * there are 2+ active tenants this is ambiguous and we fall back
 * to platform defaults; the API caller is expected to use one of
 * the explicit resolvers below in that situation.
 */
export async function resolveSingleTenant(): Promise<TenantBrand> {
  const tenants = await prisma.tenant.findMany({
    where: { isActive: true },
    select: TENANT_SELECT,
    take: 2, // we only need to know "is there exactly one?"
  });
  if (tenants.length === 1) return publicView(tenants[0]);
  return platformDefaultBrand();
}

/** Resolve by slug — used by hostname / path-based dispatch. */
export async function resolveBySlug(slug: string): Promise<TenantBrand | null> {
  const t = await prisma.tenant.findUnique({
    where: { slug },
    select: TENANT_SELECT,
  });
  return t ? publicView(t) : null;
}

/**
 * Resolve a tenant by an inbound HTTP Host header. The lookup
 * ignores port numbers (e.g. "localhost:3000" → "localhost") so
 * dev and behind-nginx prod both work. Returns null on miss.
 */
export async function resolveByHostname(rawHost: string): Promise<TenantBrand | null> {
  if (!rawHost) return null;
  const host = rawHost.toLowerCase().split(":")[0].trim();
  if (!host) return null;
  const row = await prisma.tenantHostname.findUnique({
    where: { hostname: host },
    select: { tenant: { select: TENANT_SELECT } },
  });
  return row?.tenant ? publicView(row.tenant) : null;
}

/** Cheap version for middleware: tenantId only, no brand. */
export async function tenantIdForHostname(rawHost: string): Promise<string | null> {
  if (!rawHost) return null;
  const host = rawHost.toLowerCase().split(":")[0].trim();
  if (!host) return null;
  const row = await prisma.tenantHostname.findUnique({
    where: { hostname: host },
    select: { tenantId: true },
  });
  return row?.tenantId ?? null;
}

function platformDefaultBrand(): TenantBrand {
  return {
    id: "00000000-0000-0000-0000-000000000000",
    slug: "platform",
    ...PLATFORM_DEFAULTS,
    plan: "ENTERPRISE",
    planValidUntil: null,
    isDemo: false,
  };
}

/**
 * Derive a user's tenantId from their branch. Used by user-create
 * paths that don't currently accept tenantId in their input — the
 * branch is the canonical source of tenant scope, and user.tenantId
 * is a denormalized convenience FK.
 */
export async function tenantIdForBranch(branchId: string): Promise<string> {
  const branch = await prisma.branch.findUnique({
    where: { id: branchId },
    select: { tenantId: true },
  });
  if (!branch) throw new Error(`Branch ${branchId} not found`);
  return branch.tenantId;
}

/**
 * Resolve the tenantId for an admin "create branch" call. In the
 * single-tenant deployment we always use the only active tenant.
 * Multi-tenant deployments will route this from the request host
 * or admin's own tenant.
 */
export async function defaultTenantId(): Promise<string> {
  const tenants = await prisma.tenant.findMany({
    where: { isActive: true },
    select: { id: true },
    take: 2,
  });
  if (tenants.length === 1) return tenants[0].id;
  if (tenants.length > 1) {
    throw new Error("Multiple active tenants — pass tenantId explicitly");
  }
  throw new Error("No active tenant configured");
}
