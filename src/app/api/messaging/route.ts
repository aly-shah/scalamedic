/**
 * @system MediCore ERP — Messaging API
 * @route POST /api/messaging — Send WhatsApp/SMS message
 */
import { NextResponse } from "next/server";
import { sendMessage } from "@/lib/messaging";
import { prisma } from "@/lib/prisma";

import { requireAuth } from "@/lib/require-auth";
import { logger } from "@/lib/logger";
export async function POST(request: Request) {
  try {
    const auth = await requireAuth();
    if (auth.response) return auth.response;

    const body = await request.json();
    const { to, message, type, patientId, subject } = body;

    if (!to || !message) {
      return NextResponse.json({ success: false, error: "Missing: to, message" }, { status: 400 });
    }

    // Send via messaging service
    const result = await sendMessage({ to, message, type: type || "whatsapp" });

    // Log the communication
    if (patientId) {
      await prisma.communicationLog.create({
        data: {
          patientId,
          type: type === "sms" ? "SMS" : "WHATSAPP",
          direction: "OUTBOUND",
          subject: subject || "Message sent",
          content: message,
          sentById: body.sentById || (await prisma.user.findFirst({ where: { role: "ADMIN" }, select: { id: true } }))?.id || "",
        },
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        channel: result.channel,
        messageId: result.messageId,
        delivered: result.success,
      },
    });
  } catch (error) {
    logger.api("POST", "/api/messaging", error);
    return NextResponse.json({ success: false, error: "Failed to send message" }, { status: 500 });
  }
}
