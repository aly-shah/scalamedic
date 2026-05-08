/**
 * @system MediCore ERP - Follow-Ups API
 * @route GET /api/follow-ups - List follow-ups with filters
 * @route POST /api/follow-ups - Create follow-up
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
    const doctorId = searchParams.get("doctorId");
    const dueDate = searchParams.get("dueDate");
    const patientId = searchParams.get("patientId");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {};

    if (status) where.status = status;
    if (doctorId) where.doctorId = doctorId;
    if (dueDate) where.dueDate = new Date(dueDate);
    if (patientId) where.patientId = patientId;

    const followUps = await prisma.followUp.findMany({
      where,
      include: {
        patient: { select: { id: true, firstName: true, lastName: true, patientCode: true, phone: true } },
        doctor: { select: { id: true, name: true } },
        appointment: { select: { id: true, appointmentCode: true, date: true } },
      },
      orderBy: { dueDate: "asc" },
    });

    return NextResponse.json({ success: true, data: followUps });
  } catch (error) {
    logger.api("GET", "/api/follow-ups", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch follow-ups" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAuth();
    if (auth.response) return auth.response;

    const body = await request.json();

    const followUp = await prisma.followUp.create({
      data: {
        patientId: body.patientId,
        doctorId: body.doctorId,
        appointmentId: body.appointmentId || null,
        dueDate: new Date(body.dueDate),
        reason: body.reason,
        status: "PENDING",
        notes: body.notes || null,
      },
      include: {
        patient: { select: { id: true, firstName: true, lastName: true, patientCode: true } },
        doctor: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({ success: true, data: followUp }, { status: 201 });
  } catch (error) {
    logger.api("POST", "/api/follow-ups", error);
    return NextResponse.json(
      { success: false, error: "Failed to create follow-up" },
      { status: 500 }
    );
  }
}
