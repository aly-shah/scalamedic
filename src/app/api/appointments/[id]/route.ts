/**
 * @system MediCore ERP - Single Appointment API
 * @route GET /api/appointments/:id - Get appointment
 * @route PUT /api/appointments/:id - Update appointment
 * @route DELETE /api/appointments/:id - Cancel appointment
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

import { requireAuth } from "@/lib/require-auth";
import { logger } from "@/lib/logger";
import { findAppointmentConflicts } from "@/lib/appointment-overlap";
import { syncRoomStatus } from "@/lib/room-status";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if (auth.response) return auth.response;

    const { id } = await params;
    const appointment = await prisma.appointment.findUnique({
      where: { id },
      include: {
        patient: { select: { id: true, firstName: true, lastName: true, patientCode: true, phone: true, profileImage: true } },
        doctor: { select: { id: true, name: true, speciality: true, avatar: true } },
        branch: { select: { id: true, name: true, code: true } },
        room: { select: { id: true, name: true, number: true } },
        consultationNotes: true,
        procedures: true,
        prescriptions: { include: { items: true } },
        labTests: true,
        followUps: true,
        // Invoices on this appointment (newest first). Powers the
        // "Proceed to Billing" button in AppointmentDetail — we send
        // the user to the most recent invoice rather than dumping them
        // on the billing list to figure it out.
        invoices: {
          select: { id: true, invoiceNumber: true, status: true, total: true, balanceDue: true, createdAt: true },
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!appointment) {
      return NextResponse.json(
        { success: false, error: "Appointment not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: appointment });
  } catch (error) {
    logger.api("GET", "/api/appointments/[id]", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch appointment" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if (auth.response) return auth.response;

    const { id } = await params;
    const body = await request.json();

    const existing = await prisma.appointment.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Appointment not found" },
        { status: 404 }
      );
    }

    // Validate status transitions
    if (body.status) {
      const validTransitions: Record<string, string[]> = {
        SCHEDULED: ["CONFIRMED", "CHECKED_IN", "WAITING", "IN_PROGRESS", "CANCELLED", "RESCHEDULED", "NO_SHOW"],
        CONFIRMED: ["CHECKED_IN", "WAITING", "IN_PROGRESS", "CANCELLED", "RESCHEDULED", "NO_SHOW"],
        CHECKED_IN: ["WAITING", "IN_PROGRESS", "CANCELLED"],
        WAITING: ["IN_PROGRESS", "CANCELLED"],
        IN_PROGRESS: ["COMPLETED", "CANCELLED"],
        COMPLETED: [],
        CANCELLED: [],
        NO_SHOW: [],
        RESCHEDULED: ["SCHEDULED"],
      };
      const allowed = validTransitions[existing.status] || [];
      if (!allowed.includes(body.status)) {
        return NextResponse.json(
          { success: false, error: `Cannot transition from ${existing.status} to ${body.status}` },
          { status: 400 }
        );
      }
    }

    // Only re-check conflicts when a slot-shaping field actually changes.
    const slotChanged =
      (body.doctorId && body.doctorId !== existing.doctorId) ||
      (body.date && new Date(body.date).getTime() !== existing.date.getTime()) ||
      (body.startTime && body.startTime !== existing.startTime) ||
      (body.endTime && body.endTime !== existing.endTime) ||
      (body.roomId !== undefined && (body.roomId || null) !== existing.roomId);

    if (slotChanged) {
      const conflicts = await findAppointmentConflicts(prisma, {
        doctorId: body.doctorId ?? existing.doctorId,
        date: body.date ? new Date(body.date) : existing.date,
        startTime: body.startTime ?? existing.startTime,
        endTime: body.endTime ?? existing.endTime,
        roomId: body.roomId !== undefined ? (body.roomId || null) : existing.roomId,
        excludeAppointmentId: id,
      });
      if (conflicts.length > 0) {
        return NextResponse.json(
          { success: false, error: "Time slot not available", conflicts },
          { status: 409 }
        );
      }
    }

    const appointment = await prisma.appointment.update({
      where: { id },
      data: {
        ...(body.doctorId && { doctorId: body.doctorId }),
        ...(body.roomId !== undefined && { roomId: body.roomId || null }),
        ...(body.date && { date: new Date(body.date) }),
        ...(body.startTime && { startTime: body.startTime }),
        ...(body.endTime && { endTime: body.endTime }),
        ...(body.durationMinutes && { durationMinutes: body.durationMinutes }),
        ...(body.type && { type: body.type }),
        ...(body.status && { status: body.status }),
        ...(body.notes !== undefined && { notes: body.notes }),
        ...(body.priority && { priority: body.priority }),
        ...(body.workflowStage && { workflowStage: body.workflowStage }),
        ...(body.cancellationNote && { cancellationNote: body.cancellationNote }),
      },
      include: {
        patient: { select: { id: true, firstName: true, lastName: true, patientCode: true } },
        doctor: { select: { id: true, name: true, speciality: true } },
      },
    });

    // Re-sync room status whenever something that could move the room
    // across the active/inactive line changed: status transition, room
    // reassignment, or both. Sync the OLD room too if the appointment
    // moved off it, so it can flip back to AVAILABLE.
    if (body.status || body.roomId !== undefined) {
      await syncRoomStatus(appointment.roomId);
      if (body.roomId !== undefined && existing.roomId && existing.roomId !== appointment.roomId) {
        await syncRoomStatus(existing.roomId);
      }
    }

    return NextResponse.json({ success: true, data: appointment });
  } catch (error) {
    const maybe = error as Error & { code?: string };
    if (/exclusion_violation|23P01|no_doctor_overlap|no_room_overlap/i.test(String(maybe?.message || ""))) {
      return NextResponse.json(
        { success: false, error: "Time slot not available (concurrent booking detected)" },
        { status: 409 }
      );
    }
    logger.api("PUT", "/api/appointments/[id]", error);
    return NextResponse.json(
      { success: false, error: "Failed to update appointment" },
      { status: 500 }
    );
  }
}

export async function DELETE(
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
      data: { status: "CANCELLED" },
    });

    // Free the room if no other active appointments still hold it.
    await syncRoomStatus(appointment.roomId);

    return NextResponse.json({ success: true, data: appointment });
  } catch (error) {
    logger.api("DELETE", "/api/appointments/[id]", error);
    return NextResponse.json(
      { success: false, error: "Failed to cancel appointment" },
      { status: 500 }
    );
  }
}
