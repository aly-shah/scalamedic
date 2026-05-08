/**
 * @system MediCore ERP - Patient Consultation Notes API
 * @route GET /api/patients/:id/notes - Get consultation notes
 * @route POST /api/patients/:id/notes - Create consultation note
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

import { requireAuth } from "@/lib/require-auth";
import { logger } from "@/lib/logger";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if (auth.response) return auth.response;

    const { id } = await params;

    const notes = await prisma.consultationNote.findMany({
      where: { patientId: id },
      orderBy: { createdAt: "desc" },
      include: {
        doctor: {
          select: { id: true, name: true, speciality: true },
        },
        appointment: {
          select: { id: true, appointmentCode: true, date: true },
        },
      },
    });

    return NextResponse.json({ success: true, data: notes });
  } catch (error) {
    logger.api("GET", "/api/patients/[id]/notes", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch consultation notes" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if (auth.response) return auth.response;

    const { id } = await params;
    const body = await request.json();

    const note = await prisma.consultationNote.create({
      data: {
        patientId: id,
        appointmentId: body.appointmentId,
        doctorId: body.doctorId,
        chiefComplaint: body.chiefComplaint,
        symptoms: body.symptoms,
        examination: body.examination,
        skinAssessment: body.skinAssessment,
        affectedAreas: body.affectedAreas ?? [],
        conditionSeverity: body.conditionSeverity,
        diagnosis: body.diagnosis,
        // v55: structured ICD-10 codes accompany the free-text
        // diagnosis. Validation (codes exist in icd10_codes) is at
        // the picker layer; the store accepts whatever array arrives.
        icd10Codes: Array.isArray(body.icd10Codes)
          ? body.icd10Codes.filter((c: unknown): c is string => typeof c === "string" && /^[A-Z]\d{2}(\.[\dA-Z]{1,4})?$/.test(c))
          : [],
        differentialDx: body.differentialDx,
        treatmentPlan: body.treatmentPlan,
        advice: body.advice,
        internalNotes: body.internalNotes,
        followUpDate: body.followUpDate ? new Date(body.followUpDate) : null,
        followUpNotes: body.followUpNotes,
      },
      include: {
        doctor: {
          select: { id: true, name: true, speciality: true },
        },
        appointment: {
          select: { id: true, appointmentCode: true, date: true },
        },
      },
    });

    return NextResponse.json(
      { success: true, data: note },
      { status: 201 }
    );
  } catch (error) {
    logger.api("POST", "/api/patients/[id]/notes", error);
    return NextResponse.json(
      { success: false, error: "Failed to create consultation note" },
      { status: 500 }
    );
  }
}
