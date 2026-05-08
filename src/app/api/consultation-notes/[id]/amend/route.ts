/**
 * @system MediCore ERP — Amend a consultation note
 * @route POST /api/consultation-notes/:id/amend
 *
 * The only path that mutates clinical content on an existing note.
 * Behavior:
 *   1. Snapshot the current state into `consultation_note_revisions`
 *      so the prior content is preserved verbatim (with any
 *      signature that was attached).
 *   2. Apply the field changes.
 *   3. If the note was signed, the amendment **clears the
 *      signature** (isSigned=false, signedById/signedAt/hash null,
 *      `amendmentReason` set). The doctor must re-sign after
 *      amending — that re-sign creates another revision.
 *
 * Required body fields:
 *   - reason: string (mandatory if the note was previously signed)
 *   - any subset of clinical fields to update
 *
 * Auth: any authenticated user (in practice DOCTOR / ADMIN), but the
 * audit log records the actual user id so cross-doctor amendments
 * are traceable.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/require-auth";
import { logger } from "@/lib/logger";
import { logAudit } from "@/lib/audit";
import { snapshotNote } from "@/lib/consultation-note-hash";

const CLINICAL_FIELDS = [
  "chiefComplaint","symptoms","examination","skinAssessment","affectedAreas",
  "conditionSeverity","diagnosis","differentialDx","treatmentPlan","advice",
  "internalNotes","followUpDate","followUpNotes",
] as const;

type ClinicalField = (typeof CLINICAL_FIELDS)[number];

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth();
    if (auth.response) return auth.response;

    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";

    const existing = await prisma.consultationNote.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ success: false, error: "Note not found" }, { status: 404 });
    }

    // Amending a signed note must explain itself. Pre-signature
    // edits don't strictly require a reason but the route still
    // captures one if provided (useful audit metadata).
    if (existing.isSigned && reason.length === 0) {
      return NextResponse.json(
        { success: false, error: "Amending a signed note requires a reason" },
        { status: 400 },
      );
    }

    // Build the patch from whitelisted fields only — never accept
    // updates to id, signing metadata, audit timestamps, etc.
    const patch: Record<string, unknown> = {};
    for (const f of CLINICAL_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(body, f)) {
        const v = body[f as ClinicalField];
        if (f === "followUpDate") {
          patch[f] = v ? new Date(v as string) : null;
        } else if (f === "affectedAreas") {
          patch[f] = Array.isArray(v) ? v : [];
        } else {
          // Trim string fields; convert empty to null so the
          // _nonempty CHECKs don't reject blanks-with-whitespace.
          if (typeof v === "string") {
            const trimmed = v.trim();
            patch[f] = trimmed.length > 0 ? trimmed : null;
          } else {
            patch[f] = v ?? null;
          }
        }
      }
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json(
        { success: false, error: "No clinical fields provided" },
        { status: 400 },
      );
    }

    const updated = await prisma.$transaction(async (tx) => {
      const nextRevNo = existing.revisionCount + 1;
      // Snapshot the *current* state including any signature it
      // had — this is the immutable record of what existed before
      // the amendment.
      await tx.consultationNoteRevision.create({
        data: {
          consultationNoteId: id,
          revisionNumber: nextRevNo,
          snapshot: snapshotNote(existing),
          wasSigned: existing.isSigned,
          signedAtSnapshot: existing.signedAt ?? null,
          signedByIdSnapshot: existing.signedById ?? null,
          signedContentHashSnapshot: existing.signedContentHash ?? null,
          amendmentReason: reason || null,
          authorId: auth.user.id,
        },
      });

      return tx.consultationNote.update({
        where: { id },
        data: {
          ...patch,
          // Always clear the signature on amend — any change
          // invalidates it. The doctor must re-sign explicitly
          // afterwards.
          isSigned: false,
          signedAt: null,
          signedById: null,
          signedContentHash: null,
          amendmentReason: reason || null,
          revisionCount: nextRevNo,
        },
      });
    });

    await logAudit({
      userId: auth.user.id,
      action: "AMEND",
      module: "CONSULTATION",
      entityType: "ConsultationNote",
      entityId: id,
      details: {
        reason: reason || null,
        fieldsChanged: Object.keys(patch),
        wasSigned: existing.isSigned,
      },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    logger.api("POST", "/api/consultation-notes/[id]/amend", error);
    return NextResponse.json({ success: false, error: "Failed to amend note" }, { status: 500 });
  }
}
