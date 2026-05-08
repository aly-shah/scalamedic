/**
 * MediCore ERP — Messaging Service
 * Sends WhatsApp and SMS messages via configured gateway.
 * Supports: Baileys (WhatsApp Web sidecar), WhatsApp Business Cloud
 * API, generic SMS gateway, or "log only" fallback.
 *
 * Channel priority (auto-selected by sendMessage):
 *   1. Baileys sidecar (when reachable + linked) — preferred for
 *      QR-linked clinics. No per-message cost, sends from the
 *      clinic's real WhatsApp number.
 *   2. WhatsApp Cloud API — when WHATSAPP_API_URL + token are set.
 *   3. SMS gateway — when SMS_API_URL + key are set.
 *   4. None — logs to console + returns success so the call site
 *      doesn't fail. CommunicationLog row still gets written by
 *      the API route caller.
 */
import { whatsapp as baileys } from "@/lib/whatsapp";

const WHATSAPP_API_URL = process.env.WHATSAPP_API_URL;
const WHATSAPP_API_TOKEN = process.env.WHATSAPP_API_TOKEN;
const SMS_API_URL = process.env.SMS_API_URL;
const SMS_API_KEY = process.env.SMS_API_KEY;

export interface MessagePayload {
  to: string;          // Phone number with country code
  message: string;     // Message text
  type?: "whatsapp" | "sms";
  template?: string;   // Template name for WhatsApp
  params?: Record<string, string>; // Template parameters
}

export interface MessageResult {
  success: boolean;
  messageId?: string;
  error?: string;
  channel: "baileys" | "whatsapp" | "sms" | "none";
}

/**
 * Send a message via the best available channel.
 * Priority: Baileys (linked WhatsApp Web) > Cloud API > SMS > log
 *
 * The Baileys check is a fast HEAD on /status — if the sidecar is
 * down or unlinked we silently fall through to the next channel.
 * That keeps the cron job working through phone-offline blips
 * without manual intervention.
 */
export async function sendMessage(payload: MessagePayload): Promise<MessageResult> {
  const requested = payload.type;

  // Baileys path — primary route for QR-linked clinics.
  if (!requested || requested === "whatsapp") {
    const status = await baileys.status();
    if (status.ok && status.data?.connected) {
      const res = await baileys.send(payload.to, payload.message);
      if (res.ok && res.data?.success) {
        return {
          success: true,
          channel: "baileys",
          messageId: res.data.messageId,
        };
      }
      // Baileys reachable but send failed (phone offline, number
      // not on WhatsApp, etc). Don't fall through to Cloud API —
      // returning the error gives the caller signal to retry.
      return {
        success: false,
        channel: "baileys",
        error: res.error || "Baileys send failed",
      };
    }
  }

  // Cloud API path — only used when explicitly requested or when
  // Baileys is unreachable AND the cloud env vars are set.
  if ((!requested || requested === "whatsapp") && WHATSAPP_API_URL && WHATSAPP_API_TOKEN) {
    return sendWhatsApp(payload);
  }

  if ((!requested || requested === "sms") && SMS_API_URL && SMS_API_KEY) {
    return sendSMS(payload);
  }

  // No gateway configured — log the message
  console.log(`[Messaging] No gateway configured. Would send to ${payload.to}: ${payload.message}`);
  return { success: true, channel: "none", messageId: `log-${Date.now()}` };
}

async function sendWhatsApp(payload: MessagePayload): Promise<MessageResult> {
  try {
    const res = await fetch(WHATSAPP_API_URL!, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${WHATSAPP_API_TOKEN}`,
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: payload.to.replace(/[^0-9]/g, ""),
        type: "text",
        text: { body: payload.message },
      }),
    });

    if (res.ok) {
      const data = await res.json();
      return { success: true, channel: "whatsapp", messageId: data.messages?.[0]?.id };
    }

    const err = await res.text();
    console.error("[WhatsApp] Error:", err);
    return { success: false, channel: "whatsapp", error: err };
  } catch (error) {
    console.error("[WhatsApp] Failed:", error);
    return { success: false, channel: "whatsapp", error: String(error) };
  }
}

async function sendSMS(payload: MessagePayload): Promise<MessageResult> {
  try {
    const res = await fetch(SMS_API_URL!, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SMS_API_KEY}`,
      },
      body: JSON.stringify({
        to: payload.to.replace(/[^0-9]/g, ""),
        message: payload.message,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      return { success: true, channel: "sms", messageId: data.id || data.messageId };
    }

    const err = await res.text();
    console.error("[SMS] Error:", err);
    return { success: false, channel: "sms", error: err };
  } catch (error) {
    console.error("[SMS] Failed:", error);
    return { success: false, channel: "sms", error: String(error) };
  }
}

// ---- Message Templates ----

export function appointmentReminder(patientName: string, date: string, time: string, doctorName: string): string {
  return `Hi ${patientName}, this is a reminder for your appointment on ${date} at ${time} with ${doctorName} at MediCore Clinic. Please arrive 10 minutes early. Reply CONFIRM to confirm.`;
}

export function prescriptionMessage(patientName: string, medicines: string[]): string {
  return `Hi ${patientName}, your prescription from MediCore Clinic:\n\n${medicines.join("\n")}\n\nPlease take as directed. Contact us for any questions.`;
}

export function followUpReminder(patientName: string, date: string, reason: string): string {
  return `Hi ${patientName}, you have a follow-up due on ${date} for: ${reason}. Please book your appointment at MediCore Clinic.`;
}

export function invoiceReminder(patientName: string, amount: string, invoiceNumber: string): string {
  return `Hi ${patientName}, you have an outstanding balance of ${amount} (${invoiceNumber}) at MediCore Clinic. Please visit us or contact for payment options.`;
}
