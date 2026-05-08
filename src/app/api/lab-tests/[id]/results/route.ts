/**
 * @system MediCore ERP — Lab structured results
 * @route PUT /api/lab-tests/:id/results
 *
 * Bulk-replace the per-analyte rows for a lab test. Accepts an
 * array of analyte payloads; clears any existing rows and rewrites.
 * The bulk-replace shape mirrors how labs actually work — when a
 * tech enters results they enter the whole panel at once, and an
 * amendment usually re-enters everything.
 *
 * Auth: any authenticated staff (lab tech roles aren't separate
 * yet; the audit log captures who entered).
 *
 * Each row is normalized:
 *   - value (text, required) — what's printed on the report
 *   - valueNumeric (decimal, optional) — for trending/comparison
 *   - unit (optional)
 *   - referenceLow + referenceHigh (decimal, both-or-neither)
 *   - referenceText (optional, for categorical refs)
 *   - isAbnormal (defaults false; auto-set when valueNumeric is
 *     outside the numeric range)
 *   - flag (H, L, HH, LL, A — display-only severity hint)
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/require-auth";
import { logger } from "@/lib/logger";
import { logAudit } from "@/lib/audit";

interface ResultInput {
  analyte?: string;
  code?: string | null;
  value?: string;
  valueNumeric?: number | string | null;
  unit?: string | null;
  referenceLow?: number | string | null;
  referenceHigh?: number | string | null;
  referenceText?: string | null;
  isAbnormal?: boolean;
  flag?: string | null;
  displayOrder?: number;
  notes?: string | null;
}

const KNOWN_FLAGS = new Set(["H", "L", "HH", "LL", "A"]);

function toDecimalOrNull(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}
function trimOrNull(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth();
    if (auth.response) return auth.response;
    const { id: labTestId } = await params;

    const body = await request.json().catch(() => ({}));
    const rows: ResultInput[] = Array.isArray(body.rows) ? body.rows : [];

    const lab = await prisma.labTest.findUnique({
      where: { id: labTestId },
      select: { id: true },
    });
    if (!lab) return NextResponse.json({ success: false, error: "Lab test not found" }, { status: 404 });

    // Normalize + validate each row before touching the DB.
    const normalized: Array<{
      analyte: string; code: string | null;
      value: string; valueNumeric: number | null; unit: string | null;
      referenceLow: number | null; referenceHigh: number | null; referenceText: string | null;
      isAbnormal: boolean; flag: string | null;
      displayOrder: number; notes: string | null;
    }> = [];
    for (const [idx, raw] of rows.entries()) {
      const analyte = (raw.analyte ?? "").toString().trim();
      const value = (raw.value ?? "").toString().trim();
      if (!analyte) {
        return NextResponse.json(
          { success: false, error: `Row ${idx + 1}: analyte is required` },
          { status: 400 },
        );
      }
      if (!value) {
        return NextResponse.json(
          { success: false, error: `Row ${idx + 1}: value is required` },
          { status: 400 },
        );
      }
      const refLow  = toDecimalOrNull(raw.referenceLow);
      const refHigh = toDecimalOrNull(raw.referenceHigh);
      // Both-or-neither: route layer + DB CHECK both enforce; route
      // gives a clearer error.
      if ((refLow == null) !== (refHigh == null)) {
        return NextResponse.json(
          { success: false, error: `Row ${idx + 1}: reference range needs both low AND high (or neither)` },
          { status: 400 },
        );
      }
      if (refLow != null && refHigh != null && refHigh < refLow) {
        return NextResponse.json(
          { success: false, error: `Row ${idx + 1}: referenceHigh < referenceLow` },
          { status: 400 },
        );
      }
      const valueNumeric = toDecimalOrNull(raw.valueNumeric);
      // Auto-flag when the numeric value is outside the numeric
      // range and the lab tech hasn't explicitly set isAbnormal.
      let isAbnormal = !!raw.isAbnormal;
      let flag = raw.flag && typeof raw.flag === "string" ? raw.flag.toUpperCase() : null;
      if (flag && !KNOWN_FLAGS.has(flag)) flag = null;
      if (!isAbnormal && valueNumeric != null && refLow != null && refHigh != null) {
        if (valueNumeric < refLow) {
          isAbnormal = true;
          if (!flag) flag = "L";
        } else if (valueNumeric > refHigh) {
          isAbnormal = true;
          if (!flag) flag = "H";
        }
      }

      normalized.push({
        analyte,
        code: trimOrNull(raw.code),
        value,
        valueNumeric,
        unit: trimOrNull(raw.unit),
        referenceLow: refLow,
        referenceHigh: refHigh,
        referenceText: trimOrNull(raw.referenceText),
        isAbnormal,
        flag,
        displayOrder: typeof raw.displayOrder === "number" && raw.displayOrder >= 0 ? Math.round(raw.displayOrder) : idx,
        notes: trimOrNull(raw.notes),
      });
    }

    const result = await prisma.$transaction(async (tx) => {
      // Bulk-replace: delete + recreate. Cleaner than diff-merging
      // when amendments rewrite the whole panel.
      await tx.labTestResult.deleteMany({ where: { labTestId } });
      if (normalized.length > 0) {
        await tx.labTestResult.createMany({
          data: normalized.map((r) => ({ ...r, labTestId, enteredById: auth.user.id })),
        });
      }
      // Bump the parent lab to COMPLETED if it isn't already and
      // we received any rows.
      if (normalized.length > 0) {
        await tx.labTest.update({
          where: { id: labTestId },
          data: {
            status: "COMPLETED",
            completedAt: new Date(),
          },
        });
      }
      return tx.labTestResult.findMany({
        where: { labTestId },
        orderBy: { displayOrder: "asc" },
      });
    });

    await logAudit({
      userId: auth.user.id,
      action: "ENTER_RESULTS",
      module: "LAB",
      entityType: "LabTest",
      entityId: labTestId,
      details: { rowCount: normalized.length, abnormalCount: normalized.filter((r) => r.isAbnormal).length },
    });

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    logger.api("PUT", "/api/lab-tests/[id]/results", error);
    return NextResponse.json(
      { success: false, error: "Failed to save results" },
      { status: 500 },
    );
  }
}
