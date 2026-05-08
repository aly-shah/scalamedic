/**
 * @system MediCore ERP — WhatsApp service status proxy
 * @route GET /api/whatsapp/status
 *
 * Forwards to the sidecar's /status. Open to any authenticated user
 * so the connection card can render on every dashboard. Writes are
 * gated tighter (admin/receptionist only) on the send/disconnect
 * routes.
 */
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/require-auth";
import { whatsapp } from "@/lib/whatsapp";
import { logger } from "@/lib/logger";

export async function GET() {
  try {
    const auth = await requireAuth();
    if (auth.response) return auth.response;

    const res = await whatsapp.status();
    if (!res.ok) {
      // Service unreachable / not configured. Surface as 200 with an
      // explicit "offline" payload so the UI doesn't render an error
      // banner — this is an expected state when the sidecar is down.
      return NextResponse.json({
        success: true,
        data: {
          connected: false,
          state: "close",
          phone: null,
          serviceAvailable: false,
          serviceError: res.error,
        },
      });
    }
    return NextResponse.json({
      success: true,
      data: { ...res.data, serviceAvailable: true },
    });
  } catch (error) {
    logger.api("GET", "/api/whatsapp/status", error);
    return NextResponse.json(
      { success: false, error: "Failed to read WhatsApp status" },
      { status: 500 }
    );
  }
}
