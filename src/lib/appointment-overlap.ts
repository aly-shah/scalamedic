import type { Prisma } from "@prisma/client";
import type { prisma as appPrisma } from "./prisma";

// Accept either the top-level extended client OR the in-transaction
// client of the same. The two types diverge once you wrap PrismaClient
// in `$extends`, so we extract the in-tx shape directly from the
// extended client's `$transaction` callback signature instead of
// referencing the bare `Prisma.TransactionClient` (which doesn't
// match the extension's inner client).
type ExtendedTx = Parameters<Parameters<typeof appPrisma.$transaction>[0]>[0];
type Tx = typeof appPrisma | ExtendedTx;

export interface ConflictCheckParams {
  doctorId: string;
  date: Date;
  startTime: string;       // "HH:MM" zero-padded 24h
  endTime: string;         // "HH:MM"
  roomId?: string | null;
  excludeAppointmentId?: string | null;
}

export interface Conflict {
  kind: "doctor" | "room" | "blocked_slot";
  appointmentId?: string;
  appointmentCode?: string;
  blockedSlotId?: string;
  startTime: string;
  endTime: string;
  description: string;
}

const BLOCKING_STATUSES = ["SCHEDULED", "CONFIRMED", "CHECKED_IN", "WAITING", "IN_PROGRESS", "COMPLETED"] as const;

/**
 * Returns all conflicts for a proposed appointment slot. Empty array means the
 * slot is free. Overlap uses the standard half-open interval test:
 *   existing.startTime < proposed.endTime AND existing.endTime > proposed.startTime
 * Time strings are lex-compared, which is correct for zero-padded "HH:MM".
 */
export async function findAppointmentConflicts(tx: Tx, params: ConflictCheckParams): Promise<Conflict[]> {
  const { doctorId, date, startTime, endTime, roomId, excludeAppointmentId } = params;

  const baseWhere: Prisma.AppointmentWhereInput = {
    date,
    status: { in: [...BLOCKING_STATUSES] },
    startTime: { lt: endTime },
    endTime: { gt: startTime },
    ...(excludeAppointmentId && { NOT: { id: excludeAppointmentId } }),
  };

  const [doctorHits, roomHits, slotHits] = await Promise.all([
    tx.appointment.findMany({
      where: { ...baseWhere, doctorId },
      select: {
        id: true, appointmentCode: true, startTime: true, endTime: true,
        patient: { select: { firstName: true, lastName: true } },
      },
    }),
    roomId
      ? tx.appointment.findMany({
          where: { ...baseWhere, roomId },
          select: {
            id: true, appointmentCode: true, startTime: true, endTime: true,
            doctor: { select: { name: true } },
          },
        })
      : Promise.resolve([]),
    tx.blockedSlot.findMany({
      where: {
        date,
        startTime: { lt: endTime },
        endTime: { gt: startTime },
        OR: [
          { doctorId },
          ...(roomId ? [{ roomId }] : []),
        ],
      },
      select: { id: true, startTime: true, endTime: true, reason: true, type: true },
    }),
  ]);

  const conflicts: Conflict[] = [];
  for (const a of doctorHits) {
    const who = a.patient ? `${a.patient.firstName} ${a.patient.lastName}` : "another patient";
    conflicts.push({
      kind: "doctor",
      appointmentId: a.id,
      appointmentCode: a.appointmentCode,
      startTime: a.startTime,
      endTime: a.endTime,
      description: `Doctor already has ${a.appointmentCode} with ${who} at ${a.startTime}-${a.endTime}`,
    });
  }
  for (const a of roomHits) {
    conflicts.push({
      kind: "room",
      appointmentId: a.id,
      appointmentCode: a.appointmentCode,
      startTime: a.startTime,
      endTime: a.endTime,
      description: `Room is booked for ${a.appointmentCode} (Dr. ${a.doctor?.name || "—"}) at ${a.startTime}-${a.endTime}`,
    });
  }
  for (const b of slotHits) {
    conflicts.push({
      kind: "blocked_slot",
      blockedSlotId: b.id,
      startTime: b.startTime,
      endTime: b.endTime,
      description: `Slot blocked (${b.type}${b.reason ? ` — ${b.reason}` : ""}) at ${b.startTime}-${b.endTime}`,
    });
  }
  return conflicts;
}
