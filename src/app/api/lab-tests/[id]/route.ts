/**
 * @system MediCore ERP — Single Lab Test API
 * @route GET /api/lab-tests/:id  — fetch full test with patient + doctor + appointment
 * @route PUT /api/lab-tests/:id  — update status / technician / results / notes
 *
 * Status transitions are enforced (REQUESTED → SAMPLE_COLLECTED →
 * PROCESSING → COMPLETED; CANCELLED is reachable from any non-terminal
 * state). collectedAt and completedAt timestamps stamp themselves on the
 * matching transition so the lab page can show timeline data without
 * needing a separate audit table.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/require-auth";
import { logger } from "@/lib/logger";

const VALID_TRANSITIONS: Record<string, string[]> = {
  REQUESTED: ["SAMPLE_COLLECTED", "CANCELLED"],
  SAMPLE_COLLECTED: ["PROCESSING", "CANCELLED"],
  PROCESSING: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if (auth.response) return auth.response;

    const { id } = await params;
    const test = await prisma.labTest.findUnique({
      where: { id },
      include: {
        patient: {
          select: { id: true, firstName: true, lastName: true, patientCode: true, phone: true },
        },
        doctor: { select: { id: true, name: true, speciality: true } },
        appointment: { select: { id: true, appointmentCode: true, date: true } },
      },
    });

    if (!test) {
      return NextResponse.json({ success: false, error: "Lab test not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: test });
  } catch (error) {
    logger.api("GET", "/api/lab-tests/[id]", error);
    return NextResponse.json({ success: false, error: "Failed to fetch lab test" }, { status: 500 });
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

    const existing = await prisma.labTest.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ success: false, error: "Lab test not found" }, { status: 404 });
    }

    if (body.status && body.status !== existing.status) {
      const allowed = VALID_TRANSITIONS[existing.status] || [];
      if (!allowed.includes(body.status)) {
        return NextResponse.json(
          { success: false, error: `Cannot transition ${existing.status} → ${body.status}` },
          { status: 400 }
        );
      }
    }

    const data: Record<string, unknown> = {};
    if (body.status !== undefined) data.status = body.status;
    if (body.priority !== undefined) data.priority = body.priority;
    if (body.technician !== undefined) data.technician = body.technician || null;
    if (body.notes !== undefined) data.notes = body.notes || null;
    if (body.testCode !== undefined) data.testCode = body.testCode || null;
    if (body.results !== undefined) data.results = body.results;

    // Stamp transition timestamps automatically — only if the caller is
    // entering that state for the first time.
    if (body.status === "SAMPLE_COLLECTED" && !existing.collectedAt) {
      data.collectedAt = new Date();
    }
    if (body.status === "COMPLETED" && !existing.completedAt) {
      data.completedAt = new Date();
    }

    const updated = await prisma.labTest.update({
      where: { id },
      data,
      include: {
        patient: {
          select: { id: true, firstName: true, lastName: true, patientCode: true, phone: true },
        },
        doctor: { select: { id: true, name: true, speciality: true } },
        appointment: { select: { id: true, appointmentCode: true, date: true } },
      },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    logger.api("PUT", "/api/lab-tests/[id]", error);
    return NextResponse.json({ success: false, error: "Failed to update lab test" }, { status: 500 });
  }
}
