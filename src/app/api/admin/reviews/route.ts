/**
 * @system MediCore ERP — Admin reviews list
 * @route GET /api/admin/reviews
 *
 * Lists patient feedback submitted via the public /review/[token]
 * surface. Joins each review back to the linked appointment + patient
 * via the QR token chain so admin can see who left it. Auth-required
 * (ADMIN+); the public surface to write a review is at /api/reviews/
 * by-token.
 *
 * Query params:
 *   rating  — exact match (1-5), optional
 *   from    — ISO date, inclusive lower bound on submittedAt
 *   to      — ISO date, exclusive upper bound on submittedAt
 *   limit   — page size, max 200, default 50
 *   offset  — pagination offset
 *
 * Returns alongside the rows a summary aggregate (count, average
 * rating, recommend %, per-rating distribution) so the page can render
 * its hero strip without a separate request.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/require-auth";
import { logger } from "@/lib/logger";

export async function GET(request: Request) {
  try {
    const auth = await requireAuth({ minRole: "ADMIN" });
    if (auth.response) return auth.response;

    const { searchParams } = new URL(request.url);
    const ratingRaw = searchParams.get("rating");
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 200);
    const offset = parseInt(searchParams.get("offset") || "0", 10);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {};
    if (ratingRaw) {
      const r = parseInt(ratingRaw, 10);
      if (Number.isInteger(r) && r >= 1 && r <= 5) where.rating = r;
    }
    if (from || to) {
      where.submittedAt = {};
      if (from) where.submittedAt.gte = new Date(from);
      if (to) where.submittedAt.lt = new Date(to);
    }

    // Two queries in parallel: page rows + summary aggregate. Keeping
    // them separate avoids a giant GROUP BY over hundreds of rows when
    // the page only needs the aggregate once.
    const [rows, count, ratingGroups, recommendGroups] = await Promise.all([
      prisma.visitReview.findMany({
        where,
        orderBy: { submittedAt: "desc" },
        take: limit,
        skip: offset,
        include: {
          token: {
            select: {
              id: true,
              appointment: {
                select: {
                  id: true,
                  appointmentCode: true,
                  date: true,
                  doctor: { select: { id: true, name: true } },
                  treatment: { select: { id: true, name: true } },
                  patient: {
                    select: { id: true, firstName: true, lastName: true, patientCode: true },
                  },
                },
              },
              invoice: {
                select: {
                  id: true,
                  invoiceNumber: true,
                  patient: {
                    select: { id: true, firstName: true, lastName: true, patientCode: true },
                  },
                },
              },
            },
          },
        },
      }),
      prisma.visitReview.count({ where }),
      prisma.visitReview.groupBy({
        by: ["rating"],
        where,
        _count: { _all: true },
      }),
      prisma.visitReview.groupBy({
        by: ["wouldRecommend"],
        where,
        _count: { _all: true },
      }),
    ]);

    // Flatten the patient + appointment context so the client doesn't
    // have to walk the token relation. Token is server-only — a UI on
    // app.drnakhodas.com would never see it, but admin tooling does.
    const data = rows.map((r) => {
      const appt = r.token.appointment;
      const inv = r.token.invoice;
      return {
        id: r.id,
        rating: r.rating,
        feedback: r.feedback,
        wouldRecommend: r.wouldRecommend,
        pseudonym: r.pseudonym,
        submittedAt: r.submittedAt,
        appointment: appt
          ? {
              id: appt.id,
              appointmentCode: appt.appointmentCode,
              date: appt.date,
              doctorName: appt.doctor?.name ?? null,
              treatmentName: appt.treatment?.name ?? null,
            }
          : null,
        invoice: inv ? { id: inv.id, invoiceNumber: inv.invoiceNumber } : null,
        patient: appt?.patient ?? inv?.patient ?? null,
      };
    });

    // Summary stats for the hero. ratingDistribution always has
    // entries 1–5 (zero-filled) so the page can render bars without
    // null checks.
    const ratingDistribution = [1, 2, 3, 4, 5].map((rating) => ({
      rating,
      count: ratingGroups.find((g) => g.rating === rating)?._count._all ?? 0,
    }));
    const totalScored = ratingDistribution.reduce((s, r) => s + r.count * r.rating, 0);
    const totalCount = ratingDistribution.reduce((s, r) => s + r.count, 0);
    const averageRating = totalCount > 0 ? totalScored / totalCount : 0;
    const recommendYes = recommendGroups.find((g) => g.wouldRecommend === true)?._count._all ?? 0;
    const recommendNo = recommendGroups.find((g) => g.wouldRecommend === false)?._count._all ?? 0;
    const recommendDecided = recommendYes + recommendNo;

    return NextResponse.json({
      success: true,
      data,
      summary: {
        count,
        averageRating,
        ratingDistribution,
        recommendYes,
        recommendNo,
        recommendPercent: recommendDecided > 0 ? (recommendYes / recommendDecided) * 100 : null,
      },
      pagination: { total: count, limit, offset, hasMore: offset + limit < count },
    });
  } catch (error) {
    logger.api("GET", "/api/admin/reviews", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch reviews" },
      { status: 500 },
    );
  }
}
