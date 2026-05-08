/**
 * @system MediCore ERP - Appointments List & Creation API
 * @route GET /api/appointments - List appointments with filters
 * @route POST /api/appointments - Create appointment
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { clinicDayRange } from "@/lib/utils";
import { requireAuth } from "@/lib/require-auth";
import { createAppointmentSchema, validate } from "@/lib/validations";
import { findAppointmentConflicts } from "@/lib/appointment-overlap";
import { tenantIdForBranch } from "@/lib/tenant";

import { logger } from "@/lib/logger";
export async function GET(request: Request) {
  try {
    const auth = await requireAuth();
    if (auth.response) return auth.response;

    const { searchParams } = new URL(request.url);
    const date = searchParams.get("date");
    const doctorId = searchParams.get("doctorId");
    const status = searchParams.get("status");
    const branchId = searchParams.get("branchId");
    const patientId = searchParams.get("patientId");
    const type = searchParams.get("type");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {};

    if (date) {
      const { gte, lt } = clinicDayRange(date);
      where.date = { gte, lt };
    }
    if (doctorId) where.doctorId = doctorId;
    if (status) where.status = status;
    if (branchId) where.branchId = branchId;
    if (patientId) where.patientId = patientId;
    if (type) where.type = type;

    const appointments = await prisma.appointment.findMany({
      where,
      include: {
        patient: { select: { id: true, firstName: true, lastName: true, patientCode: true, phone: true, profileImage: true } },
        // consultationFee feeds the check-in pay-then-proceed flow
        doctor: { select: { id: true, name: true, speciality: true, avatar: true, consultationFee: true } },
        branch: { select: { id: true, name: true, code: true } },
        room: { select: { id: true, name: true, number: true } },
        treatment: { select: { id: true, name: true, basePrice: true, category: true } },
        invoices: {
          select: { id: true, invoiceNumber: true, status: true, total: true, amountPaid: true, balanceDue: true, createdAt: true },
          orderBy: { createdAt: "desc" },
          // Was take:1 — but a single appointment can produce multiple
          // invoices (initial check-in + extras for procedures the
          // doctor prescribes mid-consultation). Cap at 10 so the
          // list-row payload doesn't explode if some appointment ends
          // up with way more, but show all of them in the dashboard
          // chips so receptionists can print each separately.
          take: 10,
        },
      },
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
    });

    return NextResponse.json({ success: true, data: appointments });
  } catch (error) {
    logger.api("GET", "/api/appointments", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch appointments" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAuth({ roles: ["SUPER_ADMIN", "ADMIN", "DOCTOR", "RECEPTIONIST", "ASSISTANT"] });
    if (auth.response) return auth.response;

    const body = await request.json();
    const v = validate(createAppointmentSchema, body);
    if (!v.success) {
      return NextResponse.json({ success: false, error: v.error }, { status: 400 });
    }

    const d = v.data;

    const appointment = await prisma.$transaction(async (tx) => {
      // Auto-pick a room if the receptionist didn't choose one. Without
      // this, no-roomId appointments don't appear in the Room view of
      // the calendar (each column there filters appointments by room).
      // Maps appointment type → preferred Room.type:
      //   CONSULTATION / FOLLOW_UP / REVIEW / EMERGENCY → CONSULTATION room
      //   PROCEDURE → PROCEDURE room
      // Picks the first non-conflicting AVAILABLE room of that type at
      // the branch, ordered by name (deterministic). If none fit (every
      // room of the right type is busy), leaves it NULL — the
      // appointment still books, just won't show in Room view until the
      // user assigns one manually.
      let resolvedRoomId: string | null = d.roomId || null;
      if (!resolvedRoomId) {
        const wantedType = d.type === "PROCEDURE" ? "PROCEDURE" : "CONSULTATION";
        const candidates = await tx.room.findMany({
          where: {
            branchId: d.branchId,
            type: wantedType,
            isAvailable: true,
            status: { not: "MAINTENANCE" },
          },
          select: { id: true },
          orderBy: { name: "asc" },
        });
        for (const c of candidates) {
          const conflictsForRoom = await findAppointmentConflicts(tx, {
            doctorId: d.doctorId,
            date: new Date(d.date),
            startTime: d.startTime,
            endTime: d.endTime,
            roomId: c.id,
          });
          // findAppointmentConflicts returns rows that overlap on doctor
          // OR room OR a blocked slot. The Conflict type tags each by
          // .kind — we only skip this candidate if the conflict is
          // specifically a room overlap. Doctor conflicts will fail the
          // canonical check below regardless of which room we pick.
          const roomBusy = conflictsForRoom.some((c2) => c2.kind === "room");
          if (!roomBusy) { resolvedRoomId = c.id; break; }
        }
      }

      const conflicts = await findAppointmentConflicts(tx, {
        doctorId: d.doctorId,
        date: new Date(d.date),
        startTime: d.startTime,
        endTime: d.endTime,
        roomId: resolvedRoomId,
      });
      if (conflicts.length > 0) {
        const err = new Error("APPOINTMENT_CONFLICT") as Error & { conflicts?: typeof conflicts };
        err.conflicts = conflicts;
        throw err;
      }

      // MAX-based numbering — count()+1 collides on sequence gaps
      // (deleted appointments). v53: scoped per-tenant.
      const apptTenantId = await tenantIdForBranch(d.branchId);
      const last = await tx.appointment.findFirst({
        where: { tenantId: apptTenantId, appointmentCode: { startsWith: "APT-" } },
        orderBy: { appointmentCode: "desc" },
        select: { appointmentCode: true },
      });
      const lastNum = last ? parseInt(last.appointmentCode.split("-").pop() || "0", 10) : 0;
      const appointmentCode = `APT-${String(lastNum + 1).padStart(4, "0")}`;

      const appt = await tx.appointment.create({
        data: {
          appointmentCode,
          patientId: d.patientId,
          doctorId: d.doctorId,
          branchId: d.branchId,
          tenantId: apptTenantId,
          roomId: resolvedRoomId,
          date: new Date(d.date),
          startTime: d.startTime,
          endTime: d.endTime,
          durationMinutes: d.durationMinutes || 30,
          type: d.type || "CONSULTATION",
          status: "SCHEDULED",
          notes: d.notes || null,
          priority: d.priority || "NORMAL",
          workflowStage: "BOOKED",
          treatmentId: d.treatmentId || null,
          createdById: auth.user.id,
        },
        include: {
          patient: { select: { id: true, firstName: true, lastName: true, patientCode: true } },
          doctor: { select: { id: true, name: true, speciality: true } },
        },
      });

      await tx.auditLog.create({
        data: {
          userId: auth.user.id,
          action: "CREATE",
          module: "APPOINTMENT",
          entityType: "Appointment",
          entityId: appt.id,
          details: { appointmentCode: appt.appointmentCode },
        },
      });

      return appt;
    });

    return NextResponse.json({ success: true, data: appointment }, { status: 201 });
  } catch (error) {
    const maybe = error as Error & { conflicts?: unknown; code?: string };
    if (maybe?.message === "APPOINTMENT_CONFLICT" && maybe.conflicts) {
      return NextResponse.json(
        { success: false, error: "Time slot not available", conflicts: maybe.conflicts },
        { status: 409 }
      );
    }
    // Postgres exclusion_violation — DB-level overlap guard (race-condition backstop)
    if (/exclusion_violation|23P01|no_doctor_overlap|no_room_overlap/i.test(String(maybe?.message || ""))) {
      return NextResponse.json(
        { success: false, error: "Time slot not available (concurrent booking detected)" },
        { status: 409 }
      );
    }
    logger.api("POST", "/api/appointments", error);
    return NextResponse.json(
      { success: false, error: "Failed to create appointment" },
      { status: 500 }
    );
  }
}
