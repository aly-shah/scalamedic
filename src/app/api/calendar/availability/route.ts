/**
 * @system MediCore ERP — Availability Finder
 * @route GET /api/calendar/availability — Find next available slots
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

import { toClinicDay } from "@/lib/utils";
import { requireAuth } from "@/lib/require-auth";
import { logger } from "@/lib/logger";
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

export async function GET(request: Request) {
  try {
    const auth = await requireAuth();
    if (auth.response) return auth.response;

    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type") || "CONSULTATION";
    const doctorId = searchParams.get("doctorId");
    const branchId = searchParams.get("branchId");
    const durationMins = parseInt(searchParams.get("duration") || "30");
    const limit = parseInt(searchParams.get("limit") || "5");

    const today = new Date();
    const clinicStart = 8 * 60;
    const clinicEnd = 18 * 60;

    // Fetch doctors
    const doctorWhere: Record<string, unknown> = { role: "DOCTOR", isActive: true };
    if (doctorId) doctorWhere.id = doctorId;
    if (branchId) doctorWhere.branchId = branchId;
    const doctors = await prisma.user.findMany({
      where: doctorWhere,
      select: { id: true, name: true, speciality: true, branchId: true },
    });

    // Fetch schedules
    const schedules = await prisma.doctorSchedule.findMany({
      where: { ...(doctorId && { doctorId }), isActive: true },
      select: { doctorId: true, dayOfWeek: true, startTime: true, endTime: true, breakStart: true, breakEnd: true, slotMinutes: true },
    });

    // Search the next 14 days for availability
    const slots: { date: string; time: string; endTime: string; doctorId: string; doctorName: string; speciality: string }[] = [];

    for (let dayOffset = 0; dayOffset < 14 && slots.length < limit; dayOffset++) {
      const date = new Date(today);
      date.setDate(today.getDate() + dayOffset);
      const dateStr = toClinicDay(date);
      const dayOfWeek = getDayOfWeek(date);

      // Skip if today and past clinic hours
      const nowMins = dayOffset === 0 ? today.getHours() * 60 + today.getMinutes() : 0;

      for (const doc of doctors) {
        if (slots.length >= limit) break;

        // Check leave
        const onLeave = await prisma.doctorLeave.findFirst({
          where: {
            doctorId: doc.id, status: "APPROVED",
            startDate: { lte: date }, endDate: { gte: date },
          },
        });
        if (onLeave) continue;

        // Get schedule
        const schedule = schedules.find((s) => s.doctorId === doc.id && s.dayOfWeek === dayOfWeek);
        const docStart = schedule ? timeToMinutes(schedule.startTime) : clinicStart;
        const docEnd = schedule ? timeToMinutes(schedule.endTime) : clinicEnd;
        const breakStart = schedule?.breakStart ? timeToMinutes(schedule.breakStart) : null;
        const breakEnd = schedule?.breakEnd ? timeToMinutes(schedule.breakEnd) : null;
        const slotMins = schedule?.slotMinutes || 30;

        // Get existing appointments
        const appts = await prisma.appointment.findMany({
          where: { doctorId: doc.id, date, status: { notIn: ["CANCELLED", "NO_SHOW"] } },
          select: { startTime: true, endTime: true },
        });

        // Get blocked slots
        const blocked = await prisma.blockedSlot.findMany({
          where: { doctorId: doc.id, date },
          select: { startTime: true, endTime: true },
        });

        // Find free slots
        for (let t = Math.max(docStart, nowMins); t + durationMins <= docEnd; t += slotMins) {
          if (slots.length >= limit) break;

          // Check break
          if (breakStart !== null && breakEnd !== null && t >= breakStart && t < breakEnd) continue;

          // Check appointments overlap
          const slotStart = t;
          const slotEnd = t + durationMins;
          const hasConflict = appts.some((a) => {
            const aStart = timeToMinutes(a.startTime);
            const aEnd = timeToMinutes(a.endTime);
            return slotStart < aEnd && slotEnd > aStart;
          });
          if (hasConflict) continue;

          // Check blocked overlap
          const isBlocked = blocked.some((b) => {
            const bStart = timeToMinutes(b.startTime);
            const bEnd = timeToMinutes(b.endTime);
            return slotStart < bEnd && slotEnd > bStart;
          });
          if (isBlocked) continue;

          slots.push({
            date: dateStr,
            time: minutesToTime(t),
            endTime: minutesToTime(slotEnd),
            doctorId: doc.id,
            doctorName: doc.name,
            speciality: doc.speciality || "",
          });
        }
      }
    }

    return NextResponse.json({ success: true, data: slots });
  } catch (error) {
    logger.api("GET", "/api/calendar/availability", error);
    return NextResponse.json({ success: false, error: "Failed to find availability" }, { status: 500 });
  }
}
