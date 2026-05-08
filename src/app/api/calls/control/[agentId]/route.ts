/**
 * @system MediCore ERP — Live phone-control commands
 * @route POST /api/calls/control/[agentId] — Dashboard sends Answer/Hangup/Dial to the agent's phone
 *
 * Auth: cookie session (the receptionist or supervisor clicking the
 * button must be logged in). Non-admins can only target their own
 * agent id; admins can target any agent (for supervisor takeovers).
 *
 * Commands are queued in-memory and drained by the phone via
 * /api/calls/control/poll. ~10s TTL on the queue so a phone that
 * reconnects after a stretch doesn't replay stale clicks against a
 * different call.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/require-auth";
import { logger } from "@/lib/logger";
import { validate } from "@/lib/validations";
import { pushControl } from "@/lib/call-control-store";

const bodySchema = z.object({
  action: z.enum(["answer", "hangup", "dial"]),
  // Required only when action === "dial". Phone numbers come in lots of
  // formats — we just trim and pass through; the phone normalises.
  number: z.string().min(3).max(32).optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ agentId: string }> }
) {
  try {
    const auth = await requireAuth();
    if (auth.response) return auth.response;

    const { agentId } = await params;

    const isAdmin = auth.user.role === "ADMIN" || auth.user.role === "SUPER_ADMIN";
    if (!isAdmin && agentId !== auth.user.id) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const v = validate(bodySchema, body);
    if (!v.success) {
      return NextResponse.json({ success: false, error: v.error }, { status: 400 });
    }
    if (v.data.action === "dial" && !v.data.number) {
      return NextResponse.json({ success: false, error: "dial requires number" }, { status: 400 });
    }

    const cmd = pushControl(agentId, { action: v.data.action, number: v.data.number });
    return NextResponse.json({ success: true, data: { id: cmd.id } });
  } catch (error) {
    logger.api("POST", "/api/calls/control/[agentId]", error);
    return NextResponse.json({ success: false, error: "Failed" }, { status: 500 });
  }
}
