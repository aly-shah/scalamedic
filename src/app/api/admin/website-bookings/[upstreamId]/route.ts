/**
 * @system MediCore ERP — Website-booking override upsert
 * @route POST /api/admin/website-bookings/:upstreamId
 *
 * Records the CRM-side follow-up state for one website booking. The
 * upstream API at drnakhodas.com/api/appointments is read-only, so
 * all admin actions (mark contacted, scheduled, closed, plus optional
 * follow-up note) live in our website_booking_overrides table keyed
 * by the upstream integer id.
 *
 * Body: { status: WebsiteBookingStatus, notes?: string | null }
 * Auth: ADMIN+.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/require-auth";
import { logger } from "@/lib/logger";
import type { WebsiteBookingStatus } from "@prisma/client";

const ALLOWED_STATUSES: WebsiteBookingStatus[] = [
  "PENDING", "CONTACTED", "SCHEDULED", "CLOSED", "REJECTED",
];

export async function POST(
  request: Request,
  { params }: { params: Promise<{ upstreamId: string }> },
) {
  try {
    const auth = await requireAuth({ minRole: "ADMIN" });
    if (auth.response) return auth.response;

    const { upstreamId: idStr } = await params;
    const upstreamId = parseInt(idStr, 10);
    if (!Number.isInteger(upstreamId) || upstreamId <= 0) {
      return NextResponse.json(
        { success: false, error: "Invalid upstreamId" },
        { status: 400 },
      );
    }

    const body = await request.json().catch(() => ({}));
    const status = body.status as WebsiteBookingStatus | undefined;
    if (!status || !ALLOWED_STATUSES.includes(status)) {
      return NextResponse.json(
        { success: false, error: `status must be one of ${ALLOWED_STATUSES.join(", ")}` },
        { status: 400 },
      );
    }
    const notesRaw = typeof body.notes === "string" ? body.notes.trim() : null;
    const notes = notesRaw && notesRaw.length > 0 ? notesRaw.slice(0, 2000) : null;

    const row = await prisma.websiteBookingOverride.upsert({
      where: { upstreamId },
      create: {
        upstreamId,
        status,
        notes,
        updatedById: auth.user.id,
      },
      update: {
        status,
        notes,
        updatedById: auth.user.id,
      },
      select: {
        upstreamId: true,
        status: true,
        notes: true,
        updatedAt: true,
        updatedBy: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({ success: true, data: row });
  } catch (error) {
    logger.api("POST", "/api/admin/website-bookings/[upstreamId]", error);
    return NextResponse.json(
      { success: false, error: "Failed to save booking status" },
      { status: 500 },
    );
  }
}
