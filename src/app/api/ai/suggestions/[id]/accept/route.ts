/**
 * @system MediCore ERP — Accept an AI suggestion
 * @route POST /api/ai/suggestions/:id/accept
 *
 * Marks the suggestion ACCEPTED with the deciding user. For LAB and
 * FOLLOWUP kinds the route also creates the corresponding clinical
 * artifact (LabTest, FollowUp) and binds it to the suggestion via
 * acceptedEntityType + acceptedEntityId — that's the audit trail
 * answering "this LabTest originated as AI suggestion X".
 *
 * For MEDICATION, the artifact is a PrescriptionItem that lives
 * inside a Prescription header the doctor builds in the UI. We
 * mark the suggestion ACCEPTED without an artifact link — the
 * link is captured later when the prescription is saved (future
 * enhancement). The semantic remains "doctor accepted this
 * proposal" which is what the audit log cares about.
 *
 * Idempotent on already-resolved suggestions: returns the existing
 * row with `alreadyResolved: true`.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/require-auth";
import { resolveSuggestion } from "@/lib/ai-suggestion";
import { logger } from "@/lib/logger";
import { logAudit } from "@/lib/audit";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth();
    if (auth.response) return auth.response;
    const { id } = await params;

    const existing = await prisma.aISuggestion.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ success: false, error: "Suggestion not found" }, { status: 404 });
    if (existing.status !== "PENDING") {
      return NextResponse.json({ success: true, data: existing, alreadyResolved: true });
    }
    if (!existing.patientId || !existing.appointmentId) {
      return NextResponse.json(
        { success: false, error: "Suggestion is missing patient or appointment context" },
        { status: 400 },
      );
    }

    const payload = (existing.payload ?? {}) as Record<string, unknown>;

    let acceptedEntityType: string | undefined;
    let acceptedEntityId: string | undefined;

    if (existing.kind === "LAB") {
      const testName = String(payload.testName ?? "").trim();
      if (!testName) {
        return NextResponse.json({ success: false, error: "Lab proposal missing testName" }, { status: 400 });
      }
      const lab = await prisma.labTest.create({
        data: {
          patientId: existing.patientId,
          doctorId: auth.user.id,
          appointmentId: existing.appointmentId,
          testName,
          testCode: typeof payload.testCode === "string" ? payload.testCode : null,
          status: "REQUESTED",
          priority: "NORMAL",
          notes: typeof payload.indication === "string" && payload.indication.trim()
            ? payload.indication.trim()
            : null,
        },
      });
      acceptedEntityType = "LabTest";
      acceptedEntityId = lab.id;
    } else if (existing.kind === "FOLLOWUP") {
      const reason = String(payload.reason ?? "").trim();
      if (!reason) {
        return NextResponse.json({ success: false, error: "Follow-up proposal missing reason" }, { status: 400 });
      }
      const days = typeof payload.days === "number" && payload.days > 0 ? Math.round(payload.days) : 14;
      const due = new Date();
      due.setDate(due.getDate() + days);
      // FollowUp model has its own required fields; fill the minimal
      // set and let the desktop UI let the doctor refine later.
      const followUp = await prisma.followUp.create({
        data: {
          patientId: existing.patientId,
          appointmentId: existing.appointmentId,
          doctorId: auth.user.id,
          reason,
          dueDate: due,
          status: "PENDING",
        },
      });
      acceptedEntityType = "FollowUp";
      acceptedEntityId = followUp.id;
    }
    // MEDICATION: no artifact created here; the prescription save
    // path is the eventual artifact origin. Resolve as ACCEPTED with
    // no link (the CHECK allows null+null).

    const updated = await resolveSuggestion({
      id,
      decidedById: auth.user.id,
      status: "ACCEPTED",
      acceptedEntityType,
      acceptedEntityId,
    });

    await logAudit({
      userId: auth.user.id,
      action: "ACCEPT_AI_SUGGESTION",
      module: "AI",
      entityType: "AISuggestion",
      entityId: id,
      details: { kind: existing.kind, acceptedEntityType, acceptedEntityId },
    });

    return NextResponse.json({
      success: true,
      data: { suggestion: updated, payload, acceptedEntityType, acceptedEntityId },
    });
  } catch (error) {
    logger.api("POST", "/api/ai/suggestions/[id]/accept", error);
    return NextResponse.json({ success: false, error: "Failed to accept suggestion" }, { status: 500 });
  }
}
