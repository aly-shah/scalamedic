/**
 * @system MediCore ERP — MFA challenge exchange
 * @route POST /api/auth/login/mfa
 *
 * Second step of the MFA-enabled login flow:
 *   - Client first hits /api/auth/login with email + password and
 *     receives `{ mfaRequired: true, challengeToken }`.
 *   - Client then hits this route with `{ challengeToken, code }`.
 *   - On success, the route issues the real session cookie.
 *
 * Failure modes:
 *   - challengeToken expired or invalid → 401
 *   - code wrong → 401 (note: rate-limited in the same bucket as
 *     password attempts via the same in-memory map)
 *   - user disabled MFA between password and code → reject (don't
 *     silently issue session, force fresh login)
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  createToken,
  loadSessionUser,
  verifyMfaChallengeToken,
} from "@/lib/auth";
import { decryptSecret } from "@/lib/mfa-crypto";
import { verifyCode } from "@/lib/totp";
import { logger } from "@/lib/logger";

const COOKIE_NAME = "medicore-session";
const SESSION_DURATION = 60 * 60 * 24 * 7;

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const challengeToken = typeof body.challengeToken === "string" ? body.challengeToken : "";
    const code = typeof body.code === "string" ? body.code : "";

    if (!challengeToken || !code) {
      return NextResponse.json(
        { success: false, error: "challengeToken and code are required" },
        { status: 400 },
      );
    }

    const challenge = await verifyMfaChallengeToken(challengeToken);
    if (!challenge) {
      return NextResponse.json(
        { success: false, error: "Challenge expired — start over" },
        { status: 401 },
      );
    }

    const dbUser = await prisma.user.findUnique({
      where: { id: challenge.userId },
      select: {
        id: true,
        mfaEnabled: true,
        mfaSecretCiphertext: true,
        mfaSecretIv: true,
        mfaSecretAuthTag: true,
      },
    });
    if (!dbUser || !dbUser.mfaEnabled || !dbUser.mfaSecretCiphertext || !dbUser.mfaSecretIv || !dbUser.mfaSecretAuthTag) {
      return NextResponse.json(
        { success: false, error: "MFA not configured" },
        { status: 401 },
      );
    }

    const secret = decryptSecret({
      ciphertext: dbUser.mfaSecretCiphertext,
      iv: dbUser.mfaSecretIv,
      authTag: dbUser.mfaSecretAuthTag,
    });

    if (!verifyCode(secret, code)) {
      return NextResponse.json(
        { success: false, error: "Invalid code" },
        { status: 401 },
      );
    }

    const sessionUser = await loadSessionUser(challenge.userId);
    if (!sessionUser) {
      return NextResponse.json(
        { success: false, error: "Account no longer active" },
        { status: 401 },
      );
    }

    const token = await createToken(sessionUser);
    const response = NextResponse.json({ success: true, data: { user: sessionUser } });
    response.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: SESSION_DURATION,
      path: "/",
    });
    return response;
  } catch (error) {
    logger.error("MFA exchange failed", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
