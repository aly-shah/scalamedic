/**
 * @system MediCore ERP — Patient timeline
 * @route GET /api/patients/:id/timeline
 *
 * Aggregate clinical timeline: visits, consultation notes,
 * prescriptions, procedures, lab tests, follow-ups, before/after
 * photos — all flattened into a single chronological feed for the
 * doctor-app timeline screen.
 *
 * Each entry carries:
 *   - id (table-qualified, unique across kinds)
 *   - kind (one of the discriminated union below)
 *   - at (ISO timestamp used for sort)
 *   - payload (kind-specific shape)
 *
 * Pagination: not yet — clinical history per patient is bounded
 * (most are < 200 entries even after years). When that breaks,
 * add ?before=<iso>&limit=50 cursor pagination.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/require-auth";
import { logger } from "@/lib/logger";

type TimelineKind =
  | "VISIT"
  | "NOTE"
  | "PRESCRIPTION"
  | "PROCEDURE"
  | "LAB_ORDERED"
  | "LAB_COMPLETED"
  | "FOLLOWUP"
  | "PHOTO";

interface TimelineEntry {
  id: string;
  kind: TimelineKind;
  at: string; // ISO
  payload: Record<string, unknown>;
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth();
    if (auth.response) return auth.response;
    const { id } = await params;

    const [
      appointments,
      notes,
      prescriptions,
      procedures,
      labs,
      followUps,
      photos,
    ] = await Promise.all([
      prisma.appointment.findMany({
        where: { patientId: id },
        orderBy: { date: "desc" },
        take: 50,
        select: {
          id: true,
          date: true,
          startTime: true,
          type: true,
          status: true,
          doctor: { select: { name: true } },
        },
      }),
      prisma.consultationNote.findMany({
        where: { patientId: id },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          id: true,
          createdAt: true,
          chiefComplaint: true,
          diagnosis: true,
          isSigned: true,
          doctor: { select: { name: true } },
        },
      }),
      prisma.prescription.findMany({
        where: { patientId: id },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          id: true,
          createdAt: true,
          items: { select: { medicineName: true, dosage: true, frequency: true } },
          doctor: { select: { name: true } },
        },
      }),
      prisma.procedure.findMany({
        where: { patientId: id },
        orderBy: [{ performedAt: "desc" }, { createdAt: "desc" }],
        take: 50,
        select: {
          id: true,
          performedAt: true,
          createdAt: true,
          outcome: true,
          treatment: { select: { name: true } },
          doctor: { select: { name: true } },
        },
      }),
      prisma.labTest.findMany({
        where: { patientId: id },
        orderBy: { createdAt: "desc" },
        take: 80,
        select: {
          id: true,
          testName: true,
          testCode: true,
          status: true,
          createdAt: true,
          completedAt: true,
        },
      }),
      prisma.followUp.findMany({
        where: { patientId: id },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          id: true,
          dueDate: true,
          createdAt: true,
          reason: true,
          status: true,
        },
      }),
      prisma.patientDocument.findMany({
        where: { patientId: id, type: "BEFORE_AFTER" },
        orderBy: { createdAt: "desc" },
        take: 60,
        select: {
          id: true,
          createdAt: true,
          name: true,
          fileUrl: true,
        },
      }),
    ]);

    const entries: TimelineEntry[] = [];

    for (const a of appointments) {
      entries.push({
        id: `appt-${a.id}`,
        kind: "VISIT",
        at: new Date(a.date).toISOString(),
        payload: {
          startTime: a.startTime,
          type: a.type,
          status: a.status,
          doctor: a.doctor?.name ?? null,
        },
      });
    }
    for (const n of notes) {
      entries.push({
        id: `note-${n.id}`,
        kind: "NOTE",
        at: n.createdAt.toISOString(),
        payload: {
          chiefComplaint: n.chiefComplaint,
          diagnosis: n.diagnosis,
          isSigned: n.isSigned,
          doctor: n.doctor?.name ?? null,
        },
      });
    }
    for (const r of prescriptions) {
      entries.push({
        id: `rx-${r.id}`,
        kind: "PRESCRIPTION",
        at: r.createdAt.toISOString(),
        payload: {
          items: r.items.map((i) => ({
            medicineName: i.medicineName,
            dosage: i.dosage,
            frequency: i.frequency,
          })),
          doctor: r.doctor?.name ?? null,
        },
      });
    }
    for (const p of procedures) {
      entries.push({
        id: `proc-${p.id}`,
        kind: "PROCEDURE",
        at: (p.performedAt ?? p.createdAt).toISOString(),
        payload: {
          treatmentName: p.treatment?.name ?? "Procedure",
          outcome: p.outcome,
          doctor: p.doctor?.name ?? null,
        },
      });
    }
    for (const l of labs) {
      entries.push({
        id: `lab-ord-${l.id}`,
        kind: "LAB_ORDERED",
        at: l.createdAt.toISOString(),
        payload: {
          testName: l.testName,
          testCode: l.testCode,
          status: l.status,
        },
      });
      if (l.status === "COMPLETED" && l.completedAt) {
        entries.push({
          id: `lab-cmp-${l.id}`,
          kind: "LAB_COMPLETED",
          at: l.completedAt.toISOString(),
          payload: {
            testName: l.testName,
            testCode: l.testCode,
          },
        });
      }
    }
    for (const f of followUps) {
      entries.push({
        id: `fu-${f.id}`,
        kind: "FOLLOWUP",
        at: f.createdAt.toISOString(),
        payload: {
          reason: f.reason,
          dueDate: f.dueDate.toISOString().slice(0, 10),
          status: f.status,
        },
      });
    }
    for (const ph of photos) {
      entries.push({
        id: `photo-${ph.id}`,
        kind: "PHOTO",
        at: ph.createdAt.toISOString(),
        payload: {
          name: ph.name,
          fileUrl: ph.fileUrl,
        },
      });
    }

    entries.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));

    return NextResponse.json({ success: true, data: entries });
  } catch (error) {
    logger.api("GET", "/api/patients/[id]/timeline", error);
    return NextResponse.json(
      { success: false, error: "Failed to load timeline" },
      { status: 500 },
    );
  }
}
