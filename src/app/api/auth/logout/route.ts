import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { clearSession, decodeJti } from "@/lib/auth";

const COOKIE_NAME = "medicore-session";

export async function POST() {
  // Revoke before clearing the cookie. The revoked_sessions row
  // captures the jti so any stolen copy of the token (cross-tab
  // sniff, screenshot, etc.) is rejected immediately by
  // verifyToken's revocation lookup.
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (token) {
    const decoded = await decodeJti(token);
    if (decoded) {
      try {
        await prisma.revokedSession.upsert({
          where: { jti: decoded.jti },
          create: {
            jti: decoded.jti,
            userId: decoded.userId,
            expiresAt: new Date(decoded.exp * 1000),
            reason: "logout",
          },
          update: {},
        });
      } catch { /* best-effort */ }
    }
  }
  await clearSession();
  return NextResponse.json({ success: true });
}
