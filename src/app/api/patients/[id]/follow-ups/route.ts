/**
 * @system MediCore ERP - Patient Follow-Ups API
 * @route GET /api/patients/:id/follow-ups - Get patient follow-ups
 * @route POST /api/patients/:id/follow-ups - Create follow-up
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

    const followUps = await prisma.followUp.findMany({
      where: { patientId: id },
      orderBy: { dueDate: "desc" },
      include: {
        doctor: {
          select: { id: true, name: true, speciality: true },
        },
        appointment: {
          select: { id: true, appointmentCode: true, date: true },
        },
      },
    });

    return NextResponse.json({ success: true, data: followUps });
  } catch (error) {
    logger.api("GET", "/api/patients/[id]/follow-ups", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch follow-ups" },
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

    const followUp = await prisma.followUp.create({
      data: {
        patientId: id,
        doctorId: body.doctorId,
        appointmentId: body.appointmentId,
        dueDate: new Date(body.dueDate),
        reason: body.reason,
        notes: body.notes,
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
      { success: true, data: followUp },
      { status: 201 }
    );
  } catch (error) {
    logger.api("POST", "/api/patients/[id]/follow-ups", error);
    return NextResponse.json(
      { success: false, error: "Failed to create follow-up" },
      { status: 500 }
    );
  }
}
