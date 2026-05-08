/**
 * @system MediCore ERP — Room status sync
 *
 * Room.status is its own column on the Room table, but until now nothing
 * ever wrote to it as appointments moved through the lifecycle. The rooms
 * page kept showing AVAILABLE even with patients checked in.
 *
 * Source-of-truth rule: a room is OCCUPIED iff at least one appointment
 * for *today* (clinic timezone) holds it in an active status. Active means
 * CHECKED_IN, WAITING, or IN_PROGRESS — anything where the patient is
 * physically committed to that room or its waiting bay.
 *
 * SCHEDULED / CONFIRMED don't count: the patient hasn't shown up yet, the
 * room is still bookable. COMPLETED / CANCELLED / NO_SHOW / RESCHEDULED
 * obviously don't count.
 *
 * CLEANING and MAINTENANCE are admin-set states — we never touch them.
 * Reception can clear them manually from the rooms page when ready.
 *
 * Call syncRoomStatus(roomId) after every appointment status change that
 * could move the room across the active/inactive line. Safe to call with
 * a null roomId — it no-ops. Safe to double-call.
 */
import { AppointmentStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { clinicDayRange, getClinicToday } from "@/lib/utils";

const ACTIVE_STATUSES: AppointmentStatus[] = [
  AppointmentStatus.CHECKED_IN,
  AppointmentStatus.WAITING,
  AppointmentStatus.IN_PROGRESS,
];

export async function syncRoomStatus(roomId: string | null | undefined): Promise<void> {
  if (!roomId) return;

  const room = await prisma.room.findUnique({
    where: { id: roomId },
    select: { id: true, status: true },
  });
  if (!room) return;

  // Don't override admin-set states. If a room is in CLEANING/MAINTENANCE
  // it stays that way until an admin clears it from the rooms page.
  if (room.status === "CLEANING" || room.status === "MAINTENANCE") return;

  const dayRange = clinicDayRange(getClinicToday());

  const activeCount = await prisma.appointment.count({
    where: {
      roomId,
      status: { in: ACTIVE_STATUSES },
      date: { gte: dayRange.gte, lt: dayRange.lt },
    },
  });

  const desired = activeCount > 0 ? "OCCUPIED" : "AVAILABLE";
  if (room.status === desired) return;

  await prisma.room.update({
    where: { id: roomId },
    data: { status: desired, isAvailable: desired === "AVAILABLE" },
  });
}

/**
 * For the /api/rooms GET response. Given a list of room IDs, returns a
 * map of roomId → currently occupying appointment (with patient + doctor
 * + checkinTime/start). The rooms page uses this to show "Olivia Harper
 * with Dr. Chen, since 09:14" on each occupied card.
 *
 * "Currently occupying" = the most recently-checked-in active appointment
 * for that room, today. If multiple match (shouldn't happen with overlap
 * exclusion), we pick the latest checkinTime so the card shows whoever
 * is actually in the room right now.
 */
export type CurrentOccupant = {
  patientName: string;
  doctorName: string;
  occupiedSince: string; // ISO timestamp
};

export async function getCurrentOccupants(
  roomIds: string[]
): Promise<Map<string, CurrentOccupant>> {
  if (roomIds.length === 0) return new Map();

  const dayRange = clinicDayRange(getClinicToday());

  const appts = await prisma.appointment.findMany({
    where: {
      roomId: { in: roomIds },
      status: { in: ACTIVE_STATUSES },
      date: { gte: dayRange.gte, lt: dayRange.lt },
    },
    select: {
      roomId: true,
      startTime: true,
      checkinTime: true,
      date: true,
      patient: { select: { firstName: true, lastName: true } },
      doctor: { select: { name: true } },
    },
    orderBy: [{ checkinTime: "desc" }, { startTime: "desc" }],
  });

  const map = new Map<string, CurrentOccupant>();
  for (const a of appts) {
    if (!a.roomId || map.has(a.roomId)) continue; // first wins (latest checkin)
    const patientName = `${a.patient.firstName} ${a.patient.lastName}`.trim();
    // Prefer the actual checkin timestamp; fall back to the scheduled
    // start so we still show *something* when an appointment was bumped
    // to IN_PROGRESS without a recorded checkin.
    const occupiedSince =
      a.checkinTime?.toISOString() ?? `${a.date.toISOString().slice(0, 10)}T${a.startTime}:00`;
    map.set(a.roomId, {
      patientName,
      doctorName: a.doctor.name,
      occupiedSince,
    });
  }
  return map;
}
