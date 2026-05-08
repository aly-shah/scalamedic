/**
 * @system MediCore ERP — WhatsApp inbound webhook
 * @route POST /api/whatsapp/inbound
 *
 * Receiver for the Baileys sidecar. The sidecar holds the WhatsApp
 * session and forwards every 1:1 inbound message here so we can
 * persist it to communication_logs and surface it on the call-center
 * recent-activity feed alongside phone calls.
 *
 * Auth: shared X-Service-Token (same secret pattern as the main app
 * → sidecar direction). NOT user-session gated — the caller is a
 * machine, not a logged-in agent.
 *
 * Flow:
 *   1. Verify the service token
 *   2. Try to match the sender phone against an existing patient
 *      (any phone shape — we strip non-digits both sides). Then a
 *      lead. Both linkages are optional; raw phone is always saved.
 *   3. Insert a communication_logs row (type=WHATSAPP, direction=
 *      INBOUND).
 *   4. Idempotency: dedupe on (phone, content, last 60s) — sidecar
 *      retry on transient HTTP failure shouldn't double-log.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

const SERVICE_TOKEN = process.env.WHATSAPP_SERVICE_TOKEN;

interface InboundBody {
  phone?: string;
  text?: string;
  messageId?: string | null;
  pushName?: string | null;
  receivedAt?: string;
}

/** Reduce a phone to bare digits so we can match across formats:
 *  "+92 300 0000000" / "0300 0000000" / "923000000000" all collapse. */
function digits(p: string): string {
  return p.replace(/[^0-9]/g, "");
}

/** Pakistan-specific: WhatsApp delivers numbers as 92xxxxxxxxxx (no
 *  leading 0). Existing patient records often have the local 03xx
 *  form. Match on the trailing 10 digits which are unique within PK. */
function tail10(p: string): string {
  const d = digits(p);
  return d.length >= 10 ? d.slice(-10) : d;
}

export async function POST(request: Request) {
  try {
    const headerToken = request.headers.get("x-service-token");
    if (!SERVICE_TOKEN || headerToken !== SERVICE_TOKEN) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as InboundBody;
    const phone = body.phone?.trim();
    const text = body.text?.trim() || "";
    if (!phone || !text) {
      return NextResponse.json(
        { success: false, error: "phone and text are required" },
        { status: 400 },
      );
    }

    // Match against existing records. We suffix-compare the 10-digit
    // tail to absorb any leading-0 / country-code variance.
    const t = tail10(phone);
    let patientId: string | null = null;
    let leadId: string | null = null;
    if (t.length >= 7) {
      // Use raw SQL for the LIKE match — Prisma's contains operator
      // is case-insensitive but string-only; phones are short so
      // the scan is cheap.
      const patientMatch = await prisma.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM patients
        WHERE phone IS NOT NULL AND regexp_replace(phone, '[^0-9]', '', 'g') LIKE ${"%" + t}
        AND "deletedAt" IS NULL
        LIMIT 1
      `;
      patientId = patientMatch[0]?.id ?? null;
      if (!patientId) {
        const leadMatch = await prisma.$queryRaw<Array<{ id: string }>>`
          SELECT id FROM leads
          WHERE phone IS NOT NULL AND regexp_replace(phone, '[^0-9]', '', 'g') LIKE ${"%" + t}
          ORDER BY "createdAt" DESC
          LIMIT 1
        `;
        leadId = leadMatch[0]?.id ?? null;
      }
    }

    // Idempotency: skip if the same phone+content arrived in the last
    // 60s (sidecar transient retry). Cheap; uses the (createdAt) idx.
    const sixtySecAgo = new Date(Date.now() - 60_000);
    const dupe = await prisma.communicationLog.findFirst({
      where: {
        phone,
        content: text,
        type: "WHATSAPP",
        direction: "INBOUND",
        createdAt: { gte: sixtySecAgo },
      },
      select: { id: true },
    });
    if (dupe) {
      return NextResponse.json({ success: true, data: { id: dupe.id, deduped: true } });
    }

    const row = await prisma.communicationLog.create({
      data: {
        patientId,
        leadId,
        phone,
        type: "WHATSAPP",
        direction: "INBOUND",
        subject: body.pushName || null,
        content: text,
        // sentById nullable for inbound — no clinic user "sent" it.
      },
      select: { id: true, patientId: true, leadId: true },
    });

    return NextResponse.json({ success: true, data: row });
  } catch (error) {
    logger.api("POST", "/api/whatsapp/inbound", error);
    return NextResponse.json(
      { success: false, error: "Failed to log inbound message" },
      { status: 500 },
    );
  }
}
