/**
 * @system MediCore ERP — Begin MFA enrollment
 * @route POST /api/auth/mfa/enroll
 *
 * Generates a fresh TOTP secret for the calling user, returns the
 * base32 secret + an otpauth:// URI suitable for QR rendering, and
 * stages the encrypted secret as a *pending* enrollment. The user
 * must subsequently call /api/auth/mfa/verify with a 6-digit code
 * proving they've configured the authenticator app — only then is
 * `mfaEnabled` flipped to true.
 *
 * Idempotent for already-enrolled users: returns 409 since
 * disabling first is a separate action that requires the password.
 *
 * Pending state model: rather than adding more columns, we store
 * the freshly-generated ciphertext directly into the user row but
 * keep `mfaEnabled = false` until /verify confirms. The CHECK
 * constraint on the table allows this transitory shape.
 *
 * Wait — actually our v35 CHECK requires either ALL secret cols
 * NULL (disabled) OR ALL set + mfaEnabled (enabled). To keep the
 * "pending" state we therefore stash the new secret in a separate
 * short-lived JWT instead of touching the DB. The JWT carries the
 * encrypted secret components and the userId; /verify decodes it,
 * checks the code, and persists.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/require-auth";
import { encryptSecret } from "@/lib/mfa-crypto";
import { generateSecret, otpauthURL } from "@/lib/totp";
import { logger } from "@/lib/logger";
import { SignJWT } from "jose";

const SECRET = new TextEncoder().encode(process.env.AUTH_SECRET);

export async function POST() {
  try {
    const auth = await requireAuth();
    if (auth.response) return auth.response;

    const dbUser = await prisma.user.findUnique({
      where: { id: auth.user.id },
      select: { id: true, email: true, mfaEnabled: true },
    });
    if (!dbUser) {
      return NextResponse.json({ success: false, error: "User not found" }, { status: 404 });
    }
    if (dbUser.mfaEnabled) {
      return NextResponse.json(
        { success: false, error: "MFA already enabled. Disable it first to re-enroll." },
        { status: 409 },
      );
    }

    const secret = generateSecret();
    const encrypted = encryptSecret(secret);
    const uri = otpauthURL({
      secret,
      account: dbUser.email,
      issuer: "ScalaMedic",
    });

    // Stash the encrypted components in a short-lived enrollment
    // token rather than the user row. The verify endpoint will
    // decode this, check the code, and *then* persist.
    const enrollmentToken = await new SignJWT({
      userId: dbUser.id,
      purpose: "mfa-enrollment",
      ciphertext: encrypted.ciphertext,
      iv: encrypted.iv,
      authTag: encrypted.authTag,
    } as Record<string, unknown>)
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("10m")
      .sign(SECRET);

    return NextResponse.json({
      success: true,
      data: {
        secret,           // shown to the user as a fallback (manual entry)
        otpauthUrl: uri,  // for QR
        enrollmentToken,  // opaque, hand back to /verify
      },
    });
  } catch (error) {
    logger.error("MFA enroll start failed", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
