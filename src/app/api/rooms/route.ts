/**
 * @system MediCore ERP - Rooms API
 * @route GET /api/rooms - List rooms with filters
 * @route POST /api/rooms - Create room
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

import { requireAuth } from "@/lib/require-auth";
import { logger } from "@/lib/logger";
import { getCurrentOccupants } from "@/lib/room-status";
export async function GET(request: Request) {
  try {
    const auth = await requireAuth();
    if (auth.response) return auth.response;

    const { searchParams } = new URL(request.url);
    const branchId = searchParams.get("branchId");
    const type = searchParams.get("type");
    const status = searchParams.get("status");
    const available = searchParams.get("available");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {};

    if (branchId) where.branchId = branchId;
    if (type) where.type = type;
    if (status) where.status = status;
    if (available === "true") where.isAvailable = true;
    else if (available === "false") where.isAvailable = false;

    const rooms = await prisma.room.findMany({
      where,
      include: {
        branch: { select: { id: true, name: true, code: true } },
      },
      orderBy: [{ branch: { name: "asc" } }, { name: "asc" }],
    });

    // Enrich each room with the current occupying appointment so the
    // rooms page can show "Olivia Harper · Dr. Chen · since 09:14" on
    // OCCUPIED cards. Computed from today's active appointments rather
    // than stored on Room (which would drift out of sync).
    //
    // We also override the displayed status to match live occupancy
    // (unless CLEANING/MAINTENANCE — those are admin-set and never
    // overridden). This makes the rooms page self-heal: if any data is
    // already out of sync, the response reflects reality immediately
    // instead of waiting for the next status transition to flip it.
    const occupants = await getCurrentOccupants(rooms.map((r) => r.id));
    const enriched = rooms.map((r) => {
      const occ = occupants.get(r.id);
      const adminLocked = r.status === "CLEANING" || r.status === "MAINTENANCE";
      const liveStatus = adminLocked ? r.status : occ ? "OCCUPIED" : "AVAILABLE";
      return {
        ...r,
        status: liveStatus,
        isAvailable: liveStatus === "AVAILABLE",
        currentPatientName: occ?.patientName ?? null,
        currentDoctorName: occ?.doctorName ?? null,
        occupiedSince: occ?.occupiedSince ?? null,
      };
    });

    return NextResponse.json({ success: true, data: enriched });
  } catch (error) {
    logger.api("GET", "/api/rooms", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch rooms" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAuth();
    if (auth.response) return auth.response;

    const body = await request.json();

    const room = await prisma.room.create({
      data: {
        branchId: body.branchId,
        name: body.name,
        number: body.number || null,
        floor: body.floor || null,
        type: body.type,
        status: "AVAILABLE",
        isAvailable: true,
        capacity: body.capacity || 1,
        equipment: body.equipment || null,
      },
      include: {
        branch: { select: { id: true, name: true, code: true } },
      },
    });

    return NextResponse.json({ success: true, data: room }, { status: 201 });
  } catch (error) {
    logger.api("POST", "/api/rooms", error);
    return NextResponse.json(
      { success: false, error: "Failed to create room" },
      { status: 500 }
    );
  }
}
