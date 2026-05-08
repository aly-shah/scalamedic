/**
 * @system MediCore ERP — Reject an AI suggestion
 * @route POST /api/ai/suggestions/:id/reject
 *
 * Marks the suggestion REJECTED with the deciding user and an
 * optional reason. No clinical artifact is created. Idempotent on
 * already-resolved suggestions (returns the existing row).
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/require-auth";
import { resolveSuggestion } from "@/lib/ai-suggestion";
import { logger } from "@/lib/logger";
import { logAudit } from "@/lib/audit";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth();
    if (auth.response) return auth.response;
    const { id } = await params;

    const body = await request.json().catch(() => ({}));
    const reason = typeof body.reason === "string" && body.reason.trim() ? body.reason.trim() : null;

    const existing = await prisma.aISuggestion.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ success: false, error: "Suggestion not found" }, { status: 404 });
    if (existing.status !== "PENDING") {
      return NextResponse.json({ success: true, data: existing, alreadyResolved: true });
    }

    const updated = await resolveSuggestion({
      id,
      decidedById: auth.user.id,
      status: "REJECTED",
      rejectionReason: reason,
    });

    await logAudit({
      userId: auth.user.id,
      action: "REJECT_AI_SUGGESTION",
      module: "AI",
      entityType: "AISuggestion",
      entityId: id,
      details: { kind: existing.kind, reason },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    logger.api("POST", "/api/ai/suggestions/[id]/reject", error);
    return NextResponse.json({ success: false, error: "Failed to reject suggestion" }, { status: 500 });
  }
}
