/**
 * @system MediCore ERP - Patient Appointments API
 * @route GET /api/patients/:id/appointments - Get patient appointments
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { clinicDayRange } from "@/lib/utils";

import { requireAuth } from "@/lib/require-auth";
import { logger } from "@/lib/logger";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if (auth.response) return auth.response;

    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const date = searchParams.get("date");

    const where: Prisma.AppointmentWhereInput = { patientId: id };

    if (status) {
      where.status = status as Prisma.EnumAppointmentStatusFilter;
    }

    if (date) {
      where.date = clinicDayRange(date);
    }

    const appointments = await prisma.appointment.findMany({
      where,
      orderBy: { date: "desc" },
      include: {
        doctor: {
          select: { id: true, name: true, speciality: true },
        },
        branch: {
          select: { id: true, name: true },
        },
        room: {
          select: { id: true, name: true, number: true },
        },
      },
    });

    return NextResponse.json({ success: true, data: appointments });
  } catch (error) {
    logger.api("GET", "/api/patients/[id]/appointments", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch appointments" },
      { status: 500 }
    );
  }
}
