/**
 * @system MediCore ERP — Comment on a collaboration thread
 * @route POST /api/threads/:threadId/comments
 *
 * Adds a comment to an existing thread + auto-extracts @mentions
 * (resolved server-side against the tenant's active staff). The
 * mention rows are created in the same transaction as the comment
 * so the read-flag and unread-count UIs always see consistent
 * state.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/require-auth";
import { logger } from "@/lib/logger";
import { logAudit } from "@/lib/audit";
import { extractHandles, resolveMentions } from "@/lib/mention-parser";

export async function POST(request: Request, { params }: { params: Promise<{ threadId: string }> }) {
  try {
    const auth = await requireAuth();
    if (auth.response) return auth.response;
    const { threadId } = await params;
    const body = await request.json().catch(() => ({}));

    const text = typeof body.body === "string" ? body.body.trim() : "";
    if (!text) {
      return NextResponse.json({ success: false, error: "Comment body is required" }, { status: 400 });
    }
    const parentCommentId = typeof body.parentCommentId === "string" && body.parentCommentId ? body.parentCommentId : null;

    const thread = await prisma.collaborationThread.findUnique({
      where: { id: threadId },
      select: { id: true, tenantId: true, patientId: true },
    });
    if (!thread) {
      return NextResponse.json({ success: false, error: "Thread not found" }, { status: 404 });
    }

    const candidates = await prisma.user.findMany({
      where: {
        tenantId: thread.tenantId,
        isActive: true,
        role: { not: "PATIENT" },
      },
      select: { id: true, name: true, email: true, lastLoginAt: true, isActive: true },
    });

    const result = await prisma.$transaction(async (tx) => {
      const comment = await tx.collaborationComment.create({
        data: {
          threadId: thread.id,
          authorId: auth.user.id,
          body: text,
          parentCommentId,
        },
        include: {
          author: { select: { id: true, name: true } },
        },
      });
      // Bump thread.updatedAt so it sorts to the top.
      await tx.collaborationThread.update({
        where: { id: thread.id },
        data: { updatedAt: new Date() },
      });
      // Mentions: resolve and persist. Mentioning yourself is a
      // common pattern in some apps but here it'd just create
      // unread-self-noise; filter it out.
      const handles = extractHandles(text);
      const userIds = resolveMentions(handles, candidates).filter((u) => u !== auth.user.id);
      let mentions: Array<{ userId: string }> = [];
      if (userIds.length > 0) {
        await tx.collaborationMention.createMany({
          data: userIds.map((userId) => ({ commentId: comment.id, userId })),
          skipDuplicates: true,
        });
        mentions = userIds.map((userId) => ({ userId }));
      }
      return { comment, mentions };
    });

    await logAudit({
      userId: auth.user.id,
      action: "CREATE",
      module: "COLLABORATION",
      entityType: "CollaborationComment",
      entityId: result.comment.id,
      details: { threadId, mentionCount: result.mentions.length },
    });

    return NextResponse.json({ success: true, data: { comment: result.comment, mentions: result.mentions } }, { status: 201 });
  } catch (error) {
    logger.api("POST", "/api/threads/[threadId]/comments", error);
    return NextResponse.json(
      { success: false, error: "Failed to post comment" },
      { status: 500 },
    );
  }
}
