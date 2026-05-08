/**
 * @system MediCore ERP — Incoming Call / WhatsApp Event API
 * @route POST /api/calls/incoming — Mobile companion or dialer reports call/message event
 * @route GET  /api/calls/incoming — Poll for latest live-call state (desktop dashboard)
 *
 * Accepts two channels:
 *   channel=phone     (default) — live voice call lifecycle events from Twilio or
 *                                  the Android companion (state=ringing/answered/
 *                                  ended/missed). Ended/missed writes a CallLog.
 *   channel=whatsapp            — messaging event from the Android companion
 *                                  reading WhatsApp notifications. If the sender
 *                                  phone matches a Patient, writes a
 *                                  CommunicationLog; otherwise acknowledges only.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

import { requireAuth } from "@/lib/require-auth";
import { logger } from "@/lib/logger";
import { matchCaller } from "@/lib/call-match";
import { pushRecentActivity } from "@/lib/recent-activity-store";
// In-memory store for live calls (in production, use Redis)
const liveCallStore: Map<string, {
  phone: string;
  agentId: string;
  branchId?: string;
  state: "ringing" | "answered" | "ended" | "missed";
  timestamp: number;
  matchResult?: Record<string, unknown>;
  channel?: "phone" | "whatsapp";
  direction?: "INBOUND" | "OUTBOUND";
  contactName?: string;
  messageText?: string;
}> = new Map();

// Per-agent recent contact activity (phone + whatsapp). Read by
// /api/calls/activity to populate the dashboard's "Recent callers" feed.
// Implementation lives in lib/ because Next.js forbids ad-hoc exports
// from route files.

export async function POST(request: Request) {
  try {
    // Accept either a cookie session (UI) or a service token (dialer-server /
    // mobile companion). Dialer/companion identities are keyed by email, so
    // service-token requests may pass `agentEmail` instead of `agentId`.
    const serviceToken = request.headers.get("x-service-token");
    const expected = process.env.DIALER_SERVICE_TOKEN;
    const isService = !!expected && serviceToken === expected;

    if (!isService) {
      const auth = await requireAuth();
      if (auth.response) return auth.response;
    }

    const body = await request.json();
    const {
      phone, branchId, state,
      channel: rawChannel,
      direction: rawDirection,
      messageText, contactName,
    } = body;
    let { agentId } = body;
    const channel: "phone" | "whatsapp" = rawChannel === "whatsapp" ? "whatsapp" : "phone";
    const direction: "INBOUND" | "OUTBOUND" = rawDirection === "OUTBOUND" ? "OUTBOUND" : "INBOUND";

    if (!agentId && body.agentEmail) {
      // v51: users.email is per-tenant. The dialer-server webhook
      // doesn't carry tenant context; findFirst is the right verb
      // for single-tenant deployments. Multi-tenant SaaS would
      // need the dialer to send a tenantId hint too.
      const user = await prisma.user.findFirst({
        where: { email: String(body.agentEmail).toLowerCase() },
        select: { id: true },
      });
      if (user) agentId = user.id;
    }

    if (!phone || !agentId) {
      logger.api("POST", "/api/calls/incoming", new Error(
        `rejected: missing phone or unresolved agentEmail (got phone=${phone ? "yes" : "no"}, ` +
        `agentId=${agentId || "null"}, agentEmail=${body.agentEmail || "null"})`
      ));
      return NextResponse.json(
        { success: false, error: "Missing: phone, and agentId or a resolvable agentEmail" },
        { status: 400 }
      );
    }

    // Visible accept log — handy for debugging "I called but nothing showed up"
    // without bringing up Postgres. Truncated to keep one log line.
    console.info(
      `[/api/calls/incoming] ${channel} ${direction} ${state || "-"} ` +
      `phone=${String(phone).slice(0, 24)} agent=${agentId.slice(0, 8)}`
    );

    // Match caller by phone (patient + lead + recent context)
    let matchData: Awaited<ReturnType<typeof matchCaller>> | null = null;
    try {
      matchData = await matchCaller(phone);
    } catch (err) {
      logger.api("POST", "/api/calls/incoming (match)", err);
    }

    // Push to the per-agent recent-activity buffer so the dashboard's
    // "Recent callers" feed picks up phone + WhatsApp uniformly. Done
    // before the channel-specific branches so every successful event,
    // matched or not, lands in the feed.
    pushRecentActivity(agentId, {
      id: (typeof crypto !== "undefined" && "randomUUID" in crypto)
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      ts: Date.now(),
      channel,
      direction,
      state: typeof state === "string" ? state : null,
      phone: String(phone),
      contactName: typeof contactName === "string" && contactName.trim() ? contactName.trim() : null,
      patientId: matchData?.patient?.id ?? null,
      patientFirstName: matchData?.patient?.firstName ?? null,
      patientLastName: matchData?.patient?.lastName ?? null,
      leadId: matchData?.lead?.id ?? null,
      leadName: matchData?.lead?.name ?? null,
    });

    // --- Channel: WHATSAPP ---
    if (channel === "whatsapp") {
      // Live preview for supervisors/agents; CommunicationLog only if patient matched.
      liveCallStore.set(agentId, {
        phone, agentId, branchId,
        state: "ringing",
        timestamp: Date.now(),
        matchResult: matchData as unknown as Record<string, unknown>,
        channel: "whatsapp",
        direction,
        contactName: typeof contactName === "string" ? contactName : undefined,
        messageText: typeof messageText === "string" ? messageText : undefined,
      });
      setTimeout(() => liveCallStore.delete(agentId), 30000);

      if (matchData?.patient?.id) {
        await prisma.communicationLog.create({
          data: {
            patientId: matchData.patient.id,
            type: "WHATSAPP",
            direction,
            subject: typeof contactName === "string" ? contactName : null,
            content: typeof messageText === "string" ? messageText : null,
            sentById: agentId,
          },
        });
      }

      return NextResponse.json({
        success: true,
        data: { channel, direction, logged: !!matchData?.patient?.id, match: matchData || null },
      });
    }

    // --- Channel: PHONE (default, existing behaviour) ---
    liveCallStore.set(agentId, {
      phone, agentId, branchId,
      state: state || "ringing",
      timestamp: Date.now(),
      matchResult: matchData as unknown as Record<string, unknown>,
      channel: "phone",
      direction,
      contactName: typeof contactName === "string" ? contactName : undefined,
    });

    if (state === "ended" || state === "missed") {
      await prisma.callLog.create({
        data: {
          leadId: matchData?.lead?.id || null,
          patientId: matchData?.patient?.id || null,
          userId: agentId,
          type: direction, // honors INBOUND / OUTBOUND from the device
          duration: body.duration || null,
          notes: state === "missed" ? `Missed ${direction.toLowerCase()} call` : body.notes || null,
          outcome: state === "missed" ? "NO_ANSWER" : body.outcome || "INFO_PROVIDED",
          phone: typeof phone === "string" ? phone : null,
          contactName: typeof contactName === "string" && contactName.trim()
            ? contactName.trim().slice(0, 100)
            : null,
        },
      });

      // Clean up after a delay
      setTimeout(() => liveCallStore.delete(agentId), 30000);
    }

    return NextResponse.json({
      success: true,
      data: { channel, direction, state: state || "ringing", match: matchData || null },
    });
  } catch (error) {
    logger.api("POST", "/api/calls/incoming", error);
    return NextResponse.json({ success: false, error: "Failed" }, { status: 500 });
  }
}

// Desktop dashboard polls this to get live call state
export async function GET(request: Request) {
  try {
    const auth = await requireAuth();
    if (auth.response) return auth.response;

    const { searchParams } = new URL(request.url);
    const agentId = searchParams.get("agentId");

    if (!agentId) {
      // Return all active calls for supervisors
      const calls = Array.from(liveCallStore.values())
        .filter((c) => Date.now() - c.timestamp < 120000) // Last 2 min
        .sort((a, b) => b.timestamp - a.timestamp);
      return NextResponse.json({ success: true, data: calls });
    }

    const call = liveCallStore.get(agentId);
    if (!call || Date.now() - call.timestamp > 120000) {
      return NextResponse.json({ success: true, data: null });
    }

    return NextResponse.json({ success: true, data: call });
  } catch (error) {
    logger.api("GET", "/api/calls/incoming", error);
    return NextResponse.json({ success: false, error: "Failed" }, { status: 500 });
  }
}
