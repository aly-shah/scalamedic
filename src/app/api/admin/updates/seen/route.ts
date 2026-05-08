/**
 * @system MediCore ERP — Mark Updates inbox as seen
 * @route POST /api/admin/updates/seen
 *
 * Bumps users.lastUpdatesSeenAt = now() for the calling user. The
 * /admin/updates page hits this on mount so the next sidebar poll
 * sees the badge counts go to zero.
 *
 * Auth: ADMIN+. No body — the action is "I just opened the page,
 * record the timestamp" and is idempotent.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/require-auth";
import { logger } from "@/lib/logger";

export async function POST() {
  try {
    const auth = await requireAuth({ minRole: "ADMIN" });
    if (auth.response) return auth.response;

    const updated = await prisma.user.update({
      where: { id: auth.user.id },
      data: { lastUpdatesSeenAt: new Date() },
      select: { lastUpdatesSeenAt: true },
    });

    return NextResponse.json({
      success: true,
      data: { lastUpdatesSeenAt: updated.lastUpdatesSeenAt?.toISOString() },
    });
  } catch (error) {
    logger.api("POST", "/api/admin/updates/seen", error);
    return NextResponse.json(
      { success: false, error: "Failed to mark seen" },
      { status: 500 },
    );
  }
}
