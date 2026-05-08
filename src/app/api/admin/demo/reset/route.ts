/**
 * @system MediCore ERP — Demo tenant reset
 * @route POST /api/admin/demo/reset
 *
 * SUPER_ADMIN only. Wipes the caller's tenant clinical data and
 * regenerates a fresh demo dataset (~40 patients, appointments,
 * notes, prescriptions, invoices). Refuses to run unless the tenant
 * is marked isDemo=true — the seeder enforces this too, but we
 * short-circuit at the route layer for a cleaner error.
 *
 * Body: optional `{ password?: string }` to set the demo-user
 * password. Defaults to "demo1234" so the staging "Try demo" CTA
 * has stable credentials to point at.
 *
 * Returns the seed summary (counts of users / patients / appointments
 * / etc.) so the caller can render a confirmation toast.
 */
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/require-auth";
import { prisma } from "@/lib/prisma";
import { seedDemoTenant } from "@/lib/demo-seed";
import { logger } from "@/lib/logger";
import { logAudit } from "@/lib/audit";

export async function POST(request: Request) {
  try {
    const auth = await requireAuth({ minRole: "SUPER_ADMIN" });
    if (auth.response) return auth.response;

    const body = await request.json().catch(() => ({}));
    const password = typeof body?.password === "string" && body.password.length >= 8
      ? body.password
      : "demo1234";

    // Session doesn't carry tenantId; resolve via the user's branch.
    const me = await prisma.user.findUnique({
      where: { id: auth.user.id },
      select: { tenantId: true },
    });
    if (!me) {
      return NextResponse.json({ success: false, error: "User not found" }, { status: 404 });
    }
    const tenant = await prisma.tenant.findUnique({
      where: { id: me.tenantId },
      select: { id: true, isDemo: true, name: true },
    });
    if (!tenant) {
      return NextResponse.json(
        { success: false, error: "Tenant not found" },
        { status: 404 },
      );
    }
    if (!tenant.isDemo) {
      return NextResponse.json(
        { success: false, error: "Tenant is not marked as demo. Reset refused." },
        { status: 403 },
      );
    }

    const summary = await seedDemoTenant({ tenantId: tenant.id, password });

    await logAudit({
      userId: auth.user.id,
      action: "DEMO_RESET",
      module: "ADMIN",
      entityType: "Tenant",
      entityId: tenant.id,
      details: { tenant: tenant.name, ...summary },
    });

    return NextResponse.json({ success: true, data: summary });
  } catch (error) {
    logger.api("POST", "/api/admin/demo/reset", error);
    return NextResponse.json(
      { success: false, error: "Failed to reset demo tenant" },
      { status: 500 },
    );
  }
}
