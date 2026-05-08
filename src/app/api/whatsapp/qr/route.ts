/**
 * @system MediCore ERP — WhatsApp QR proxy
 * @route GET /api/whatsapp/qr
 *
 * Returns the latest QR as a data URL when the sidecar is in
 * `connecting` state. Returns null + connected=true once the user
 * has scanned (the QR modal stops polling at that point).
 *
 * Admin / Receptionist only — only roles that should be linking the
 * clinic's WhatsApp number.
 */
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/require-auth";
import { whatsapp } from "@/lib/whatsapp";
import { logger } from "@/lib/logger";

export async function GET() {
  try {
    const auth = await requireAuth({
      roles: ["SUPER_ADMIN", "ADMIN", "RECEPTIONIST"],
    });
    if (auth.response) return auth.response;

    const res = await whatsapp.qr();
    if (!res.ok) {
      return NextResponse.json(
        { success: false, error: res.error || "WhatsApp service unreachable" },
        { status: res.status }
      );
    }
    return NextResponse.json({ success: true, data: res.data });
  } catch (error) {
    logger.api("GET", "/api/whatsapp/qr", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch QR" },
      { status: 500 }
    );
  }
}
