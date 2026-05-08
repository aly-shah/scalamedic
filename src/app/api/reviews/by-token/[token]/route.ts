/**
 * @system MediCore ERP — Patient review form (public)
 * @route GET  /api/reviews/by-token/:token  — eligibility state
 * @route POST /api/reviews/by-token/:token  — submit feedback
 *
 * Both endpoints are PUBLIC — they're called from the patient-facing
 * /review/[token] page after an anonymous QR scan. The handlers
 * deliberately leak NOTHING about the patient: the response only
 * indicates whether a review is currently being collected.
 *
 * Eligibility = window is open (now <= appointment.date + 48h, or
 * token.createdAt + 48h for invoices without an appointment) AND the
 * token has not been revoked AND no review has been submitted yet.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

const REVIEW_WINDOW_MS = 48 * 60 * 60 * 1000; // 2 days

type ReviewState =
  | "ELIGIBLE"          // form should render
  | "ALREADY_SUBMITTED" // patient has already left a review
  | "OUTSIDE_WINDOW"    // 2-day review window has closed
  | "REVOKED"           // token was admin-revoked
  | "NOT_FOUND";        // raw token doesn't resolve

interface ReviewResp {
  success: true;
  state: ReviewState;
  // Branded copy only — no patient name / treatment / amount.
  clinicName: string;
}

const CLINIC_NAME = "Dr. Nakhoda's Skin Institute";

async function loadTokenContext(rawToken: string) {
  return prisma.qrToken.findUnique({
    where: { token: rawToken },
    select: {
      id: true,
      revokedAt: true,
      createdAt: true,
      appointment: { select: { date: true } },
      review: { select: { id: true } },
    },
  });
}

function currentState(ctx: NonNullable<Awaited<ReturnType<typeof loadTokenContext>>>): ReviewState {
  if (ctx.revokedAt) return "REVOKED";
  if (ctx.review) return "ALREADY_SUBMITTED";
  // Anchor = appointment date if present, else token createdAt
  // (standalone invoice). The window closes 48h after the anchor.
  const anchor = ctx.appointment?.date ?? ctx.createdAt;
  const cutoff = anchor.getTime() + REVIEW_WINDOW_MS;
  if (Date.now() > cutoff) return "OUTSIDE_WINDOW";
  return "ELIGIBLE";
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    const ctx = await loadTokenContext(token);
    const state: ReviewState = ctx ? currentState(ctx) : "NOT_FOUND";
    const body: ReviewResp = { success: true, state, clinicName: CLINIC_NAME };
    return NextResponse.json(body);
  } catch (error) {
    logger.api("GET", "/api/reviews/by-token/[token]", error);
    // On error, default to OUTSIDE_WINDOW so the patient sees the
    // generic thank-you instead of an error screen.
    return NextResponse.json(
      { success: true, state: "OUTSIDE_WINDOW", clinicName: CLINIC_NAME },
      { status: 200 },
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    const body = await request.json().catch(() => ({}));

    // Validate input — enforce at boundary since this endpoint is
    // public and unauthenticated.
    const rating = Number(body.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return NextResponse.json(
        { success: false, error: "Rating must be an integer 1–5" },
        { status: 400 },
      );
    }
    const feedbackRaw = typeof body.feedback === "string" ? body.feedback.trim() : "";
    const feedback = feedbackRaw.length > 0 ? feedbackRaw.slice(0, 2000) : null;
    const wouldRecommend =
      typeof body.wouldRecommend === "boolean" ? body.wouldRecommend : null;
    const pseudonymRaw = typeof body.pseudonym === "string" ? body.pseudonym.trim() : "";
    const pseudonym = pseudonymRaw.length > 0 ? pseudonymRaw.slice(0, 60) : null;

    const ctx = await loadTokenContext(token);
    if (!ctx) {
      return NextResponse.json({ success: false, error: "NOT_FOUND" }, { status: 404 });
    }
    const state = currentState(ctx);
    if (state !== "ELIGIBLE") {
      return NextResponse.json(
        { success: false, state, error: state },
        { status: 409 },
      );
    }

    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
      request.headers.get("x-real-ip") ||
      null;
    const ua = request.headers.get("user-agent")?.slice(0, 300) || null;

    // Race-safe: the unique index on tokenId means a double-submit
    // (e.g. patient hitting the button twice) hits the catch and
    // returns ALREADY_SUBMITTED instead of writing two rows.
    try {
      await prisma.visitReview.create({
        data: {
          tokenId: ctx.id,
          rating,
          feedback,
          wouldRecommend,
          pseudonym,
          ipAddress: ip,
          userAgent: ua,
        },
      });
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code === "P2002") {
        return NextResponse.json(
          { success: false, state: "ALREADY_SUBMITTED", error: "ALREADY_SUBMITTED" },
          { status: 409 },
        );
      }
      throw e;
    }

    return NextResponse.json({ success: true, state: "ALREADY_SUBMITTED" });
  } catch (error) {
    logger.api("POST", "/api/reviews/by-token/[token]", error);
    return NextResponse.json(
      { success: false, error: "Failed to submit review" },
      { status: 500 },
    );
  }
}
