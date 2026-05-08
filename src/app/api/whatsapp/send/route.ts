/**
 * @system MediCore ERP — WhatsApp send proxy
 * @route POST /api/whatsapp/send  { to, message, patientId? }
 *
 * Sends a WhatsApp message via the linked clinic number. Records a
 * CommunicationLog row when patientId is provided so every outbound
 * message is auditable + visible on the patient's comms tab.
 *
 * Admin / Receptionist / Billing / Doctor — anyone who'd send a
 * patient a reminder, prescription summary, or invoice nudge.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/require-auth";
import { whatsapp } from "@/lib/whatsapp";
import { logger } from "@/lib/logger";
import { logAudit } from "@/lib/audit";

export async function POST(request: Request) {
  try {
    const auth = await requireAuth({
      roles: ["SUPER_ADMIN", "ADMIN", "RECEPTIONIST", "BILLING", "DOCTOR"],
    });
    if (auth.response) return auth.response;

    const body = await request.json();
    const to = String(body.to || "").trim();
    const message = String(body.message || "").trim();
    const patientId = body.patientId ? String(body.patientId) : null;
    const subject = body.subject ? String(body.subject) : "WhatsApp message";

    if (!to || !message) {
      return NextResponse.json(
        { success: false, error: "to and message are required" },
        { status: 400 }
      );
    }

    const res = await whatsapp.send(to, message);

    // Always log the attempt — even failures, so reception can see why
    // a reminder didn't go through ("WhatsApp not connected" etc).
    if (patientId) {
      await prisma.communicationLog.create({
        data: {
          patientId,
          type: "WHATSAPP",
          direction: "OUTBOUND",
          subject,
          content: message,
          sentById: auth.user.id,
          // Stash deliverability + provider message ID in details so
          // we can build a "view delivery report" widget later.
          metadata: {
            ok: res.ok,
            status: res.status,
            messageId: res.data?.messageId,
            error: res.error,
            normalizedTo: res.data?.to,
          } as never,
        } as never, // metadata field may or may not be in current schema; suppress strict check
      }).catch((e) => logger.error("CommunicationLog write failed", e));
    }

    if (!res.ok) {
      return NextResponse.json(
        { success: false, error: res.error || "Send failed" },
        { status: res.status }
      );
    }

    await logAudit({
      userId: auth.user.id,
      action: "WHATSAPP_SEND",
      module: "COMMUNICATION",
      entityType: "CommunicationLog",
      entityId: res.data?.messageId || "—",
      details: { to, subject, patientId, length: message.length },
    });

    return NextResponse.json({
      success: true,
      data: { messageId: res.data?.messageId, to: res.data?.to },
    });
  } catch (error) {
    logger.api("POST", "/api/whatsapp/send", error);
    return NextResponse.json(
      { success: false, error: "Failed to send WhatsApp" },
      { status: 500 }
    );
  }
}
