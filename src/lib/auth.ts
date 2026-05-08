import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { randomBytes, createHash } from "crypto";
import { prisma } from "./prisma";

if (!process.env.AUTH_SECRET) {
  throw new Error("AUTH_SECRET environment variable is required");
}
const SECRET = new TextEncoder().encode(process.env.AUTH_SECRET);
const COOKIE_NAME = "medicore-session";
const SESSION_DURATION = 60 * 60 * 24 * 7; // 7 days in seconds

// ---- Types ----
export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: string;
  branchId: string;
  branchName?: string;
}

export interface Session {
  user: SessionUser;
  expires: string;
}

// ---- Password ----
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// ---- JWT ----
/** Generate a fresh `jti` (JWT ID) — 32 bytes of crypto-random
 *  rendered as 64-char hex. Paired with the revoked_sessions table
 *  for instant kill-switch on logout / admin revoke. */
function newJti(): string {
  return createHash("sha256").update(randomBytes(32)).digest("hex");
}

export async function createToken(user: SessionUser): Promise<string> {
  const jti = newJti();
  return new SignJWT({ user, jti })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION}s`)
    .sign(SECRET);
}

export async function verifyToken(token: string): Promise<Session | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET);
    // Revocation check — a valid signature + non-expired token can
    // still be rejected if its jti was added to revoked_sessions
    // (logout, admin revoke, etc.). Tokens minted before v45 have
    // no jti claim; those skip the lookup.
    const jti = (payload as { jti?: string }).jti;
    if (jti && /^[0-9a-f]{64}$/.test(jti)) {
      const revoked = await prisma.revokedSession.findUnique({
        where: { jti },
        select: { jti: true },
      });
      if (revoked) return null;
    }
    return payload as unknown as Session;
  } catch {
    return null;
  }
}

/** Read the `jti` from a session token without verifying. Used by
 *  the logout route to add the current session to revoked_sessions. */
export async function decodeJti(token: string): Promise<{ jti: string; userId: string; exp: number } | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET);
    const jti = (payload as { jti?: string }).jti;
    const user = (payload as { user?: { id?: string } }).user;
    const exp = (payload as { exp?: number }).exp;
    if (!jti || !user?.id || !exp) return null;
    return { jti, userId: user.id, exp };
  } catch {
    return null;
  }
}

// ---- Session cookie ----
export async function setSessionCookie(user: SessionUser) {
  const token = await createToken(user);
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_DURATION,
    path: "/",
  });
}

export async function getSession(): Promise<Session | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyToken(token);
}

export async function clearSession() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

// ---- Login ----
/**
 * Authenticate a user against a specific tenant. The tenantId is
 * resolved earlier by the login route from the request hostname
 * (or single-tenant fallback) — it scopes the email lookup so
 * the same email can exist in multiple tenants on the same
 * deployment.
 */
export async function authenticate(email: string, password: string, tenantId: string): Promise<SessionUser | null> {
  const user = await prisma.user.findUnique({
    where: { tenantId_email: { tenantId, email } },
    include: { branch: true },
  });

  if (!user || !user.isActive) return null;

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) return null;

  // Update last login
  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    branchId: user.branchId,
    branchName: user.branch.name,
  };
}

// ---- MFA challenge token ----
// Issued when password is valid but the user has MFA enabled. The
// token is short-lived (5 minutes) and carries only the userId — it
// is NOT a session, just a "one factor cleared, prove the second"
// receipt. The TOTP-verify route exchanges it for a real session.
const MFA_CHALLENGE_DURATION = 60 * 5; // seconds

export interface MfaChallengePayload {
  userId: string;
  purpose: "mfa-challenge";
}

export async function createMfaChallengeToken(userId: string): Promise<string> {
  return new SignJWT({ userId, purpose: "mfa-challenge" } as Record<string, unknown>)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MFA_CHALLENGE_DURATION}s`)
    .sign(SECRET);
}

export async function verifyMfaChallengeToken(token: string): Promise<MfaChallengePayload | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET);
    if (payload.purpose !== "mfa-challenge") return null;
    if (typeof payload.userId !== "string") return null;
    return { userId: payload.userId, purpose: "mfa-challenge" };
  } catch {
    return null;
  }
}

/**
 * Re-hydrate a SessionUser from the database. Used by the MFA verify
 * route after the second factor clears — we don't want to trust any
 * payload from the (already-verified) challenge token beyond the
 * userId; everything else is loaded fresh.
 */
export async function loadSessionUser(userId: string): Promise<SessionUser | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { branch: true },
  });
  if (!user || !user.isActive) return null;
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    branchId: user.branchId,
    branchName: user.branch.name,
  };
}
