/**
 * @system MediCore ERP — AI suggestion audit reader (admin)
 * @route GET /api/admin/ai-suggestions
 *
 * Lists AI suggestions across all doctors with filters for status,
 * kind, doctor, and date range. The admin reader feeds the
 * /admin/ai-suggestions audit dashboard so clinic owners can see
 * what the AI proposed and what the doctors did with it.
 *
 * Auth: ADMIN+. The data is sensitive (links AI proposals to
 * specific doctors and patients), but admins already see the rest
 * of the clinical surface.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/require-auth";
import { logger } from "@/lib/logger";
import type { Prisma, AISuggestionKind, AISuggestionStatus } from "@prisma/client";

const VALID_KINDS = new Set(["MEDICATION", "LAB", "FOLLOWUP", "PROCEDURE", "NOTE_FIELD", "DIAGNOSIS_HINT"]);
const VALID_STATUSES = new Set(["PENDING", "ACCEPTED", "REJECTED", "EXPIRED"]);

export async function GET(request: Request) {
  try {
    const auth = await requireAuth({ minRole: "ADMIN" });
    if (auth.response) return auth.response;

    const { searchParams } = new URL(request.url);
    const kind = searchParams.get("kind");
    const status = searchParams.get("status");
    const doctorId = searchParams.get("doctorId");
    const days = Math.max(1, Math.min(365, parseInt(searchParams.get("days") || "30", 10) || 30));
    const limit = Math.max(1, Math.min(200, parseInt(searchParams.get("limit") || "100", 10) || 100));

    const where: Prisma.AISuggestionWhereInput = {
      createdAt: { gte: new Date(Date.now() - days * 86400_000) },
    };
    if (kind && VALID_KINDS.has(kind)) where.kind = kind as AISuggestionKind;
    if (status && VALID_STATUSES.has(status)) where.status = status as AISuggestionStatus;
    if (doctorId) where.doctorId = doctorId;

    const [rows, kindAgg, statusAgg] = await Promise.all([
      prisma.aISuggestion.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        include: {
          patient: { select: { id: true, firstName: true, lastName: true, patientCode: true } },
          doctor: { select: { id: true, name: true } },
          decidedBy: { select: { id: true, name: true } },
          appointment: { select: { id: true, appointmentCode: true, date: true } },
        },
      }),
      prisma.aISuggestion.groupBy({
        where: { createdAt: { gte: new Date(Date.now() - days * 86400_000) } },
        by: ["kind"],
        _count: { _all: true },
      }),
      prisma.aISuggestion.groupBy({
        where: { createdAt: { gte: new Date(Date.now() - days * 86400_000) } },
        by: ["status"],
        _count: { _all: true },
      }),
    ]);

    return NextResponse.json({
      success: true,
      data: rows,
      summary: {
        windowDays: days,
        byKind: Object.fromEntries(kindAgg.map((r) => [r.kind, r._count._all])),
        byStatus: Object.fromEntries(statusAgg.map((r) => [r.status, r._count._all])),
        total: rows.length,
      },
    });
  } catch (error) {
    logger.api("GET", "/api/admin/ai-suggestions", error);
    return NextResponse.json(
      { success: false, error: "Failed to load AI suggestions" },
      { status: 500 },
    );
  }
}
