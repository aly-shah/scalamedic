/**
 * @system MediCore ERP — Website contact-messages proxy
 * @route GET /api/admin/website-messages
 *
 * Server-side proxy to https://drnakhodas.com/api/messages — the
 * public website's contact-form submissions. See the bookings proxy
 * sibling for rationale.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/require-auth";
import { logger } from "@/lib/logger";

const UPSTREAM = "https://drnakhodas.com/api/messages";

interface UpstreamMessage {
  id: number;
  full_name: string;
  email: string;
  phone: string;
  message: string;
  created_at: string;
}

export async function GET() {
  try {
    const auth = await requireAuth({ minRole: "ADMIN" });
    if (auth.response) return auth.response;

    // drnakhodas.com gates GETs on /api/appointments + /api/messages
    // behind a shared Bearer token (CRM_API_KEY env on the website).
    // We send the same value as WEBSITE_API_KEY here so the upstream
    // accepts the request. Without the header, every read 401s and the
    // /admin/updates page renders empty.
    const apiKey = process.env.WEBSITE_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { success: false, error: "WEBSITE_API_KEY not configured on this box" },
        { status: 500 },
      );
    }

    const [res, overrides] = await Promise.all([
      fetch(UPSTREAM, {
        cache: "no-store",
        headers: { authorization: `Bearer ${apiKey}` },
      }),
      prisma.websiteMessageOverride.findMany({
        select: { upstreamId: true, convertedLeadId: true },
      }),
    ]);
    if (!res.ok) {
      return NextResponse.json(
        { success: false, error: `Upstream returned ${res.status}` },
        { status: 502 },
      );
    }
    const upstreamBody = (await res.json()) as { success: boolean; count: number; data: UpstreamMessage[] };
    const overrideById = new Map(overrides.map((o) => [o.upstreamId, o]));

    const merged = (upstreamBody.data || []).map((m) => ({
      ...m,
      // Surfaces the converted-to-lead FK so the Messages tab can
      // swap the Convert button for a "View lead" link without a
      // second round-trip.
      crmConvertedLeadId: overrideById.get(m.id)?.convertedLeadId ?? null,
    }));

    return NextResponse.json({
      success: true,
      count: merged.length,
      data: merged,
    });
  } catch (error) {
    logger.api("GET", "/api/admin/website-messages", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch website messages" },
      { status: 500 },
    );
  }
}
