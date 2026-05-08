/**
 * @system MediCore ERP - Appointment No-Show API
 * @route POST /api/appointments/:id/no-show - Mark patient as no-show
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

import { requireAuth } from "@/lib/require-auth";
import { logger } from "@/lib/logger";
import { syncRoomStatus } from "@/lib/room-status";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if (auth.response) return auth.response;

    const { id } = await params;
    const body = await request.json().catch(() => ({}));

    const existing = await prisma.appointment.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Appointment not found" },
        { status: 404 }
      );
    }

    const appointment = await prisma.appointment.update({
      where: { id },
      data: {
        status: "NO_SHOW",
        cancellationNote: (body as Record<string, unknown>).reason as string || "Patient did not arrive",
      },
      include: {
        patient: { select: { id: true, firstName: true, lastName: true, patientCode: true } },
        doctor: { select: { id: true, name: true } },
      },
    });

    // Free the room — patient never showed up, so any active hold can drop.
    await syncRoomStatus(appointment.roomId);

    return NextResponse.json({ success: true, data: appointment });
  } catch (error) {
    logger.api("POST", "/api/appointments/[id]/no-show", error);
    return NextResponse.json(
      { success: false, error: "Failed to mark no-show" },
      { status: 500 }
    );
  }
}
