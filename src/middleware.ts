import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

const SECRET = new TextEncoder().encode(process.env.AUTH_SECRET || "");
const COOKIE_NAME = "medicore-session";

// QR resolver + public review / thank-you must be reachable without a
// session — anonymous patient scans land here before we know who they
// are. /qr/[token] is a route handler that does its own auth-aware
// redirect; /review/[token] is the public review form; /thank-you is
// the legacy generic landing kept reachable for old links.
// /api/reviews/by-token/* is the public submit/state endpoint.
const publicPaths = [
  "/login", "/signup", "/api/auth/login", "/api/auth/signup", "/portal",
  "/api/app/session", "/api/health", "/doctor-app",
  "/qr", "/review", "/thank-you", "/api/reviews/by-token",
  // Pre-auth tenant brand for the login + signup hero. Returns
  // brand-safe fields only (no secrets), so leaving it un-gated
  // is fine.
  "/api/tenant/current",
  // v51: patient invite redemption is public — patient lands here
  // from an SMS / email link before they have a session.
  "/accept-invite", "/api/patient-invites",
  // v52: self-serve tenant onboarding. Anonymous prospect lands on
  // /get-started, posts to /api/tenant/onboard, gets a session
  // cookie back and is bounced to /dashboard.
  "/get-started", "/api/tenant/onboard",
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public paths and static files
  if (
    publicPaths.some((p) => pathname.startsWith(p)) ||
    pathname.startsWith("/_next") ||
    pathname === "/api/auth/login" ||
    pathname === "/api/auth/signup" ||
    pathname === "/favicon.ico" ||
    pathname.endsWith(".apk") ||
    pathname.startsWith("/sw.js") ||
    pathname.startsWith("/manifest")
  ) {
    return NextResponse.next();
  }

  // Service-token path for machine-to-machine calls (e.g. dialer-server webhook
  // hitting /api/calls/incoming). The route handler does the final comparison;
  // middleware just waves through requests that carry the header so route-level
  // env-var checking can run.
  if (request.headers.get("x-service-token")) {
    return NextResponse.next();
  }

  // Check session cookie
  const token = request.cookies.get(COOKIE_NAME)?.value;

  if (!token) {
    // Redirect to login for page requests, 401 for API
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }

  try {
    await jwtVerify(token, SECRET);

    // If authenticated user hits login/signup, redirect to dashboard
    if (pathname === "/login" || pathname === "/signup") {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }

    return NextResponse.next();
  } catch {
    // Invalid token — clear and redirect
    const response = pathname.startsWith("/api/")
      ? NextResponse.json({ success: false, error: "Session expired" }, { status: 401 })
      : NextResponse.redirect(new URL("/login", request.url));

    response.cookies.delete(COOKIE_NAME);
    return response;
  }
}

export const config = {
  matcher: [
    // Match all paths except static files and public assets
    "/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.json|.*\\.apk|.*\\.png|.*\\.ico).*)",
  ],
};
