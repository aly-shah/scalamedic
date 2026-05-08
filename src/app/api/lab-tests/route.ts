/**
 * @system MediCore ERP - Lab Tests API
 * @route GET /api/lab-tests - List lab tests with filters
 * @route POST /api/lab-tests - Order lab test
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

import { requireAuth } from "@/lib/require-auth";
import { logger } from "@/lib/logger";
export async function GET(request: Request) {
  try {
    const auth = await requireAuth();
    if (auth.response) return auth.response;

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const patientId = searchParams.get("patientId");
    const doctorId = searchParams.get("doctorId");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {};

    if (status) where.status = status;
    if (patientId) where.patientId = patientId;
    if (doctorId) where.doctorId = doctorId;

    const labTests = await prisma.labTest.findMany({
      where,
      include: {
        patient: { select: { id: true, firstName: true, lastName: true, patientCode: true } },
        doctor: { select: { id: true, name: true } },
        appointment: { select: { id: true, appointmentCode: true, date: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ success: true, data: labTests });
  } catch (error) {
    logger.api("GET", "/api/lab-tests", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch lab tests" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAuth();
    if (auth.response) return auth.response;

    const body = await request.json();

    const labTest = await prisma.labTest.create({
      data: {
        patientId: body.patientId,
        doctorId: body.doctorId,
        appointmentId: body.appointmentId || null,
        testName: body.testName,
        testCode: body.testCode || null,
        status: "REQUESTED",
        priority: body.priority || "NORMAL",
        notes: body.notes || null,
      },
      include: {
        patient: { select: { id: true, firstName: true, lastName: true, patientCode: true } },
        doctor: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({ success: true, data: labTest }, { status: 201 });
  } catch (error) {
    logger.api("POST", "/api/lab-tests", error);
    return NextResponse.json(
      { success: false, error: "Failed to create lab test" },
      { status: 500 }
    );
  }
}
