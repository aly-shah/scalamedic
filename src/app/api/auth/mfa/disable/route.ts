/**
 * @system MediCore ERP — Disable MFA
 * @route POST /api/auth/mfa/disable
 *
 * Requires the user's current password as proof — disabling MFA
 * from inside an already-authenticated session shouldn't be a
 * one-click action because anyone who's hijacked a session would
 * otherwise turn off the very thing protecting the account.
 *
 * Admins can also reset another user's MFA via a separate admin-
 * only endpoint (out of scope for this iteration); doctors who
 * lose their authenticator must contact admin.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/require-auth";
import { verifyPassword } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { logger } from "@/lib/logger";

export async function POST(request: Request) {
  try {
    const auth = await requireAuth();
    if (auth.response) return auth.response;

    const body = await request.json().catch(() => ({}));
    const password = typeof body.password === "string" ? body.password : "";
    if (!password) {
      return NextResponse.json(
        { success: false, error: "Password required" },
        { status: 400 },
      );
    }

    const dbUser = await prisma.user.findUnique({
      where: { id: auth.user.id },
      select: { passwordHash: true, mfaEnabled: true },
    });
    if (!dbUser) {
      return NextResponse.json({ success: false, error: "User not found" }, { status: 404 });
    }
    if (!dbUser.mfaEnabled) {
      return NextResponse.json(
        { success: false, error: "MFA is not enabled" },
        { status: 400 },
      );
    }

    const ok = await verifyPassword(password, dbUser.passwordHash);
    if (!ok) {
      return NextResponse.json(
        { success: false, error: "Wrong password" },
        { status: 401 },
      );
    }

    await prisma.user.update({
      where: { id: auth.user.id },
      data: {
        mfaEnabled: false,
        mfaSecretCiphertext: null,
        mfaSecretIv: null,
        mfaSecretAuthTag: null,
        mfaEnrolledAt: null,
      },
    });

    await logAudit({
      userId: auth.user.id,
      action: "DISABLE_MFA",
      module: "USER",
      entityType: "User",
      entityId: auth.user.id,
      details: {},
    });

    return NextResponse.json({ success: true, data: { mfaEnabled: false } });
  } catch (error) {
    logger.error("MFA disable failed", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
