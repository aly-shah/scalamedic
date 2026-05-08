/**
 * @system MediCore ERP — Tenant onboarding (self-serve)
 * @route POST /api/tenant/onboard
 *
 * Public endpoint that provisions a brand-new tenant in one go:
 *
 *   Tenant (FREE plan)
 *     → TenantHostname (if hostname provided)
 *     → Branch (default "Main Clinic" if no name given)
 *     → User (role=ADMIN, sets the session cookie on success)
 *
 * Anti-abuse: if env TENANT_ONBOARD_TOKEN is set, the request body
 * must include `inviteToken` matching it; otherwise signup is open
 * (single-tenant deployments / dev). Slug + hostname uniqueness is
 * enforced atomically by the underlying unique indexes.
 *
 * On success returns the new admin's session user payload — the
 * caller can immediately route to /dashboard. The session cookie
 * is set on this response.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword, setSessionCookie } from "@/lib/auth";
import { tenantOnboardSchema, validate } from "@/lib/validations";
import { logger } from "@/lib/logger";
import { logAudit } from "@/lib/audit";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

// Slugs we never let a tenant claim because they collide with our own
// route paths or platform-reserved URLs. Lowercase, exact match.
const RESERVED_SLUGS = new Set([
  "api", "www", "admin", "dashboard", "login", "signup", "signin", "signout",
  "logout", "auth", "get-started", "portal", "doctor-app", "qr", "review",
  "thank-you", "accept-invite", "settings", "billing", "calendar", "patients",
  "appointments", "consultation", "pharmacy", "rooms", "vitals", "follow-ups",
  "lab-results", "call-center", "ai", "platform", "scalamedic", "scalamatic",
  "demo", "test", "staging", "support", "help", "docs", "blog", "status",
  "_next", "favicon", "robots", "sitemap",
]);

function clientIp(request: Request): string {
  // App sits behind nginx — request.url reports localhost. The CDN /
  // reverse proxy forwards the real IP via x-forwarded-for; first
  // entry is the client.
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

export async function POST(request: Request) {
  try {
    // Rate limit BEFORE parsing the body so a flood of malformed
    // requests still gets bucketed. Bucket key is client IP since
    // there's no session yet.
    const ip = clientIp(request);
    const rl = checkRateLimit(ip, RATE_LIMITS.TENANT_ONBOARD);
    if (!rl.ok) {
      return NextResponse.json(
        { success: false, error: `Too many onboarding attempts. Try again in ${Math.ceil(rl.retryAfter / 60)} min.` },
        { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
      );
    }

    const body = await request.json();
    const v = validate(tenantOnboardSchema, body);
    if (!v.success) {
      return NextResponse.json({ success: false, error: v.error }, { status: 400 });
    }
    const data = v.data;

    // Invite token gate (only enforced when env is set).
    const expectedToken = process.env.TENANT_ONBOARD_TOKEN;
    if (expectedToken && data.inviteToken !== expectedToken) {
      return NextResponse.json(
        { success: false, error: "Invalid invite token" },
        { status: 403 },
      );
    }

    const slug = data.slug.toLowerCase();
    if (RESERVED_SLUGS.has(slug)) {
      return NextResponse.json(
        { success: false, error: "That slug is reserved. Pick a different one." },
        { status: 409 },
      );
    }
    const adminEmail = data.adminEmail.toLowerCase().trim();
    const hostname = data.hostname?.toLowerCase().trim() || null;

    // Pre-check uniqueness so we return clean errors instead of
    // surfacing raw P2002 constraint violations.
    const existingTenant = await prisma.tenant.findUnique({ where: { slug } });
    if (existingTenant) {
      return NextResponse.json(
        { success: false, error: "That slug is already taken. Pick a different one." },
        { status: 409 },
      );
    }
    if (hostname) {
      const existingHost = await prisma.tenantHostname.findUnique({ where: { hostname } });
      if (existingHost) {
        return NextResponse.json(
          { success: false, error: "That hostname is already linked to another workspace." },
          { status: 409 },
        );
      }
    }

    const passwordHash = await hashPassword(data.adminPassword);
    // Branch code: derive from slug, capped to 10 chars (DB constraint).
    // If two new tenants pick the same first 10 slug chars we re-derive
    // with a numeric suffix on the create.
    const branchCodeBase = slug.toUpperCase().replace(/-/g, "").slice(0, 8) || "MAIN";

    const result = await prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          slug,
          name: data.tenantName,
          shortName: data.tenantName.split(" ")[0]?.slice(0, 60) || null,
          plan: "FREE",
          mfaIssuer: data.tenantName.slice(0, 60),
          isActive: true,
          isDemo: false,
        },
      });

      // v53: branch codes are per-tenant unique, so a brand-new
      // tenant always gets a clean slate. No retry loop needed.
      const branch = await tx.branch.create({
        data: {
          name: data.branchName || "Main Clinic",
          code: branchCodeBase,
          address: data.branchAddress || "—",
          phone: data.branchPhone || "—",
          email: adminEmail,
          tenantId: tenant.id,
          isActive: true,
        },
      });

      const user = await tx.user.create({
        data: {
          email: adminEmail,
          passwordHash,
          name: data.adminName,
          role: "ADMIN",
          branchId: branch.id,
          tenantId: tenant.id,
          isActive: true,
        },
        include: { branch: true },
      });

      if (hostname) {
        await tx.tenantHostname.create({
          data: { tenantId: tenant.id, hostname, isPrimary: true },
        });
      }

      return { tenant, user };
    });

    const sessionUser = {
      id: result.user.id,
      email: result.user.email,
      name: result.user.name,
      role: result.user.role,
      branchId: result.user.branchId,
      branchName: result.user.branch.name,
    };
    await setSessionCookie(sessionUser);

    await logAudit({
      userId: result.user.id,
      action: "TENANT_PROVISIONED",
      module: "ADMIN",
      entityType: "Tenant",
      entityId: result.tenant.id,
      details: {
        slug: result.tenant.slug,
        name: result.tenant.name,
        hostname,
        ip,
        adminEmail,
      },
    });

    return NextResponse.json(
      {
        success: true,
        data: {
          user: sessionUser,
          tenant: { id: result.tenant.id, slug: result.tenant.slug, name: result.tenant.name },
          hostname,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    logger.api("POST", "/api/tenant/onboard", error);
    return NextResponse.json(
      { success: false, error: "Failed to provision tenant" },
      { status: 500 },
    );
  }
}
