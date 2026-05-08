/**
 * @system MediCore ERP — Queue ETA
 * @route GET /api/queue/eta?branchId=...&doctorId=...&date=YYYY-MM-DD
 *
 * Returns estimated minutes-until-seen for every WAITING appointment
 * in scope. Computed via lib/queue-eta.ts so the doctor-app and any
 * other surface (reception's queue board, WhatsApp ETA reminders)
 * share the same logic.
 *
 * Filters:
 *   - branchId: required (one branch's queue at a time)
 *   - doctorId: optional; when set scopes to that doctor's queue
 *   - date: YYYY-MM-DD; defaults to today (clinic timezone)
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/require-auth";
import { logger } from "@/lib/logger";
import { computeQueueEta, formatEta } from "@/lib/queue-eta";
import { getClinicToday } from "@/lib/utils";

export async function GET(request: Request) {
  try {
    const auth = await requireAuth();
    if (auth.response) return auth.response;

    const { searchParams } = new URL(request.url);
    const branchId = searchParams.get("branchId") || auth.user.branchId;
    const doctorId = searchParams.get("doctorId") || undefined;
    const date = searchParams.get("date") || getClinicToday();

    const appointments = await prisma.appointment.findMany({
      where: {
        branchId,
        date: new Date(date),
        ...(doctorId ? { doctorId } : {}),
      },
      orderBy: { startTime: "asc" },
      select: {
        id: true,
        startTime: true,
        durationMinutes: true,
        type: true,
        status: true,
        workflowStage: true,
        checkinTime: true,
        patient: { select: { id: true, firstName: true, lastName: true, patientCode: true, phone: true } },
      },
    });

    const etaMap = computeQueueEta(
      appointments.map((a) => ({
        id: a.id,
        startTime: a.startTime,
        durationMinutes: a.durationMinutes ?? undefined,
        type: a.type,
        status: a.status,
        workflowStage: a.workflowStage,
        checkInAt: a.checkinTime?.toISOString() ?? null,
      })),
    );

    const rows = appointments
      .filter((a) => etaMap.has(a.id))
      .map((a) => ({
        appointmentId: a.id,
        patient: a.patient,
        startTime: a.startTime,
        type: a.type,
        etaMinutes: etaMap.get(a.id)!,
        etaLabel: formatEta(etaMap.get(a.id)!),
      }));

    return NextResponse.json({
      success: true,
      data: rows,
      summary: {
        date,
        branchId,
        doctorId: doctorId ?? null,
        waitingCount: rows.length,
      },
    });
  } catch (error) {
    logger.api("GET", "/api/queue/eta", error);
    return NextResponse.json(
      { success: false, error: "Failed to compute queue ETA" },
      { status: 500 },
    );
  }
}
