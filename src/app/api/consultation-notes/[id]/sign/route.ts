/**
 * @system MediCore ERP — Sign a consultation note
 * @route POST /api/consultation-notes/:id/sign
 *
 * E-signature lifecycle:
 *   1. Capture WHO signed — `signedById` from the session.
 *   2. Capture WHEN — `signedAt` = now().
 *   3. Capture WHAT — `signedContentHash` = SHA-256 of the
 *      canonicalized clinical fields at sign time.
 *   4. Snapshot the prior state into `consultation_note_revisions`
 *      so the audit trail captures the exact content that became
 *      signed (and any pre-signature edits that preceded it).
 *
 * Idempotent: re-signing an already-signed note no-ops (returns the
 * existing record). If you need to change a signed note, use the
 * amend route which clears the signature and requires a reason.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/require-auth";
import { logger } from "@/lib/logger";
import { logAudit } from "@/lib/audit";
import { hashNote, snapshotNote } from "@/lib/consultation-note-hash";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth();
    if (auth.response) return auth.response;

    const { id } = await params;

    const existing = await prisma.consultationNote.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ success: false, error: "Note not found" }, { status: 404 });
    }
    if (existing.isSigned) {
      // Already signed — return as-is rather than re-signing. The
      // existing signature stays bound to the original hash.
      return NextResponse.json({ success: true, data: existing, alreadySigned: true });
    }

    const contentHash = hashNote(existing);
    const now = new Date();

    const signed = await prisma.$transaction(async (tx) => {
      // Snapshot the pre-sign state into the revisions table. The
      // audit reader can later see "this was the form just before
      // the signature was applied".
      const nextRevNo = existing.revisionCount + 1;
      await tx.consultationNoteRevision.create({
        data: {
          consultationNoteId: id,
          revisionNumber: nextRevNo,
          snapshot: snapshotNote(existing),
          wasSigned: false,
          authorId: auth.user.id,
          amendmentReason: null,
        },
      });

      return tx.consultationNote.update({
        where: { id },
        data: {
          isSigned: true,
          signedAt: now,
          signedById: auth.user.id,
          signedContentHash: contentHash,
          revisionCount: nextRevNo,
        },
      });
    });

    await logAudit({
      userId: auth.user.id,
      action: "SIGN",
      module: "CONSULTATION",
      entityType: "ConsultationNote",
      entityId: id,
      details: { signedAt: now.toISOString(), contentHash },
    });

    return NextResponse.json({ success: true, data: signed });
  } catch (error) {
    logger.api("POST", "/api/consultation-notes/[id]/sign", error);
    return NextResponse.json({ success: false, error: "Failed to sign note" }, { status: 500 });
  }
}
