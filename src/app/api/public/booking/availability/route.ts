/**
 * @system ScalaMedic — Public booking: availability
 * @route GET /api/public/booking/availability?doctorId=...&date=YYYY-MM-DD
 *
 * Anonymous endpoint. Returns the free 30-minute slots for one
 * doctor on one date, derived from:
 *
 *   DoctorSchedule(dayOfWeek)            → start / end / break / slot-min
 *   minus DoctorLeave(date in range)     → if APPROVED leave, no slots
 *   minus Appointment(doctorId, date)    → excluding CANCELLED / NO_SHOW
 *   minus BlockedSlot(doctorId, date)    → admin overrides
 *
 * Algorithm is the same one /api/calendar/availability uses, scoped
 * to a single (doctor, date) pair to keep the response trim. Slots
 * are also filtered so a slot starting in the past (today only) is
 * not offered.
 *
 * Tenant resolution + rate limiting mirror the doctors endpoint.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { tenantIdForHostname } from "@/lib/tenant";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

function clientIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}
function minutesToTime(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}
function dayOfWeekFor(date: Date): "SUNDAY" | "MONDAY" | "TUESDAY" | "WEDNESDAY" | "THURSDAY" | "FRIDAY" | "SATURDAY" {
  return (["SUNDAY","MONDAY","TUESDAY","WEDNESDAY","THURSDAY","FRIDAY","SATURDAY"] as const)[date.getUTCDay()];
}

export async function GET(request: Request) {
  try {
    const ip = clientIp(request);
    const rl = checkRateLimit(ip, RATE_LIMITS.PUBLIC_BOOKING_READ);
    if (!rl.ok) {
      return NextResponse.json(
        { success: false, error: `Too many requests. Try again in ${Math.ceil(rl.retryAfter / 60)} min.` },
        { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
      );
    }

    const host = request.headers.get("host") || "";
    const tenantId = await tenantIdForHostname(host);
    if (!tenantId) {
      return NextResponse.json(
        { success: false, error: "Booking is not available on this hostname." },
        { status: 404 },
      );
    }

    const { searchParams } = new URL(request.url);
    const doctorId = searchParams.get("doctorId");
    const dateStr = searchParams.get("date");        // YYYY-MM-DD
    const durationMins = Math.max(15, Math.min(120, parseInt(searchParams.get("duration") || "30")));

    if (!doctorId || !dateStr) {
      return NextResponse.json(
        { success: false, error: "doctorId and date are required" },
        { status: 400 },
      );
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      return NextResponse.json(
        { success: false, error: "date must be YYYY-MM-DD" },
        { status: 400 },
      );
    }

    // Verify the doctor belongs to this tenant — protects against
    // booking-against-another-tenant via doctorId shopping.
    const doctor = await prisma.user.findFirst({
      where: { id: doctorId, role: "DOCTOR", isActive: true, tenantId },
      select: { id: true },
    });
    if (!doctor) {
      return NextResponse.json(
        { success: false, error: "Doctor not found." },
        { status: 404 },
      );
    }

    // Parse date as UTC midnight — matches how appointments are
    // stored (date column = @db.Date, no time component).
    const date = new Date(`${dateStr}T00:00:00.000Z`);
    const dayOfWeek = dayOfWeekFor(date);

    // Reject past dates.
    const todayUtc = new Date();
    todayUtc.setUTCHours(0, 0, 0, 0);
    if (date < todayUtc) {
      return NextResponse.json({ success: true, data: { slots: [], reason: "PAST_DATE" } });
    }

    // Doctor schedule for that day of week. On the public booking
    // surface, a missing schedule row means "this doctor isn't
    // working that day" — return zero slots with a reason so the UI
    // can prompt "try another date" rather than offering a default
    // 08-18 window that doesn't reflect actual availability.
    const schedule = await prisma.doctorSchedule.findFirst({
      where: { doctorId, dayOfWeek, isActive: true },
      select: { startTime: true, endTime: true, breakStart: true, breakEnd: true, slotMinutes: true },
    });
    if (!schedule) {
      return NextResponse.json({
        success: true,
        data: { doctorId, date: dateStr, durationMinutes: durationMins, slots: [], reason: "DAY_OFF" },
      });
    }
    const docStart = timeToMinutes(schedule.startTime);
    const docEnd   = timeToMinutes(schedule.endTime);
    const slotMins = schedule.slotMinutes ?? 30;
    const breakStart = schedule.breakStart ? timeToMinutes(schedule.breakStart) : null;
    const breakEnd   = schedule.breakEnd   ? timeToMinutes(schedule.breakEnd)   : null;

    // APPROVED leave covering the date → no slots.
    const onLeave = await prisma.doctorLeave.findFirst({
      where: { doctorId, status: "APPROVED", startDate: { lte: date }, endDate: { gte: date } },
      select: { id: true },
    });
    if (onLeave) return NextResponse.json({ success: true, data: { slots: [], reason: "ON_LEAVE" } });

    // Booked appointments + blocked slots on that date.
    const [appts, blocked] = await Promise.all([
      prisma.appointment.findMany({
        where: { doctorId, date, status: { notIn: ["CANCELLED", "NO_SHOW"] } },
        select: { startTime: true, endTime: true },
      }),
      prisma.blockedSlot.findMany({
        where: { doctorId, date },
        select: { startTime: true, endTime: true },
      }),
    ]);

    // If date == today, hide slots that start in the past.
    const isToday = date.getTime() === todayUtc.getTime();
    const nowMins = isToday ? new Date().getHours() * 60 + new Date().getMinutes() : 0;

    const slots: Array<{ startTime: string; endTime: string }> = [];
    for (let t = Math.max(docStart, nowMins); t + durationMins <= docEnd; t += slotMins) {
      if (breakStart !== null && breakEnd !== null && t >= breakStart && t < breakEnd) continue;
      const slotEnd = t + durationMins;
      const hasAppt = appts.some((a) => {
        const aS = timeToMinutes(a.startTime), aE = timeToMinutes(a.endTime);
        return t < aE && slotEnd > aS;
      });
      if (hasAppt) continue;
      const isBlocked = blocked.some((b) => {
        const bS = timeToMinutes(b.startTime), bE = timeToMinutes(b.endTime);
        return t < bE && slotEnd > bS;
      });
      if (isBlocked) continue;
      slots.push({ startTime: minutesToTime(t), endTime: minutesToTime(slotEnd) });
    }

    return NextResponse.json({
      success: true,
      data: {
        doctorId,
        date: dateStr,
        durationMinutes: durationMins,
        slots,
      },
    });
  } catch (error) {
    logger.api("GET", "/api/public/booking/availability", error);
    return NextResponse.json(
      { success: false, error: "Failed to load availability" },
      { status: 500 },
    );
  }
}
