/**
 * @system MediCore ERP — Updates inbox unread counter
 * @route GET /api/admin/updates/unread
 *
 * Returns counts of items the current admin hasn't seen yet, used by
 * the sidebar to render a red pip on the Updates entry. "Unread" =
 * created_at strictly after `users.lastUpdatesSeenAt`. NULL last-seen
 * means everything counts as unread.
 *
 * Polled from the sidebar every ~60s (cheap — three short queries +
 * two upstream HEAD-style fetches with auth). Don't rely on this for
 * canonical counts; it's a UX hint.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/require-auth";
import { logger } from "@/lib/logger";

const APPTS_UPSTREAM = "https://drnakhodas.com/api/appointments";
const MSGS_UPSTREAM  = "https://drnakhodas.com/api/messages";

interface UpstreamRow { id: number; created_at: string }

export async function GET() {
  try {
    const auth = await requireAuth({ minRole: "ADMIN" });
    if (auth.response) return auth.response;

    // Pull lastUpdatesSeenAt fresh from the DB — it isn't on the
    // session payload (we don't want to re-issue the JWT every time
    // the user opens /admin/updates).
    const me = await prisma.user.findUnique({
      where: { id: auth.user.id },
      select: { lastUpdatesSeenAt: true },
    });
    const since = me?.lastUpdatesSeenAt ? new Date(me.lastUpdatesSeenAt) : null;

    const apiKey = process.env.WEBSITE_API_KEY;

    // Reviews — local query, the cheap one. The other two are
    // upstream fetches with the bearer token; if either upstream is
    // unreachable we still want the call to succeed (badge becomes
    // best-effort) so they're wrapped in try/catch.
    const reviewsCount = await prisma.visitReview.count(
      since
        ? { where: { submittedAt: { gt: since } } }
        : {},
    );

    let bookingsCount = 0;
    let messagesCount = 0;
    if (apiKey) {
      const headers = { authorization: `Bearer ${apiKey}` };
      const [bookingsRes, messagesRes] = await Promise.allSettled([
        fetch(APPTS_UPSTREAM, { cache: "no-store", headers }),
        fetch(MSGS_UPSTREAM,  { cache: "no-store", headers }),
      ]);

      if (bookingsRes.status === "fulfilled" && bookingsRes.value.ok) {
        const body = (await bookingsRes.value.json()) as { data?: UpstreamRow[] };
        bookingsCount = (body.data || []).filter((r) =>
          since ? new Date(r.created_at) > since : true,
        ).length;
      }
      if (messagesRes.status === "fulfilled" && messagesRes.value.ok) {
        const body = (await messagesRes.value.json()) as { data?: UpstreamRow[] };
        messagesCount = (body.data || []).filter((r) =>
          since ? new Date(r.created_at) > since : true,
        ).length;
      }
    }

    const total = reviewsCount + bookingsCount + messagesCount;

    return NextResponse.json({
      success: true,
      data: {
        reviews:  reviewsCount,
        bookings: bookingsCount,
        messages: messagesCount,
        total,
        lastSeenAt: since?.toISOString() ?? null,
      },
    });
  } catch (error) {
    logger.api("GET", "/api/admin/updates/unread", error);
    return NextResponse.json(
      { success: false, error: "Failed to compute unread count" },
      { status: 500 },
    );
  }
}
