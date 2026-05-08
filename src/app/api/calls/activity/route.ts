/**
 * @system MediCore ERP — Per-agent recent-activity feed
 * @route GET /api/calls/activity?agentId=… — Most recent contact events
 *
 * Reads the in-memory ring buffer maintained by /api/calls/incoming.
 * Captures every event, regardless of channel (phone / whatsapp) or
 * state (ringing / answered / ended / missed) — covering the gaps in
 * CallLog (only ended/missed phone calls) and CommunicationLog (only
 * matched-patient WhatsApp).
 *
 * Used by the QuickBookPanel "Recent callers" widget so the receptionist
 * sees the actual most-recent contact, not just the most-recent persisted
 * phone call. Empty after a server restart by design — durable history is
 * already covered by /api/calls/recent + the audit log.
 */
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/require-auth";
import { logger } from "@/lib/logger";
import { getRecentActivity } from "@/lib/recent-activity-store";

export async function GET(request: Request) {
  try {
    const auth = await requireAuth();
    if (auth.response) return auth.response;

    const { searchParams } = new URL(request.url);
    const requested = searchParams.get("agentId");
    const limit = Math.max(1, Math.min(50, parseInt(searchParams.get("limit") || "15", 10)));

    // Non-admins can only see their own activity feed.
    const isAdmin = auth.user.role === "ADMIN" || auth.user.role === "SUPER_ADMIN";
    const agentId = requested && isAdmin ? requested : auth.user.id;

    const list = getRecentActivity(agentId, limit);
    return NextResponse.json({ success: true, data: list });
  } catch (error) {
    logger.api("GET", "/api/calls/activity", error);
    return NextResponse.json({ success: false, error: "Failed" }, { status: 500 });
  }
}
