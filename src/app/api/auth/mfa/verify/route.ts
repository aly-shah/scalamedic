/**
 * @system MediCore ERP — Verify enrollment code & enable MFA
 * @route POST /api/auth/mfa/verify
 *
 * Body: { enrollmentToken, code }
 *
 * Decodes the short-lived enrollment token (issued by /enroll),
 * validates the 6-digit TOTP code against the staged secret, and
 * if it matches, persists the encrypted secret + flips
 * mfaEnabled=true on the user row.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/require-auth";
import { decryptSecret } from "@/lib/mfa-crypto";
import { verifyCode } from "@/lib/totp";
import { logger } from "@/lib/logger";
import { logAudit } from "@/lib/audit";
import { jwtVerify } from "jose";

const SECRET = new TextEncoder().encode(process.env.AUTH_SECRET);

export async function POST(request: Request) {
  try {
    const auth = await requireAuth();
    if (auth.response) return auth.response;

    const body = await request.json().catch(() => ({}));
    const enrollmentToken = typeof body.enrollmentToken === "string" ? body.enrollmentToken : "";
    const code = typeof body.code === "string" ? body.code : "";
    if (!enrollmentToken || !code) {
      return NextResponse.json(
        { success: false, error: "enrollmentToken and code are required" },
        { status: 400 },
      );
    }

    let payload: Record<string, unknown>;
    try {
      const { payload: p } = await jwtVerify(enrollmentToken, SECRET);
      payload = p as Record<string, unknown>;
    } catch {
      return NextResponse.json(
        { success: false, error: "Enrollment token expired — start over" },
        { status: 401 },
      );
    }

    if (payload.purpose !== "mfa-enrollment" || payload.userId !== auth.user.id) {
      return NextResponse.json(
        { success: false, error: "Invalid enrollment token" },
        { status: 401 },
      );
    }

    const ciphertext = String(payload.ciphertext ?? "");
    const iv = String(payload.iv ?? "");
    const authTag = String(payload.authTag ?? "");
    if (!ciphertext || !iv || !authTag) {
      return NextResponse.json(
        { success: false, error: "Invalid enrollment token" },
        { status: 401 },
      );
    }

    const secret = decryptSecret({ ciphertext, iv, authTag });
    if (!verifyCode(secret, code)) {
      return NextResponse.json(
        { success: false, error: "Invalid code — check your authenticator and try again" },
        { status: 401 },
      );
    }

    await prisma.user.update({
      where: { id: auth.user.id },
      data: {
        mfaEnabled: true,
        mfaSecretCiphertext: ciphertext,
        mfaSecretIv: iv,
        mfaSecretAuthTag: authTag,
        mfaEnrolledAt: new Date(),
      },
    });

    await logAudit({
      userId: auth.user.id,
      action: "ENABLE_MFA",
      module: "USER",
      entityType: "User",
      entityId: auth.user.id,
      details: {},
    });

    return NextResponse.json({ success: true, data: { mfaEnabled: true } });
  } catch (error) {
    logger.error("MFA verify failed", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
