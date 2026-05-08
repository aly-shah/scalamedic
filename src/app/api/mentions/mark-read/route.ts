/**
 * @system MediCore ERP — Mark mentions as read
 * @route POST /api/mentions/mark-read
 *
 * Body: { mentionIds?: string[] } — when omitted, marks ALL of
 * the calling user's unread mentions as read (inbox-zero).
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/require-auth";
import { logger } from "@/lib/logger";

export async function POST(request: Request) {
  try {
    const auth = await requireAuth();
    if (auth.response) return auth.response;
    const body = await request.json().catch(() => ({}));

    const ids: string[] = Array.isArray(body.mentionIds)
      ? body.mentionIds.filter((s: unknown) => typeof s === "string")
      : [];

    const updated = await prisma.collaborationMention.updateMany({
      where: {
        userId: auth.user.id,
        readAt: null,
        ...(ids.length > 0 ? { id: { in: ids } } : {}),
      },
      data: { readAt: new Date() },
    });

    return NextResponse.json({ success: true, data: { count: updated.count } });
  } catch (error) {
    logger.api("POST", "/api/mentions/mark-read", error);
    return NextResponse.json(
      { success: false, error: "Failed to mark mentions read" },
      { status: 500 },
    );
  }
}
