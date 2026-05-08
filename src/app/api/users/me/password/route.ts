/**
 * @system MediCore ERP — Self-service password change
 * @route POST /api/users/me/password — Authenticated user changes their own password
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/require-auth";
import { hashPassword, verifyPassword } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { changePasswordSchema, validate } from "@/lib/validations";

export async function POST(request: Request) {
  try {
    const auth = await requireAuth();
    if (auth.response) return auth.response;

    const body = await request.json();
    const v = validate(changePasswordSchema, body);
    if (!v.success) {
      return NextResponse.json({ success: false, error: v.error }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { id: auth.user.id },
      select: { id: true, passwordHash: true },
    });
    if (!user) {
      return NextResponse.json({ success: false, error: "User not found" }, { status: 404 });
    }

    const ok = await verifyPassword(v.data.currentPassword, user.passwordHash);
    if (!ok) {
      return NextResponse.json({ success: false, error: "Current password is incorrect" }, { status: 401 });
    }

    if (v.data.currentPassword === v.data.newPassword) {
      return NextResponse.json({ success: false, error: "New password must differ from current" }, { status: 400 });
    }

    const passwordHash = await hashPassword(v.data.newPassword);
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });

    await logAudit({
      userId: auth.user.id,
      action: "PASSWORD_CHANGED",
      module: "AUTH",
      entityType: "User",
      entityId: auth.user.id,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.api("POST", "/api/users/me/password", error);
    return NextResponse.json({ success: false, error: "Failed" }, { status: 500 });
  }
}
