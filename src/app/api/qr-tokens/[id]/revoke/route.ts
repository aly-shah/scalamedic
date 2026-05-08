/**
 * @system MediCore ERP — QR token revoke
 * @route POST /api/qr-tokens/:id/revoke — revoke a token
 *
 * Once revoked, staff scans land on a "Token revoked" screen. Public
 * scans still see the thank-you page so old printed receipts continue
 * to feel intact for the patient. Idempotent.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/require-auth";
import { logger } from "@/lib/logger";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireAuth({ minRole: "RECEPTIONIST" });
    if (auth.response) return auth.response;

    const { id } = await params;
    const updated = await prisma.qrToken.update({
      where: { id },
      data: { revokedAt: new Date() },
      select: { id: true, revokedAt: true },
    });
    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    logger.api("POST", "/api/qr-tokens/[id]/revoke", error);
    return NextResponse.json(
      { success: false, error: "Failed to revoke token" },
      { status: 500 },
    );
  }
}
