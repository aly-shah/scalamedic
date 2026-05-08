/**
 * @system MediCore ERP — Unread mentions
 * @route GET /api/mentions/unread
 *
 * Returns the calling user's unread @mentions. Polled by the
 * doctor-app and dashboard sidebars to surface a "1 new mention"
 * pip. Limited to the most-recent 25 since older mentions get
 * lost-in-time anyway and the mark-all-read affordance is for
 * pure inbox-zero patterns.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/require-auth";
import { logger } from "@/lib/logger";

export async function GET() {
  try {
    const auth = await requireAuth();
    if (auth.response) return auth.response;

    const rows = await prisma.collaborationMention.findMany({
      where: { userId: auth.user.id, readAt: null },
      orderBy: { createdAt: "desc" },
      take: 25,
      include: {
        comment: {
          include: {
            author: { select: { id: true, name: true } },
            thread: {
              select: {
                id: true,
                patient: { select: { id: true, firstName: true, lastName: true, patientCode: true } },
              },
            },
          },
        },
      },
    });

    const total = await prisma.collaborationMention.count({
      where: { userId: auth.user.id, readAt: null },
    });

    return NextResponse.json({ success: true, data: { rows, total } });
  } catch (error) {
    logger.api("GET", "/api/mentions/unread", error);
    return NextResponse.json(
      { success: false, error: "Failed to load mentions" },
      { status: 500 },
    );
  }
}
