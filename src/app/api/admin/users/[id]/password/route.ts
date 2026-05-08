/**
 * @system MediCore ERP — Admin password reset for any user
 * @route POST /api/admin/users/[id]/password — Admin/SuperAdmin sets a new password for the target user
 *
 * No current-password check — this is the admin override path used when a
 * staff member has forgotten their password. Audit-logged, gated to ADMIN
 * and SUPER_ADMIN. SUPER_ADMIN's password can only be reset by another
 * SUPER_ADMIN.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/require-auth";
import { hashPassword } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { adminResetPasswordSchema, validate } from "@/lib/validations";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth({ roles: ["SUPER_ADMIN", "ADMIN"] });
    if (auth.response) return auth.response;

    const { id } = await params;

    const body = await request.json();
    const v = validate(adminResetPasswordSchema, body);
    if (!v.success) {
      return NextResponse.json({ success: false, error: v.error }, { status: 400 });
    }

    const target = await prisma.user.findUnique({
      where: { id },
      select: { id: true, role: true, email: true },
    });
    if (!target) {
      return NextResponse.json({ success: false, error: "User not found" }, { status: 404 });
    }

    if (target.role === "SUPER_ADMIN" && auth.user.role !== "SUPER_ADMIN") {
      return NextResponse.json(
        { success: false, error: "Only a Super Admin can reset another Super Admin's password" },
        { status: 403 },
      );
    }

    const passwordHash = await hashPassword(v.data.newPassword);
    await prisma.user.update({ where: { id: target.id }, data: { passwordHash } });

    await logAudit({
      userId: auth.user.id,
      action: "PASSWORD_RESET",
      module: "STAFF",
      entityType: "User",
      entityId: target.id,
      details: { targetEmail: target.email },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.api("POST", "/api/admin/users/[id]/password", error);
    return NextResponse.json({ success: false, error: "Failed" }, { status: 500 });
  }
}
