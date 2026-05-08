/**
 * @system MediCore ERP — Block Slot CRUD
 * @route DELETE /api/calendar/block-slot/:id — Remove a blocked slot
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

import { requireAuth } from "@/lib/require-auth";
import { logger } from "@/lib/logger";
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if (auth.response) return auth.response;

    const { id } = await params;
    const existing = await prisma.blockedSlot.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ success: false, error: "Blocked slot not found" }, { status: 404 });
    }
    await prisma.blockedSlot.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.api("DELETE", "/api/calendar/block-slot", error);
    return NextResponse.json({ success: false, error: "Failed to unblock slot" }, { status: 500 });
  }
}
