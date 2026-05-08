/**
 * @system MediCore ERP — Role permission overrides
 * @route GET    /api/admin/role-permissions  — list all overrides
 * @route PUT    /api/admin/role-permissions  — upsert one override
 * @route DELETE /api/admin/role-permissions?role=&moduleId=&action= — clear
 *
 * Powers the click-to-toggle chips on /admin/roles. Each override
 * forces (role, moduleId, action) to a specific granted value
 * regardless of what the static module definition says. Absence of
 * a row means "use the default from the module def".
 *
 * Read endpoint is open to any authenticated user (the registry
 * needs to read overrides on app boot to compute access correctly).
 * Write endpoints require ADMIN / SUPER_ADMIN — same gate as the
 * staff edit endpoint.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/require-auth";
import { logger } from "@/lib/logger";
import { logAudit } from "@/lib/audit";

const ACTION_VALUES = ["VIEW", "CREATE", "EDIT", "DELETE", "EXPORT"] as const;
const ROLE_VALUES = [
  "SUPER_ADMIN", "ADMIN", "DOCTOR", "RECEPTIONIST", "BILLING",
  "CALL_CENTER", "ASSISTANT", "AESTHETICIAN", "OPERATOR",
] as const;

const upsertSchema = z.object({
  role: z.enum(ROLE_VALUES),
  moduleId: z.string().min(1).max(60),
  action: z.enum(ACTION_VALUES),
  granted: z.boolean(),
});

export async function GET() {
  try {
    const auth = await requireAuth();
    if (auth.response) return auth.response;

    const overrides = await prisma.rolePermissionOverride.findMany({
      orderBy: [{ role: "asc" }, { moduleId: "asc" }, { action: "asc" }],
    });
    return NextResponse.json({ success: true, data: overrides });
  } catch (error) {
    logger.api("GET", "/api/admin/role-permissions", error);
    return NextResponse.json(
      { success: false, error: "Failed to load overrides" },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const auth = await requireAuth({ roles: ["SUPER_ADMIN", "ADMIN"] });
    if (auth.response) return auth.response;

    const body = await request.json();
    const parsed = upsertSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues.map((i) => i.message).join(", ") },
        { status: 400 }
      );
    }
    const d = parsed.data;

    const override = await prisma.rolePermissionOverride.upsert({
      where: {
        role_moduleId_action: {
          role: d.role,
          moduleId: d.moduleId,
          action: d.action,
        },
      },
      create: {
        role: d.role,
        moduleId: d.moduleId,
        action: d.action,
        granted: d.granted,
        createdById: auth.user.id,
      },
      // Don't overwrite createdById on update — keep the original
      // creator. AuditLog already records each PUT with the actor.
      update: { granted: d.granted },
    });

    await logAudit({
      userId: auth.user.id,
      action: "PERMISSION_OVERRIDE",
      module: "ADMIN",
      entityType: "RolePermissionOverride",
      entityId: override.id,
      details: { role: d.role, moduleId: d.moduleId, action: d.action, granted: d.granted },
    });

    return NextResponse.json({ success: true, data: override });
  } catch (error) {
    logger.api("PUT", "/api/admin/role-permissions", error);
    return NextResponse.json(
      { success: false, error: "Failed to save override" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const auth = await requireAuth({ roles: ["SUPER_ADMIN", "ADMIN"] });
    if (auth.response) return auth.response;

    const { searchParams } = new URL(request.url);
    const role = searchParams.get("role");
    const moduleId = searchParams.get("moduleId");
    const action = searchParams.get("action");

    if (!role || !moduleId || !action) {
      return NextResponse.json(
        { success: false, error: "role, moduleId, action are required" },
        { status: 400 }
      );
    }
    if (!ROLE_VALUES.includes(role as typeof ROLE_VALUES[number])) {
      return NextResponse.json({ success: false, error: "invalid role" }, { status: 400 });
    }
    if (!ACTION_VALUES.includes(action as typeof ACTION_VALUES[number])) {
      return NextResponse.json({ success: false, error: "invalid action" }, { status: 400 });
    }

    // deleteMany so missing rows don't 404 — idempotent.
    const res = await prisma.rolePermissionOverride.deleteMany({
      where: { role: role as typeof ROLE_VALUES[number], moduleId, action },
    });

    await logAudit({
      userId: auth.user.id,
      action: "PERMISSION_OVERRIDE_CLEAR",
      module: "ADMIN",
      entityType: "RolePermissionOverride",
      entityId: `${role}:${moduleId}:${action}`,
      details: { role, moduleId, action, removed: res.count },
    });

    return NextResponse.json({ success: true, removed: res.count });
  } catch (error) {
    logger.api("DELETE", "/api/admin/role-permissions", error);
    return NextResponse.json(
      { success: false, error: "Failed to clear override" },
      { status: 500 }
    );
  }
}
