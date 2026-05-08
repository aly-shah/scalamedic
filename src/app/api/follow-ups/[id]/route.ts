/**
 * @system MediCore ERP - Single Follow-Up API
 * @route GET /api/follow-ups/:id - Get follow-up details
 * @route PUT /api/follow-ups/:id - Update follow-up
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
    const followUp = await prisma.followUp.findUnique({
      where: { id },
      include: {
        patient: { select: { id: true, firstName: true, lastName: true, patientCode: true, phone: true } },
        doctor: { select: { id: true, name: true } },
        appointment: { select: { id: true, appointmentCode: true, date: true, type: true } },
      },
    });

    if (!followUp) {
      return NextResponse.json(
        { success: false, error: "Follow-up not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: followUp });
  } catch (error) {
    logger.api("GET", "/api/follow-ups/[id]", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch follow-up" },
      { status: 500 }
    );
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

    const existing = await prisma.followUp.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Follow-up not found" },
        { status: 404 }
      );
    }

    const followUp = await prisma.followUp.update({
      where: { id },
      data: {
        ...(body.dueDate && { dueDate: new Date(body.dueDate) }),
        ...(body.reason && { reason: body.reason }),
        ...(body.status && { status: body.status }),
        ...(body.notes !== undefined && { notes: body.notes }),
        ...(body.status === "COMPLETED" && { completedAt: new Date() }),
      },
      include: {
        patient: { select: { id: true, firstName: true, lastName: true, patientCode: true } },
        doctor: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({ success: true, data: followUp });
  } catch (error) {
    logger.api("PUT", "/api/follow-ups/[id]", error);
    return NextResponse.json(
      { success: false, error: "Failed to update follow-up" },
      { status: 500 }
    );
  }
}
