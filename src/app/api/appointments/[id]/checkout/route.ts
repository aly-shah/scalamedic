/**
 * @system MediCore ERP - Appointment Checkout API
 * @route POST /api/appointments/:id/checkout - Check out patient
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

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
        status: "COMPLETED",
        workflowStage: "CHECKOUT",
        checkoutTime: new Date(),
      },
      include: {
        patient: { select: { id: true, firstName: true, lastName: true, patientCode: true } },
        doctor: { select: { id: true, name: true } },
      },
    });

    // Free the room if no other active appointments still hold it.
    await syncRoomStatus(appointment.roomId);

    return NextResponse.json({ success: true, data: appointment });
  } catch (error) {
    logger.api("POST", "/api/appointments/[id]/checkout", error);
    return NextResponse.json(
      { success: false, error: "Failed to checkout appointment" },
      { status: 500 }
    );
  }
}
