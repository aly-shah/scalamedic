/**
 * @system MediCore ERP — Recent activity feed (calls + WhatsApp)
 * @route GET /api/calls/recent
 *
 * Returns the last N items of inbound activity, merged across:
 *   - call_logs           (phone calls, both directions)
 *   - communication_logs  (WhatsApp inbound only)
 *
 * Each row carries a `kind` discriminator ("call" | "whatsapp") so
 * the UI can pick the right channel badge. Shape is otherwise
 * unified — same fields the recent-calls block on /call-center
 * already renders.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/require-auth";
import { logger } from "@/lib/logger";

export async function GET(request: Request) {
  try {
    const auth = await requireAuth();
    if (auth.response) return auth.response;

    const { searchParams } = new URL(request.url);
    const agentId = searchParams.get("agentId");
    const limit = Math.min(parseInt(searchParams.get("limit") || "20", 10), 100);

    const callWhere: Record<string, unknown> = {};
    if (agentId) callWhere.userId = agentId;

    // Fetch a slice from each channel sized to `limit` so the merge
    // can still surface `limit` items even when one channel
    // dominates. Two cheap indexed queries; the merge is in-memory.
    const [calls, waMessages] = await Promise.all([
      prisma.callLog.findMany({
        where: callWhere,
        include: {
          lead: { select: { id: true, name: true, phone: true, status: true } },
          patient: { select: { id: true, firstName: true, lastName: true, patientCode: true, phone: true } },
          user: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
        take: limit,
      }),
      prisma.communicationLog.findMany({
        where: { type: "WHATSAPP", direction: "INBOUND" },
        include: {
          lead: { select: { id: true, name: true, phone: true, status: true } },
          patient: { select: { id: true, firstName: true, lastName: true, patientCode: true, phone: true } },
        },
        orderBy: { createdAt: "desc" },
        take: limit,
      }),
    ]);

    // Project into a single shape. `kind` is the discriminator the
    // UI uses for the channel badge + which action set to render.
    type Row = {
      kind: "call" | "whatsapp";
      id: string;
      type?: string | null;
      outcome?: string | null;
      notes?: string | null;
      duration?: number | null;
      content?: string | null;
      createdAt: string;
      phone: string | null;
      lead: { id: string; name: string; phone: string; status: string } | null;
      patient: { id: string; firstName: string; lastName: string; patientCode: string; phone: string | null } | null;
      user: { id: string; name: string } | null;
    };

    const callRows: Row[] = calls.map((c) => ({
      kind: "call",
      id: c.id,
      type: c.type,
      outcome: c.outcome,
      notes: c.notes,
      duration: c.duration,
      content: null,
      createdAt: c.createdAt.toISOString(),
      phone: c.phone ?? c.lead?.phone ?? c.patient?.phone ?? null,
      lead: c.lead,
      patient: c.patient,
      user: c.user,
    }));

    const waRows: Row[] = waMessages.map((m) => ({
      kind: "whatsapp",
      id: m.id,
      type: m.direction, // always "INBOUND" by query
      outcome: null,
      notes: null,
      duration: null,
      content: m.content,
      createdAt: m.createdAt.toISOString(),
      phone: m.phone ?? m.patient?.phone ?? m.lead?.phone ?? null,
      lead: m.lead,
      patient: m.patient,
      user: null,
    }));

    const merged = [...callRows, ...waRows]
      .sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1))
      .slice(0, limit);

    return NextResponse.json({ success: true, data: merged });
  } catch (error) {
    logger.api("GET", "/api/calls/recent", error);
    return NextResponse.json({ success: false, error: "Failed" }, { status: 500 });
  }
}
