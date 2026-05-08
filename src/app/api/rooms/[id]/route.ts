/**
 * @system MediCore ERP - Single Room API
 * @route GET /api/rooms/:id - Get room details
 * @route PUT /api/rooms/:id - Update room (admin)
 * @route DELETE /api/rooms/:id - Delete room (admin, refuses if appts)
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
    const room = await prisma.room.findUnique({
      where: { id },
      include: {
        branch: { select: { id: true, name: true, code: true } },
        appointments: {
          where: { date: { gte: new Date() } },
          take: 10,
          orderBy: { date: "asc" },
          select: { id: true, appointmentCode: true, date: true, startTime: true, endTime: true, status: true },
        },
      },
    });

    if (!room) {
      return NextResponse.json(
        { success: false, error: "Room not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: room });
  } catch (error) {
    logger.api("GET", "/api/rooms/[id]", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch room" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth({ roles: ["SUPER_ADMIN", "ADMIN"] });
    if (auth.response) return auth.response;

    const { id } = await params;
    const body = await request.json();

    const existing = await prisma.room.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Room not found" },
        { status: 404 }
      );
    }

    const room = await prisma.room.update({
      where: { id },
      data: {
        ...(body.name && { name: body.name }),
        ...(body.number !== undefined && { number: body.number }),
        ...(body.floor !== undefined && { floor: body.floor }),
        ...(body.type && { type: body.type }),
        ...(body.status && { status: body.status }),
        ...(body.isAvailable !== undefined && { isAvailable: body.isAvailable }),
        ...(body.capacity !== undefined && { capacity: body.capacity }),
        ...(body.equipment !== undefined && { equipment: body.equipment }),
      },
      include: {
        branch: { select: { id: true, name: true, code: true } },
      },
    });

    return NextResponse.json({ success: true, data: room });
  } catch (error) {
    logger.api("PUT", "/api/rooms/[id]", error);
    return NextResponse.json(
      { success: false, error: "Failed to update room" },
      { status: 500 }
    );
  }
}

/**
 * Delete a room. Refuses when any appointment references it (Prisma FK
 * is onDelete: Restrict on the appointment side, so the delete would
 * fail anyway — checking up front gives a clean 409 with a useful
 * message instead of a 500). Admins can also just mark a room as
 * MAINTENANCE / set isAvailable=false via PUT to take it out of
 * rotation without losing the history.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth({ roles: ["SUPER_ADMIN", "ADMIN"] });
    if (auth.response) return auth.response;

    const { id } = await params;
    const existing = await prisma.room.findUnique({
      where: { id },
      include: { _count: { select: { appointments: true } } },
    });
    if (!existing) {
      return NextResponse.json({ success: false, error: "Room not found" }, { status: 404 });
    }
    if (existing._count.appointments > 0) {
      return NextResponse.json(
        {
          success: false,
          error: `Room has ${existing._count.appointments} appointment(s) tied to it. Reassign them or mark the room as Maintenance instead of deleting.`,
        },
        { status: 409 },
      );
    }

    await prisma.room.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.api("DELETE", "/api/rooms/[id]", error);
    return NextResponse.json(
      { success: false, error: "Failed to delete room" },
      { status: 500 }
    );
  }
}
