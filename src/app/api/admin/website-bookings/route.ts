/**
 * @system MediCore ERP — Website booking-requests proxy
 * @route GET /api/admin/website-bookings
 *
 * Server-side proxy to https://drnakhodas.com/api/appointments — the
 * public website's contact / booking-request form. Proxied (rather
 * than fetched directly from the browser) so:
 *   - browser CORS doesn't block staff from reading it
 *   - the upstream URL stays out of the client bundle
 *   - we can cache / shape / auth-gate it independently
 *
 * Auth-required (ADMIN+); the upstream is currently unauthenticated.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/require-auth";
import { logger } from "@/lib/logger";

const UPSTREAM = "https://drnakhodas.com/api/appointments";

interface UpstreamBooking {
  id: number;
  full_name: string;
  email: string;
  phone: string;
  service: string | null;
  status: string;
  created_at: string;
}

export async function GET() {
  try {
    const auth = await requireAuth({ minRole: "ADMIN" });
    if (auth.response) return auth.response;

    // drnakhodas.com gates GET /api/appointments behind a shared
    // Bearer token (CRM_API_KEY on the website end). We send the same
    // value as WEBSITE_API_KEY so the upstream accepts the request —
    // without it, every read 401s and the /admin/updates page renders
    // empty.
    const apiKey = process.env.WEBSITE_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { success: false, error: "WEBSITE_API_KEY not configured on this box" },
        { status: 500 },
      );
    }

    // Fetch upstream rows + local overrides in parallel. The upstream
    // is read-only (no PATCH endpoint), so all CRM follow-up state
    // lives locally and is merged in here.
    const [res, overrides] = await Promise.all([
      fetch(UPSTREAM, {
        cache: "no-store",
        headers: { authorization: `Bearer ${apiKey}` },
      }),
      prisma.websiteBookingOverride.findMany({
        select: {
          upstreamId: true,
          status: true,
          notes: true,
          convertedLeadId: true,
          updatedAt: true,
          updatedBy: { select: { id: true, name: true } },
        },
      }),
    ]);
    if (!res.ok) {
      return NextResponse.json(
        { success: false, error: `Upstream returned ${res.status}` },
        { status: 502 },
      );
    }
    const upstreamBody = (await res.json()) as { success: boolean; count: number; data: UpstreamBooking[] };
    const overrideById = new Map(overrides.map((o) => [o.upstreamId, o]));

    const merged = (upstreamBody.data || []).map((b) => {
      const o = overrideById.get(b.id);
      return {
        ...b,
        // CRM-side follow-up. Falls back to "pending" when no admin
        // has touched this row yet (matches the upstream default).
        crmStatus: o?.status ?? "PENDING",
        crmNotes: o?.notes ?? null,
        crmConvertedLeadId: o?.convertedLeadId ?? null,
        crmUpdatedAt: o?.updatedAt ?? null,
        crmUpdatedBy: o?.updatedBy ?? null,
      };
    });

    return NextResponse.json({
      success: true,
      count: merged.length,
      data: merged,
    });
  } catch (error) {
    logger.api("GET", "/api/admin/website-bookings", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch website bookings" },
      { status: 500 },
    );
  }
}
