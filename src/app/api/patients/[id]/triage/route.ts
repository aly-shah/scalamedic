/**
 * @system MediCore ERP - Patient Triage API
 * @route GET /api/patients/:id/triage - Get triage records
 * @route POST /api/patients/:id/triage - Create triage record
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

    const records = await prisma.triage.findMany({
      where: { patientId: id },
      orderBy: { createdAt: "desc" },
      include: {
        recordedBy: {
          select: { id: true, name: true },
        },
        appointment: {
          select: { id: true, appointmentCode: true, date: true },
        },
      },
    });

    return NextResponse.json({ success: true, data: records });
  } catch (error) {
    logger.api("GET", "/api/patients/[id]/triage", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch triage records" },
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

    // Auto-calculate BMI if weight and height are provided
    let bmi = body.bmi;
    if (!bmi && body.weight && body.height) {
      const heightM = body.height / 100;
      bmi = parseFloat((body.weight / (heightM * heightM)).toFixed(1));
    }

    const record = await prisma.triage.create({
      data: {
        patientId: id,
        appointmentId: body.appointmentId,
        temperature: body.temperature,
        temperatureUnit: body.temperatureUnit,
        systolicBP: body.systolicBP,
        diastolicBP: body.diastolicBP,
        heartRate: body.heartRate,
        respiratoryRate: body.respiratoryRate,
        weight: body.weight,
        height: body.height,
        bmi,
        oxygenSaturation: body.oxygenSaturation,
        painLevel: body.painLevel,
        notes: body.notes,
        skinObservations: body.skinObservations,
        moistureLevel: body.moistureLevel,
        oilinessLevel: body.oilinessLevel,
        urgencyLevel: body.urgencyLevel ?? "NORMAL",
        recordedById: body.recordedById,
      },
      include: {
        recordedBy: {
          select: { id: true, name: true },
        },
        appointment: {
          select: { id: true, appointmentCode: true, date: true },
        },
      },
    });

    return NextResponse.json(
      { success: true, data: record },
      { status: 201 }
    );
  } catch (error) {
    logger.api("POST", "/api/patients/[id]/triage", error);
    return NextResponse.json(
      { success: false, error: "Failed to create triage record" },
      { status: 500 }
    );
  }
}
