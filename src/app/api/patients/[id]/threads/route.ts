/**
 * @system MediCore ERP — Patient collaboration threads
 * @route GET  /api/patients/:id/threads — list threads + comments
 * @route POST /api/patients/:id/threads — create a thread (and
 *               optionally seed it with the first comment)
 *
 * One JSON payload powers the doctor-app's "Team chat" panel;
 * the response includes ALL threads + ALL comments for the
 * patient in a single round-trip. Volumes are bounded (most
 * patients accumulate at most a handful of threads over months)
 * so flat fetch is fine; pagination can be added when one patient
 * routinely exceeds 100 comments.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/require-auth";
import { logger } from "@/lib/logger";
import { logAudit } from "@/lib/audit";
import { extractHandles, resolveMentions } from "@/lib/mention-parser";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth();
    if (auth.response) return auth.response;
    const { id: patientId } = await params;

    const threads = await prisma.collaborationThread.findMany({
      where: { patientId },
      orderBy: { updatedAt: "desc" },
      include: {
        createdBy: { select: { id: true, name: true } },
        consultationNote: { select: { id: true, diagnosis: true, createdAt: true } },
        procedure:        { select: { id: true, treatment: { select: { name: true } } } },
        comments: {
          orderBy: { createdAt: "asc" },
          include: {
            author:   { select: { id: true, name: true } },
            mentions: {
              include: { user: { select: { id: true, name: true } } },
            },
          },
        },
      },
    });

    return NextResponse.json({ success: true, data: threads });
  } catch (error) {
    logger.api("GET", "/api/patients/[id]/threads", error);
    return NextResponse.json(
      { success: false, error: "Failed to load threads" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth();
    if (auth.response) return auth.response;
    const { id: patientId } = await params;
    const body = await request.json().catch(() => ({}));

    const patient = await prisma.patient.findUnique({
      where: { id: patientId },
      select: { branch: { select: { tenantId: true } } },
    });
    if (!patient) {
      return NextResponse.json({ success: false, error: "Patient not found" }, { status: 404 });
    }

    const consultationNoteId = typeof body.consultationNoteId === "string" && body.consultationNoteId ? body.consultationNoteId : null;
    const procedureId = typeof body.procedureId === "string" && body.procedureId ? body.procedureId : null;
    if (consultationNoteId && procedureId) {
      return NextResponse.json(
        { success: false, error: "Thread can anchor to either a note or a procedure, not both" },
        { status: 400 },
      );
    }

    const title = typeof body.title === "string" && body.title.trim() ? body.title.trim().slice(0, 160) : null;
    const initialBody = typeof body.body === "string" ? body.body.trim() : "";

    // Active staff in this tenant — the candidate pool for @mention
    // resolution. PATIENT-role users can never be mentioned.
    const candidates = await prisma.user.findMany({
      where: {
        tenantId: patient.branch.tenantId,
        isActive: true,
        role: { not: "PATIENT" },
      },
      select: { id: true, name: true, email: true, lastLoginAt: true, isActive: true },
    });

    const result = await prisma.$transaction(async (tx) => {
      const thread = await tx.collaborationThread.create({
        data: {
          patientId,
          tenantId: patient.branch.tenantId,
          consultationNoteId,
          procedureId,
          title,
          createdById: auth.user.id,
        },
      });
      let firstComment = null as Awaited<ReturnType<typeof tx.collaborationComment.create>> | null;
      if (initialBody) {
        firstComment = await tx.collaborationComment.create({
          data: {
            threadId: thread.id,
            authorId: auth.user.id,
            body: initialBody,
          },
        });
        const handles = extractHandles(initialBody);
        const userIds = resolveMentions(handles, candidates).filter((u) => u !== auth.user.id);
        if (userIds.length > 0) {
          await tx.collaborationMention.createMany({
            data: userIds.map((userId) => ({ commentId: firstComment!.id, userId })),
            skipDuplicates: true,
          });
        }
      }
      return { thread, firstComment };
    });

    await logAudit({
      userId: auth.user.id,
      action: "CREATE",
      module: "COLLABORATION",
      entityType: "CollaborationThread",
      entityId: result.thread.id,
      details: { patientId, hasInitialComment: !!result.firstComment },
    });

    return NextResponse.json({ success: true, data: result.thread }, { status: 201 });
  } catch (error) {
    logger.api("POST", "/api/patients/[id]/threads", error);
    return NextResponse.json(
      { success: false, error: "Failed to create thread" },
      { status: 500 },
    );
  }
}
