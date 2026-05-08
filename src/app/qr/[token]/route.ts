/**
 * @system MediCore ERP — QR token resolver
 * @route GET /qr/:token
 *
 * Every scan — staff or anonymous — redirects to /review/[token]. The
 * QR is intentionally a patient-facing surface only; staff workflow
 * tools live elsewhere in the dashboard. Auditing still captures who
 * scanned (session userId is logged when present) so we can spot
 * unusual activity, but it doesn't change the destination.
 *
 * This is a route handler (not a page) so the redirect happens before
 * any Next.js bundle renders — keeps the scan path fast and leaks no
 * client-side JS to the patient.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveToken } from "@/lib/qr-tokens";
import { getSession } from "@/lib/auth";
import { logger } from "@/lib/logger";

/**
 * Build the public origin from the request, honoring the proxy's
 * forwarded headers. Falls back to NEXT_PUBLIC_APP_URL, then to the
 * raw request URL — without this, a redirect built from `request.url`
 * leaks the internal `http://localhost:3002` host to the client (nginx
 * proxies to localhost; Next sees that, not the public hostname).
 */
function publicOrigin(request: Request): string {
  const xfHost = request.headers.get("x-forwarded-host");
  const xfProto = request.headers.get("x-forwarded-proto");
  if (xfHost) {
    const proto = xfProto?.split(",")[0].trim() || "https";
    return `${proto}://${xfHost.split(",")[0].trim()}`;
  }
  const host = request.headers.get("host");
  if (host && !host.startsWith("localhost") && !host.startsWith("127.")) {
    return `https://${host}`;
  }
  const env = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (env) return env;
  return new URL(request.url).origin;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const origin = publicOrigin(request);
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    request.headers.get("x-real-ip") ||
    null;
  const ua = request.headers.get("user-agent")?.slice(0, 300) || null;

  try {
    const r = await resolveToken(token);
    const session = await getSession();

    // Outcome label for the audit row — captures the token state at
    // scan time (the page itself decides what to render).
    const outcome:
      | "PUBLIC_THANKYOU"
      | "REVOKED"
      | "EXPIRED"
      | "NOT_FOUND" =
      r.state === "VALID" ? "PUBLIC_THANKYOU"
      : r.state === "REVOKED" ? "REVOKED"
      : r.state === "EXPIRED" ? "EXPIRED"
      : "NOT_FOUND";

    // Best-effort audit log. Never block the redirect on this — a DB
    // hiccup mustn't strand the patient on an error page.
    if (r.tokenId) {
      prisma.qrScanLog
        .create({
          data: {
            tokenId: r.tokenId,
            userId: session?.user?.id ?? null,
            ipAddress: ip,
            userAgent: ua,
            outcome,
          },
        })
        .catch((e) => logger.api("POST", "qr_scan_logs", e));
    }

    return NextResponse.redirect(new URL(`/review/${token}`, origin), { status: 302 });
  } catch (error) {
    logger.api("GET", "/qr/[token]", error);
    return NextResponse.redirect(new URL(`/review/${token}`, origin), { status: 302 });
  }
}
