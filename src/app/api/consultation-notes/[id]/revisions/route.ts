/**
 * @system MediCore ERP — Consultation note revision history
 * @route GET /api/consultation-notes/:id/revisions
 *
 * Returns the immutable revision trail for a single consultation
 * note, plus the integrity check on the live row's signature (we
 * recompute the hash and compare against `signedContentHash` so an
 * audit reader can see green/red verification at a glance).
 *
 * Auth: any authenticated user; the audit reader is typically
 * admin-side but we don't lock it down further today since the data
 * is already exposed in the patient profile.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/require-auth";
import { logger } from "@/lib/logger";
import { hashNote } from "@/lib/consultation-note-hash";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth();
    if (auth.response) return auth.response;

    const { id } = await params;

    const note = await prisma.consultationNote.findUnique({
      where: { id },
      include: {
        signedBy: { select: { id: true, name: true } },
        doctor: { select: { id: true, name: true } },
      },
    });
    if (!note) {
      return NextResponse.json({ success: false, error: "Note not found" }, { status: 404 });
    }

    const revisions = await prisma.consultationNoteRevision.findMany({
      where: { consultationNoteId: id },
      orderBy: { revisionNumber: "asc" },
      include: { author: { select: { id: true, name: true } } },
    });

    // Re-hash the live row to verify the signature. If the recomputed
    // hash matches `signedContentHash`, the signature is intact —
    // no post-signature tampering. Mismatch = the row was edited
    // outside of the amend route (which would have cleared the
    // signature).
    const computedHash = hashNote(note);
    const signatureValid = note.isSigned
      ? note.signedContentHash !== null && note.signedContentHash === computedHash
      : null;

    return NextResponse.json({
      success: true,
      data: {
        note,
        revisions,
        integrity: {
          isSigned: note.isSigned,
          signedContentHash: note.signedContentHash,
          computedHash,
          signatureValid,
        },
      },
    });
  } catch (error) {
    logger.api("GET", "/api/consultation-notes/[id]/revisions", error);
    return NextResponse.json(
      { success: false, error: "Failed to load revisions" },
      { status: 500 },
    );
  }
}
