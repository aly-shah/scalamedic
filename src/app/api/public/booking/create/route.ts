/**
 * @system ScalaMedic — Public booking: create
 * @route POST /api/public/booking/create
 *
 * Anonymous public POST. Creates (or matches) a Patient and a real
 * Appointment in one transaction.
 *
 * Patient matching: by exact phone within the tenant. If a row
 * exists, we reuse it (don't overwrite name / DOB / email — those
 * stay whatever they were). If not, we create a fresh row with
 * source=WEBSITE and consentGiven=true (the booking form's submit
 * button is the consent gesture; consentGiven is required by the
 * v11 CHECK constraint).
 *
 * Appointment defaults: status=SCHEDULED, workflowStage=BOOKED,
 * type=CONSULTATION, duration=30 min. createdById is the chosen
 * doctor's id (we have no receptionist session here; the appointment
 * audit log uses the doctor as the proximate creator).
 *
 * GIST exclusion (no_doctor_overlap / no_room_overlap) is the
 * DB-tier backstop against race conditions if two patients click
 * "Book" on the same slot in the same millisecond. The catch block
 * recognises that error and returns a friendly 409.
 *
 * Rate limit: 10 successful bookings per IP per hour. A patient
 * booking 10 visits in an hour is implausible; 10 spam attempts is.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { tenantIdForHostname } from "@/lib/tenant";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { logAudit } from "@/lib/audit";
import { logger } from "@/lib/logger";

function clientIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

function pad(n: number, w: number): string {
  return String(n).padStart(w, "0");
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function minutesToTime(mins: number): string {
  return `${pad(Math.floor(mins / 60), 2)}:${pad(mins % 60, 2)}`;
}

interface BookingRequest {
  doctorId: string;
  date: string;           // YYYY-MM-DD
  startTime: string;      // HH:MM
  durationMinutes?: number;
  firstName: string;
  lastName: string;
  phone: string;
  email?: string;
  dateOfBirth?: string;   // YYYY-MM-DD, optional
  gender?: "MALE" | "FEMALE" | "OTHER";
  reason?: string;        // chief complaint
}

function validate(body: unknown): BookingRequest | { error: string } {
  if (!body || typeof body !== "object") return { error: "Invalid request body" };
  const b = body as Record<string, unknown>;
  const need = (k: string) => typeof b[k] === "string" && (b[k] as string).trim().length > 0;
  if (!need("doctorId")) return { error: "doctorId is required" };
  if (!need("date")) return { error: "date is required" };
  if (!need("startTime")) return { error: "startTime is required" };
  if (!need("firstName")) return { error: "firstName is required" };
  if (!need("lastName")) return { error: "lastName is required" };
  if (!need("phone")) return { error: "phone is required" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(b.date as string)) return { error: "date must be YYYY-MM-DD" };
  if (!/^\d{2}:\d{2}$/.test(b.startTime as string)) return { error: "startTime must be HH:MM" };
  const phone = (b.phone as string).trim();
  if (phone.length < 6 || phone.length > 32) return { error: "phone length out of range" };
  const firstName = (b.firstName as string).trim();
  const lastName  = (b.lastName as string).trim();
  if (firstName.length > 60 || lastName.length > 60) return { error: "name too long" };
  return {
    doctorId: (b.doctorId as string).trim(),
    date: (b.date as string).trim(),
    startTime: (b.startTime as string).trim(),
    durationMinutes: typeof b.durationMinutes === "number" ? Math.max(15, Math.min(120, b.durationMinutes)) : 30,
    firstName,
    lastName,
    phone,
    email: typeof b.email === "string" && b.email.trim() ? b.email.trim().slice(0, 180) : undefined,
    dateOfBirth: typeof b.dateOfBirth === "string" && /^\d{4}-\d{2}-\d{2}$/.test(b.dateOfBirth) ? b.dateOfBirth : undefined,
    gender: b.gender === "MALE" || b.gender === "FEMALE" || b.gender === "OTHER" ? b.gender : undefined,
    reason: typeof b.reason === "string" ? b.reason.trim().slice(0, 1000) : undefined,
  };
}

export async function POST(request: Request) {
  try {
    const ip = clientIp(request);
    const rl = checkRateLimit(ip, RATE_LIMITS.PUBLIC_BOOKING_CREATE);
    if (!rl.ok) {
      return NextResponse.json(
        { success: false, error: `Too many bookings from this network. Try again in ${Math.ceil(rl.retryAfter / 60)} min.` },
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

    const body = await request.json().catch(() => null);
    const v = validate(body);
    if ("error" in v) {
      return NextResponse.json({ success: false, error: v.error }, { status: 400 });
    }

    // Verify the doctor belongs to this tenant and pull their branch.
    const doctor = await prisma.user.findFirst({
      where: { id: v.doctorId, role: "DOCTOR", isActive: true, tenantId },
      select: { id: true, branchId: true },
    });
    if (!doctor) {
      return NextResponse.json(
        { success: false, error: "Doctor not found." },
        { status: 404 },
      );
    }

    // Past-date guard.
    const apptDate = new Date(`${v.date}T00:00:00.000Z`);
    const todayUtc = new Date();
    todayUtc.setUTCHours(0, 0, 0, 0);
    if (apptDate < todayUtc) {
      return NextResponse.json({ success: false, error: "Cannot book in the past." }, { status: 400 });
    }

    // Compute endTime from startTime + duration.
    const endMins = timeToMinutes(v.startTime) + (v.durationMinutes ?? 30);
    if (endMins > 24 * 60) {
      return NextResponse.json({ success: false, error: "Slot spills past midnight." }, { status: 400 });
    }
    const endTime = minutesToTime(endMins);

    // Try transaction: find-or-create patient + create appointment.
    // GIST exclusion on the appointments table is the final guard
    // against a race (two patients picking the same slot).
    const result = await prisma.$transaction(async (tx) => {
      // Match patient by exact phone within the tenant.
      let patient = await tx.patient.findFirst({
        where: { tenantId, phone: v.phone, deletedAt: null },
        select: { id: true, patientCode: true },
      });

      if (!patient) {
        // Generate next patient code (per-tenant MAX+1).
        const lastPatient = await tx.patient.findFirst({
          where: { tenantId, patientCode: { startsWith: "PT-" } },
          orderBy: { patientCode: "desc" },
          select: { patientCode: true },
        });
        const lastNum = lastPatient
          ? parseInt(lastPatient.patientCode.replace("PT-", ""), 10)
          : 0;
        const patientCode = `PT-${pad(lastNum + 1, 4)}`;

        patient = await tx.patient.create({
          data: {
            patientCode,
            firstName: v.firstName,
            lastName: v.lastName,
            phone: v.phone,
            email: v.email ?? null,
            dateOfBirth: v.dateOfBirth ? new Date(`${v.dateOfBirth}T00:00:00.000Z`) : null,
            gender: v.gender ?? "OTHER",
            branchId: doctor.branchId,
            tenantId,
            assignedDoctorId: doctor.id,
            consentGiven: true,    // submit button = consent gesture for the booking
            isActive: true,
            source: "WEBSITE",
          },
          select: { id: true, patientCode: true },
        });
      }

      // Generate next appointment code.
      const lastApt = await tx.appointment.findFirst({
        where: { tenantId, appointmentCode: { startsWith: "APT-" } },
        orderBy: { appointmentCode: "desc" },
        select: { appointmentCode: true },
      });
      const lastAptNum = lastApt
        ? parseInt(lastApt.appointmentCode.replace("APT-", ""), 10)
        : 0;
      const appointmentCode = `APT-${pad(lastAptNum + 1, 4)}`;

      const appt = await tx.appointment.create({
        data: {
          appointmentCode,
          patientId: patient.id,
          doctorId: doctor.id,
          branchId: doctor.branchId,
          tenantId,
          date: apptDate,
          startTime: v.startTime,
          endTime,
          durationMinutes: v.durationMinutes ?? 30,
          type: "CONSULTATION",
          status: "SCHEDULED",
          workflowStage: "BOOKED",
          notes: v.reason ? `Reason (public booking): ${v.reason}` : null,
          createdById: doctor.id,
        },
        select: {
          id: true,
          appointmentCode: true,
          date: true,
          startTime: true,
          endTime: true,
        },
      });

      return { patient, appointment: appt };
    });

    await logAudit({
      userId: null,
      action: "CREATE",
      module: "APPOINTMENT",
      entityType: "Appointment",
      entityId: result.appointment.id,
      details: {
        source: "PUBLIC_BOOKING",
        patientCode: result.patient.patientCode,
        appointmentCode: result.appointment.appointmentCode,
        ip,
      },
    });

    return NextResponse.json(
      {
        success: true,
        data: {
          appointmentId: result.appointment.id,
          appointmentCode: result.appointment.appointmentCode,
          patientCode: result.patient.patientCode,
          date: v.date,
          startTime: result.appointment.startTime,
          endTime: result.appointment.endTime,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    const msg = String((error as { message?: string })?.message || "");
    // GIST exclusion: another booking landed on this slot first.
    // 409 with a friendly message so the form can prompt a re-pick.
    if (/exclusion_violation|23P01|no_doctor_overlap|no_room_overlap/i.test(msg)) {
      return NextResponse.json(
        {
          success: false,
          error: "That time slot was just booked by someone else. Please pick another.",
          code: "SLOT_TAKEN",
        },
        { status: 409 },
      );
    }
    logger.api("POST", "/api/public/booking/create", error);
    return NextResponse.json(
      { success: false, error: "Failed to create booking" },
      { status: 500 },
    );
  }
}
