/**
 * @system MediCore ERP — QR token issuer API
 * @route POST /api/qr-tokens — get-or-create a token for an appointment/invoice
 *
 * Called by the receipt page right before it renders the QR. Returns
 * an existing token if one exists for the same target so reprints
 * produce the same QR. Auth-required (only staff print receipts).
 */
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/require-auth";
import { logger } from "@/lib/logger";
import { getOrCreateToken } from "@/lib/qr-tokens";

export async function POST(request: Request) {
  try {
    const auth = await requireAuth();
    if (auth.response) return auth.response;

    const body = await request.json().catch(() => ({}));
    const appointmentId = typeof body.appointmentId === "string" && body.appointmentId.length > 0
      ? body.appointmentId : null;
    const invoiceId = typeof body.invoiceId === "string" && body.invoiceId.length > 0
      ? body.invoiceId : null;

    if (!appointmentId && !invoiceId) {
      return NextResponse.json(
        { success: false, error: "appointmentId or invoiceId is required" },
        { status: 400 },
      );
    }

    const t = await getOrCreateToken({ appointmentId, invoiceId }, auth.user.id);
    return NextResponse.json({
      success: true,
      data: {
        token: t.token,
        appointmentId: t.appointmentId,
        invoiceId: t.invoiceId,
        revokedAt: t.revokedAt,
        expiresAt: t.expiresAt,
      },
    });
  } catch (error) {
    logger.api("POST", "/api/qr-tokens", error);
    return NextResponse.json(
      { success: false, error: "Failed to issue QR token" },
      { status: 500 },
    );
  }
}
