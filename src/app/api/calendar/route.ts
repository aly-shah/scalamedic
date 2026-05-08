/**
 * @system MediCore ERP — Calendar API
 * @route GET /api/calendar — Get calendar data for a date range with computed availability
 * @route POST /api/calendar — Block a time slot
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

import { getClinicToday, toClinicDay } from "@/lib/utils";
import { requireAuth } from "@/lib/require-auth";
import { logger } from "@/lib/logger";
import { getClinicHours } from "@/lib/clinic-hours";
// ---- Helpers ----

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function minutesToTime(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

function getDayOfWeek(date: Date): string {
  return ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"][date.getDay()];
}

interface SlotInfo {
  time: string;
  endTime: string;
  status: "available" | "booked" | "checked_in" | "in_progress" | "completed" | "blocked" | "unavailable" | "no_show" | "cancelled";
  appointment?: Record<string, unknown>;
  blocked?: Record<string, unknown>;
}

// ---- GET: Calendar data ----

export async function GET(request: Request) {
  try {
    const auth = await requireAuth();
    if (auth.response) return auth.response;

    const { searchParams } = new URL(request.url);
    const dateStr = searchParams.get("date") || getClinicToday();
    const endDateStr = searchParams.get("endDate"); // for week view
    const doctorId = searchParams.get("doctorId");
    const roomId = searchParams.get("roomId");
    const branchId = searchParams.get("branchId");
    const view = searchParams.get("view") || "day"; // day | week
    const slotMinutes = parseInt(searchParams.get("slotMinutes") || "30");

    const startDate = new Date(dateStr);
    const endDate = endDateStr ? new Date(endDateStr) : new Date(dateStr);

    // Build date range
    const dates: string[] = [];
    const current = new Date(startDate);
    while (current <= endDate) {
      dates.push(toClinicDay(current));
      current.setDate(current.getDate() + 1);
    }

    // Fetch doctors
    const doctorWhere: Record<string, unknown> = { role: "DOCTOR", isActive: true };
    if (doctorId) doctorWhere.id = doctorId;
    if (branchId) doctorWhere.branchId = branchId;

    const doctors = await prisma.user.findMany({
      where: doctorWhere,
      select: { id: true, name: true, speciality: true, avatar: true, branchId: true },
      orderBy: { name: "asc" },
    });

    // Fetch rooms
    const roomWhere: Record<string, unknown> = {};
    if (roomId) roomWhere.id = roomId;
    if (branchId) roomWhere.branchId = branchId;

    const rooms = await prisma.room.findMany({
      where: roomWhere,
      select: { id: true, name: true, type: true, status: true, branchId: true },
      orderBy: { name: "asc" },
    });

    // Fetch appointments for the date range
    const appointments = await prisma.appointment.findMany({
      where: {
        date: { gte: startDate, lte: endDate },
        ...(doctorId && { doctorId }),
        ...(branchId && { branchId }),
        status: { notIn: ["CANCELLED"] },
      },
      include: {
        patient: { select: { id: true, firstName: true, lastName: true, patientCode: true, phone: true } },
        doctor: { select: { id: true, name: true } },
        room: { select: { id: true, name: true, type: true } },
      },
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
    });

    // Fetch doctor schedules
    const schedules = await prisma.doctorSchedule.findMany({
      where: {
        ...(doctorId && { doctorId }),
        isActive: true,
      },
      select: { doctorId: true, dayOfWeek: true, startTime: true, endTime: true, breakStart: true, breakEnd: true, slotMinutes: true },
    });

    // Fetch doctor leaves for the date range
    const leaves = await prisma.doctorLeave.findMany({
      where: {
        ...(doctorId && { doctorId }),
        status: "APPROVED",
        startDate: { lte: endDate },
        endDate: { gte: startDate },
      },
      select: { doctorId: true, startDate: true, endDate: true, type: true, reason: true },
    });

    // Fetch blocked slots
    const blockedSlots = await prisma.blockedSlot.findMany({
      where: {
        date: { gte: startDate, lte: endDate },
        ...(doctorId && { doctorId }),
        ...(roomId && { roomId }),
      },
      select: { id: true, doctorId: true, roomId: true, date: true, startTime: true, endTime: true, type: true, reason: true },
    });

    // ---- Compute availability per date per doctor ----
    const calendarData: Record<string, {
      date: string;
      doctors: {
        doctor: Record<string, unknown>;
        slots: SlotInfo[];
        isOnLeave: boolean;
        leaveReason?: string;
      }[];
      rooms: {
        room: Record<string, unknown>;
        slots: SlotInfo[];
      }[];
    }> = {};

    // Clinic-wide working hours + days from /admin/settings →
    // Appointments. Falls back to 8:00-18:00 / Mon-Sat if those rows
    // aren't set yet (fresh install). Single fetch — same hours apply
    // to every doctor's slot grid for this day.
    const hours = await getClinicHours();
    const clinicStart = hours.opensAtMin;
    const clinicEnd = hours.closesAtMin;

    for (const dateKey of dates) {
      const dateObj = new Date(dateKey + "T00:00:00");
      const dayOfWeek = getDayOfWeek(dateObj);
      // If the clinic is closed on this weekday (e.g. Sundays), every
      // slot for every doctor + room renders as unavailable regardless
      // of doctor schedule. Reception can still hard-book by editing
      // the appointment row, but the picker hides closed days.
      const clinicClosedToday = !hours.isWorkingDay(dateObj);

      // Doctor slots
      const doctorSlots = doctors.map((doc) => {
        // Check leave
        const onLeave = leaves.some((l) =>
          l.doctorId === doc.id &&
          new Date(l.startDate) <= dateObj &&
          new Date(l.endDate) >= dateObj
        );
        const leaveInfo = leaves.find((l) =>
          l.doctorId === doc.id &&
          new Date(l.startDate) <= dateObj &&
          new Date(l.endDate) >= dateObj
        );

        // Get schedule for this day
        const schedule = schedules.find((s) => s.doctorId === doc.id && s.dayOfWeek === dayOfWeek);
        const docStart = schedule ? timeToMinutes(schedule.startTime) : clinicStart;
        const docEnd = schedule ? timeToMinutes(schedule.endTime) : clinicEnd;
        const breakStart = schedule?.breakStart ? timeToMinutes(schedule.breakStart) : null;
        const breakEnd = schedule?.breakEnd ? timeToMinutes(schedule.breakEnd) : null;
        const docSlotMins = schedule?.slotMinutes || slotMinutes;

        // Get appointments for this doctor on this date
        const docAppointments = appointments.filter((a) =>
          a.doctorId === doc.id && toClinicDay(a.date) === dateKey
        );

        // Get blocked slots for this doctor
        const docBlocked = blockedSlots.filter((b) =>
          b.doctorId === doc.id && toClinicDay(b.date) === dateKey
        );

        // Generate time slots
        const slots: SlotInfo[] = [];
        for (let t = clinicStart; t < clinicEnd; t += docSlotMins) {
          const slotTime = minutesToTime(t);
          const slotEnd = minutesToTime(t + docSlotMins);

          // Clinic-wide closure (Sunday by default) trumps everything
          // else — no doctor works when the clinic isn't open.
          if (clinicClosedToday) {
            slots.push({ time: slotTime, endTime: slotEnd, status: "unavailable" });
            continue;
          }

          if (onLeave) {
            slots.push({ time: slotTime, endTime: slotEnd, status: "unavailable" });
            continue;
          }

          // Outside working hours
          if (t < docStart || t >= docEnd) {
            slots.push({ time: slotTime, endTime: slotEnd, status: "unavailable" });
            continue;
          }

          // Break time
          if (breakStart !== null && breakEnd !== null && t >= breakStart && t < breakEnd) {
            slots.push({ time: slotTime, endTime: slotEnd, status: "blocked", blocked: { type: "BREAK", reason: "Break" } });
            continue;
          }

          // Check blocked
          const blocked = docBlocked.find((b) =>
            timeToMinutes(b.startTime) <= t && timeToMinutes(b.endTime) > t
          );
          if (blocked) {
            slots.push({ time: slotTime, endTime: slotEnd, status: "blocked", blocked: { id: blocked.id, type: blocked.type, reason: blocked.reason } });
            continue;
          }

          // Check appointment
          const appt = docAppointments.find((a) =>
            timeToMinutes(a.startTime) <= t && timeToMinutes(a.endTime) > t
          );
          if (appt) {
            const statusMap: Record<string, SlotInfo["status"]> = {
              SCHEDULED: "booked", CONFIRMED: "booked",
              CHECKED_IN: "checked_in", WAITING: "checked_in",
              IN_PROGRESS: "in_progress",
              COMPLETED: "completed",
              NO_SHOW: "no_show",
              CANCELLED: "cancelled",
            };
            slots.push({
              time: slotTime,
              endTime: slotEnd,
              status: statusMap[appt.status] || "booked",
              appointment: {
                id: appt.id, appointmentCode: appt.appointmentCode,
                patientName: `${appt.patient.firstName} ${appt.patient.lastName}`,
                patientCode: appt.patient.patientCode,
                patientId: appt.patient.id,
                doctorName: appt.doctor.name,
                type: appt.type, status: appt.status,
                startTime: appt.startTime, endTime: appt.endTime,
                roomName: appt.room?.name || null,
                priority: appt.priority,
              },
            });
            continue;
          }

          // Available
          slots.push({ time: slotTime, endTime: slotEnd, status: "available" });
        }

        return {
          doctor: { id: doc.id, name: doc.name, speciality: doc.speciality, avatar: doc.avatar },
          slots,
          isOnLeave: onLeave,
          leaveReason: leaveInfo?.reason || leaveInfo?.type,
        };
      });

      // Room slots
      const roomSlots = rooms.map((room) => {
        const roomAppts = appointments.filter((a) =>
          a.roomId === room.id && toClinicDay(a.date) === dateKey
        );
        const roomBlocked = blockedSlots.filter((b) =>
          b.roomId === room.id && toClinicDay(b.date) === dateKey
        );

        const slots: SlotInfo[] = [];
        for (let t = clinicStart; t < clinicEnd; t += slotMinutes) {
          const slotTime = minutesToTime(t);
          const slotEnd = minutesToTime(t + slotMinutes);

          // Same clinic-wide closure rule as the doctor loop above —
          // rooms are closed when the clinic is closed.
          if (clinicClosedToday) {
            slots.push({ time: slotTime, endTime: slotEnd, status: "unavailable" });
            continue;
          }

          if (room.status === "MAINTENANCE") {
            slots.push({ time: slotTime, endTime: slotEnd, status: "unavailable" });
            continue;
          }

          const blocked = roomBlocked.find((b) =>
            timeToMinutes(b.startTime) <= t && timeToMinutes(b.endTime) > t
          );
          if (blocked) {
            slots.push({ time: slotTime, endTime: slotEnd, status: "blocked", blocked: { id: blocked.id, type: blocked.type, reason: blocked.reason } });
            continue;
          }

          const appt = roomAppts.find((a) =>
            timeToMinutes(a.startTime) <= t && timeToMinutes(a.endTime) > t
          );
          if (appt) {
            slots.push({
              time: slotTime, endTime: slotEnd, status: "booked",
              appointment: {
                id: appt.id, patientName: `${appt.patient.firstName} ${appt.patient.lastName}`,
                doctorName: appt.doctor.name, type: appt.type, status: appt.status,
              },
            });
            continue;
          }

          slots.push({ time: slotTime, endTime: slotEnd, status: "available" });
        }

        return { room: { id: room.id, name: room.name, type: room.type, status: room.status }, slots };
      });

      calendarData[dateKey] = { date: dateKey, doctors: doctorSlots, rooms: roomSlots };
    }

    // Summary stats
    const todayKey = dates[0];
    const todayData = calendarData[todayKey];
    const totalSlots = todayData?.doctors.reduce((sum, d) => sum + d.slots.length, 0) || 0;
    const availableSlots = todayData?.doctors.reduce((sum, d) => sum + d.slots.filter((s) => s.status === "available").length, 0) || 0;
    const bookedSlots = todayData?.doctors.reduce((sum, d) => sum + d.slots.filter((s) => ["booked", "checked_in", "in_progress"].includes(s.status)).length, 0) || 0;
    const availableRooms = todayData?.rooms.filter((r) => r.slots.some((s) => s.status === "available")).length || 0;

    return NextResponse.json({
      success: true,
      data: calendarData,
      summary: { totalSlots, availableSlots, bookedSlots, availableRooms, doctorCount: doctors.length, roomCount: rooms.length },
      // Echo the working-hours snapshot so the calendar page can show
      // a "Clinic closed today" banner / opens-at label without having
      // to hit /api/settings separately.
      clinicHours: {
        opensAt: hours.opensAt,
        closesAt: hours.closesAt,
        workingDays: hours.workingDays,
      },
    });
  } catch (error) {
    logger.api("GET", "/api/calendar", error);
    return NextResponse.json({ success: false, error: "Failed to load calendar" }, { status: 500 });
  }
}

// ---- POST: Block a slot ----

export async function POST(request: Request) {
  try {
    const auth = await requireAuth();
    if (auth.response) return auth.response;

    const body = await request.json();

    if (!body.date || !body.startTime || !body.endTime || !body.type) {
      return NextResponse.json({ success: false, error: "Missing required: date, startTime, endTime, type" }, { status: 400 });
    }

    const blocked = await prisma.blockedSlot.create({
      data: {
        doctorId: body.doctorId || null,
        roomId: body.roomId || null,
        branchId: body.branchId || null,
        date: new Date(body.date),
        startTime: body.startTime,
        endTime: body.endTime,
        type: body.type,
        reason: body.reason || null,
        createdById: body.createdById || null,
      },
    });

    return NextResponse.json({ success: true, data: blocked }, { status: 201 });
  } catch (error) {
    logger.api("POST", "/api/calendar", error);
    return NextResponse.json({ success: false, error: "Failed to block slot" }, { status: 500 });
  }
}
