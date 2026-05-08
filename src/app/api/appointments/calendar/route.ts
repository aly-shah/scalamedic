/**
 * @system MediCore ERP - Appointments Calendar API
 * @route GET /api/appointments/calendar - Get appointments grouped by date
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

import { toClinicDay, clinicDayRange } from "@/lib/utils";
import { requireAuth } from "@/lib/require-auth";
import { logger } from "@/lib/logger";
export async function GET(request: Request) {
  try {
    const auth = await requireAuth();
    if (auth.response) return auth.response;

    const { searchParams } = new URL(request.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const doctorId = searchParams.get("doctorId");
    const branchId = searchParams.get("branchId");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {};

    if (from || to) {
      where.date = {};
      if (from) where.date.gte = clinicDayRange(from).gte;
      if (to) where.date.lt = clinicDayRange(to).lt;
    }

    if (doctorId) where.doctorId = doctorId;
    if (branchId) where.branchId = branchId;

    const appointments = await prisma.appointment.findMany({
      where,
      include: {
        patient: { select: { id: true, firstName: true, lastName: true, patientCode: true } },
        doctor: { select: { id: true, name: true, speciality: true } },
        room: { select: { id: true, name: true, number: true } },
      },
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
    });

    // Group by date
    const grouped: Record<string, typeof appointments> = {};
    for (const apt of appointments) {
      const dateKey = toClinicDay(apt.date);
      if (!grouped[dateKey]) {
        grouped[dateKey] = [];
      }
      grouped[dateKey].push(apt);
    }

    return NextResponse.json({ success: true, data: grouped });
  } catch (error) {
    logger.api("GET", "/api/appointments/calendar", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch calendar appointments" },
      { status: 500 }
    );
  }
}
