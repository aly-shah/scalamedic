/**
 * @system MediCore ERP — WhatsApp disconnect proxy
 * @route POST /api/whatsapp/disconnect
 *
 * Logs out of WhatsApp Web and wipes the session keys on the
 * sidecar. Reconnect requires scanning a fresh QR. Admin-only —
 * disconnecting is destructive (loses any scheduled-but-unsent
 * messages and forces a re-link from the clinic phone).
 */
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/require-auth";
import { whatsapp } from "@/lib/whatsapp";
import { logger } from "@/lib/logger";
import { logAudit } from "@/lib/audit";

export async function POST() {
  try {
    const auth = await requireAuth({ roles: ["SUPER_ADMIN", "ADMIN"] });
    if (auth.response) return auth.response;

    const res = await whatsapp.disconnect();
    if (!res.ok) {
      return NextResponse.json(
        { success: false, error: res.error || "Disconnect failed" },
        { status: res.status }
      );
    }

    await logAudit({
      userId: auth.user.id,
      action: "WHATSAPP_DISCONNECT",
      module: "COMMUNICATION",
      entityType: "WhatsAppSession",
      entityId: "—",
      details: {},
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.api("POST", "/api/whatsapp/disconnect", error);
    return NextResponse.json(
      { success: false, error: "Failed to disconnect" },
      { status: 500 }
    );
  }
}
