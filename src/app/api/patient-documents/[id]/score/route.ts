/**
 * @system MediCore ERP — AI photo scoring (v56 / Tier 4.3)
 * @route POST /api/patient-documents/[id]/score
 * @route GET  /api/patient-documents/[id]/score
 *
 * POST: triggers an AI scoring run on the document (must be an
 * image). Replaces any existing PhotoScore for the document
 * (one row per document). DOCTOR / ADMIN / SUPER_ADMIN only —
 * AESTHETICIANS get clinical scoring data they shouldn't be ordering.
 *
 * GET: returns the most recent score for the document, or null.
 *
 * Rate-limited via the shared AI_INFERENCE bucket so a runaway
 * scoring loop can't burn through OpenAI credit.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/require-auth";
import { logger } from "@/lib/logger";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import {
  scorePhoto,
  PHOTO_SCORE_MODEL_ID,
  PHOTO_SCORE_PROMPT_V1,
} from "@/lib/ai-photo-score";

const IMAGE_MIME_PREFIX = "image/";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireAuth({ roles: ["SUPER_ADMIN", "ADMIN", "DOCTOR"] });
    if (auth.response) return auth.response;

    const rl = checkRateLimit(auth.user.id, RATE_LIMITS.AI_INFERENCE);
    if (!rl.ok) {
      return NextResponse.json(
        { success: false, error: `AI quota exceeded. Try again in ${Math.ceil(rl.retryAfter / 60)} min.` },
        { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
      );
    }

    const { id } = await params;
    const doc = await prisma.patientDocument.findUnique({
      where: { id },
      select: { id: true, patientId: true, fileUrl: true, mimeType: true, type: true },
    });
    if (!doc) {
      return NextResponse.json({ success: false, error: "Document not found" }, { status: 404 });
    }
    if (!doc.mimeType?.startsWith(IMAGE_MIME_PREFIX)) {
      return NextResponse.json(
        { success: false, error: "AI scoring is only available for image documents" },
        { status: 400 },
      );
    }

    let result;
    try {
      result = await scorePhoto({ fileUrl: doc.fileUrl, mimeType: doc.mimeType });
    } catch (err) {
      logger.api("POST", "/api/patient-documents/[id]/score (scorePhoto)", err);
      return NextResponse.json(
        { success: false, error: err instanceof Error ? err.message : "Scoring failed" },
        { status: 502 },
      );
    }

    // Upsert by documentId — re-scoring replaces.
    const saved = await prisma.photoScore.upsert({
      where: { documentId: doc.id },
      create: {
        documentId: doc.id,
        patientId: doc.patientId,
        condition: result.condition,
        severity: result.severity,
        lesionCount: result.lesionCount,
        bodyArea: result.bodyArea,
        findings: result.findings,
        recommendations: result.recommendations,
        confidence: result.confidence,
        modelId: PHOTO_SCORE_MODEL_ID,
        promptVersion: PHOTO_SCORE_PROMPT_V1,
        scoredById: auth.user.id,
      },
      update: {
        condition: result.condition,
        severity: result.severity,
        lesionCount: result.lesionCount,
        bodyArea: result.bodyArea,
        findings: result.findings,
        recommendations: result.recommendations,
        confidence: result.confidence,
        modelId: PHOTO_SCORE_MODEL_ID,
        promptVersion: PHOTO_SCORE_PROMPT_V1,
        scoredById: auth.user.id,
      },
    });

    return NextResponse.json({ success: true, data: saved });
  } catch (error) {
    logger.api("POST", "/api/patient-documents/[id]/score", error);
    return NextResponse.json(
      { success: false, error: "Failed to score photo" },
      { status: 500 },
    );
  }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireAuth();
    if (auth.response) return auth.response;
    const { id } = await params;
    const score = await prisma.photoScore.findUnique({ where: { documentId: id } });
    return NextResponse.json({ success: true, data: score });
  } catch (error) {
    logger.api("GET", "/api/patient-documents/[id]/score", error);
    return NextResponse.json(
      { success: false, error: "Failed to load score" },
      { status: 500 },
    );
  }
}
