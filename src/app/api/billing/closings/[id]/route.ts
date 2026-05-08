/**
 * @system MediCore ERP — Daily closing detail / reopen
 * @route GET    /api/billing/closings/:id — fetch a saved snapshot
 * @route DELETE /api/billing/closings/:id — reopen the day (delete snapshot)
 *
 * Reopen exists for the case where reception closed the day too early
 * (still pending payments) or made a counting error. Removes the
 * snapshot; petty cash for that date can be edited again.
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
    const closing = await prisma.dailyClosing.findUnique({
      where: { id },
      include: {
        closedBy: { select: { id: true, name: true } },
        branch: { select: { id: true, name: true, code: true } },
      },
    });

    if (!closing) {
      return NextResponse.json(
        { success: false, error: "Closing not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: closing });
  } catch (error) {
    logger.api("GET", "/api/billing/closings/[id]", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch closing" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth({
      roles: ["SUPER_ADMIN", "ADMIN"],
    });
    if (auth.response) return auth.response;

    const { id } = await params;
    const closing = await prisma.dailyClosing.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!closing) {
      return NextResponse.json(
        { success: false, error: "Closing not found" },
        { status: 404 }
      );
    }

    await prisma.dailyClosing.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.api("DELETE", "/api/billing/closings/[id]", error);
    return NextResponse.json(
      { success: false, error: "Failed to reopen closing" },
      { status: 500 }
    );
  }
}
