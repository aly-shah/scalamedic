/**
 * @system MediCore ERP - Patient Prescriptions API
 * @route GET /api/patients/:id/prescriptions - Get prescriptions
 * @route POST /api/patients/:id/prescriptions - Create prescription
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

    const prescriptions = await prisma.prescription.findMany({
      where: { patientId: id },
      orderBy: { createdAt: "desc" },
      include: {
        items: true,
        doctor: {
          select: { id: true, name: true, speciality: true },
        },
        appointment: {
          select: { id: true, appointmentCode: true, date: true },
        },
      },
    });

    return NextResponse.json({ success: true, data: prescriptions });
  } catch (error) {
    logger.api("GET", "/api/patients/[id]/prescriptions", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch prescriptions" },
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

    const prescription = await prisma.prescription.create({
      data: {
        patientId: id,
        doctorId: body.doctorId,
        appointmentId: body.appointmentId,
        notes: body.notes,
        items: {
          create: (body.items ?? []).map(
            (item: {
              medicineName: string;
              dosage?: string;
              frequency?: string;
              duration?: string;
              route?: string;
              instructions?: string;
            }) => ({
              medicineName: item.medicineName,
              dosage: item.dosage,
              frequency: item.frequency,
              duration: item.duration,
              route: item.route,
              instructions: item.instructions,
            })
          ),
        },
      },
      include: {
        items: true,
        doctor: {
          select: { id: true, name: true, speciality: true },
        },
      },
    });

    return NextResponse.json(
      { success: true, data: prescription },
      { status: 201 }
    );
  } catch (error) {
    logger.api("POST", "/api/patients/[id]/prescriptions", error);
    return NextResponse.json(
      { success: false, error: "Failed to create prescription" },
      { status: 500 }
    );
  }
}
