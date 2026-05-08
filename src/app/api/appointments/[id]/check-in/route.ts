/**
 * @system MediCore ERP - Appointment Check-In API
 * @route POST /api/appointments/:id/check-in - Check in patient
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

import { requireAuth } from "@/lib/require-auth";
import { logger } from "@/lib/logger";
import { syncRoomStatus } from "@/lib/room-status";
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if (auth.response) return auth.response;

    const { id } = await params;

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
        status: "CHECKED_IN",
        workflowStage: "CHECKIN",
        checkinTime: new Date(),
      },
      include: {
        patient: { select: { id: true, firstName: true, lastName: true, patientCode: true } },
        doctor: { select: { id: true, name: true } },
      },
    });

    await logAudit({
      userId: "system",
      action: "CHECK_IN",
      module: "APPOINTMENT",
      entityType: "Appointment",
      entityId: appointment.id,
      details: { appointmentCode: appointment.appointmentCode },
    });

    // Patient is now physically in the room (or its waiting bay) — flip
    // the room to OCCUPIED so the rooms page reflects reality.
    await syncRoomStatus(appointment.roomId);

    return NextResponse.json({ success: true, data: appointment });
  } catch (error) {
    logger.api("POST", "/api/appointments/[id]/check-in", error);
    return NextResponse.json(
      { success: false, error: "Failed to check in appointment" },
      { status: 500 }
    );
  }
}
