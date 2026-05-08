/**
 * @system MediCore ERP — ICD-10 catalogue (v55)
 * @route GET /api/icd10?q=<query>&limit=<n>
 *
 * Auth: any authenticated user (codes are reference data, not
 * patient data — clinical staff need access to pick them).
 *
 * Behaviour:
 *   - With no `q`, returns the `isCommon=true` codes (default ~25)
 *     so the picker has something to show on first open.
 *   - With `q`, matches code OR description (case-insensitive). The
 *     code prefix takes priority (typing "L70" should beat
 *     description matches that happen to contain "L70" elsewhere).
 *   - `limit` capped at 50 to keep payloads tight.
 *
 * Response shape: `{ success, data: ICD10Code[] }`. Picker UIs read
 * `code`, `description`, `category` from each row.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/require-auth";
import { logger } from "@/lib/logger";

export async function GET(request: Request) {
  try {
    const auth = await requireAuth();
    if (auth.response) return auth.response;

    const { searchParams } = new URL(request.url);
    const q = (searchParams.get("q") || "").trim();
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") || "25", 10) || 25));

    if (!q) {
      const common = await prisma.iCD10Code.findMany({
        where: { isActive: true, isCommon: true },
        orderBy: [{ category: "asc" }, { code: "asc" }],
        take: limit,
        select: { code: true, description: true, category: true, isCommon: true },
      });
      return NextResponse.json({ success: true, data: common });
    }

    // Two-pass match: code prefix first (precise), then description
    // contains. Dedupe by code.
    const upperQ = q.toUpperCase();
    const [byCode, byDescription] = await Promise.all([
      prisma.iCD10Code.findMany({
        where: { isActive: true, code: { startsWith: upperQ } },
        orderBy: { code: "asc" },
        take: limit,
        select: { code: true, description: true, category: true, isCommon: true },
      }),
      prisma.iCD10Code.findMany({
        where: { isActive: true, description: { contains: q, mode: "insensitive" } },
        orderBy: [{ isCommon: "desc" }, { code: "asc" }],
        take: limit,
        select: { code: true, description: true, category: true, isCommon: true },
      }),
    ]);

    const seen = new Set<string>();
    const merged = [...byCode, ...byDescription].filter((c) => {
      if (seen.has(c.code)) return false;
      seen.add(c.code);
      return true;
    }).slice(0, limit);

    return NextResponse.json({ success: true, data: merged });
  } catch (error) {
    logger.api("GET", "/api/icd10", error);
    return NextResponse.json(
      { success: false, error: "Failed to load ICD-10 codes" },
      { status: 500 },
    );
  }
}
