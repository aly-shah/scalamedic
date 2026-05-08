/**
 * @system MediCore ERP — Audit log CSV export
 * @route GET /api/admin/audit-log/export?from=ISO&to=ISO&action=&module=
 *
 * Streams the audit log as CSV — required for any HIPAA / GCC
 * compliance review. Filters: date range (default last 90 days),
 * optional action, optional module.
 *
 * Auth: SUPER_ADMIN. Audit logs reveal patient ids, sometimes
 * payload snippets — strictly the highest-tier admin only.
 *
 * Streaming: this implementation buffers the full result before
 * sending. For an installation with millions of events that'd
 * blow memory; current scale (single clinic, thousands of events)
 * is well within budget. When that breaks, switch to a
 * ReadableStream + paged Prisma cursor.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/require-auth";
import { logger } from "@/lib/logger";
import { logAudit } from "@/lib/audit";
import { requireFeature } from "@/lib/feature-gate";
import type { Prisma } from "@prisma/client";

function csvCell(v: unknown): string {
  if (v == null) return "";
  const s = typeof v === "string" ? v : JSON.stringify(v);
  // Escape per RFC 4180: wrap in quotes when the value contains
  // commas, quotes, CR, or LF; double-up internal quotes.
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export async function GET(request: Request) {
  try {
    const auth = await requireAuth({ minRole: "SUPER_ADMIN" });
    if (auth.response) return auth.response;

    // Audit export is an enterprise-tier feature.
    const planGate = await requireFeature(auth.user.id, "AUDIT_EXPORT");
    if (planGate) return planGate;

    const { searchParams } = new URL(request.url);
    const fromRaw = searchParams.get("from");
    const toRaw   = searchParams.get("to");
    const action  = searchParams.get("action");
    const moduleF = searchParams.get("module");
    // Default window: last 90 days. Compliance reviews typically ask
    // for at most a quarter; broader queries should pass an explicit
    // range so the operator is intentional about the size.
    const from = fromRaw ? new Date(fromRaw) : new Date(Date.now() - 90 * 86400_000);
    const to   = toRaw   ? new Date(toRaw)   : new Date();

    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from >= to) {
      return NextResponse.json(
        { success: false, error: "Invalid from/to range" },
        { status: 400 },
      );
    }

    const where: Prisma.AuditLogWhereInput = {
      createdAt: { gte: from, lte: to },
    };
    if (action) where.action = action;
    if (moduleF) where.module = moduleF;

    const rows = await prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "asc" },
      take: 50_000, // hard cap; broader exports = paged future work
      include: { user: { select: { id: true, name: true, email: true } } },
    });

    // CSV header ordered for compliance review readability:
    // when, who (id + name + email), what (action + module + entity),
    // details payload, request context.
    const header = [
      "createdAt", "userId", "userName", "userEmail",
      "action", "module", "entityType", "entityId",
      "ipAddress", "userAgent", "detailsJson",
    ].join(",");
    const lines = [header];
    for (const r of rows) {
      lines.push([
        r.createdAt.toISOString(),
        r.userId ?? "",
        r.user?.name ?? "",
        r.user?.email ?? "",
        r.action,
        r.module,
        r.entityType,
        r.entityId,
        r.ipAddress ?? "",
        r.userAgent ?? "",
        r.details ? JSON.stringify(r.details) : "",
      ].map(csvCell).join(","));
    }
    const body = lines.join("\r\n");

    // Audit the audit export — meta but important. A leaked CSV
    // dump should be traceable to whoever ran the export.
    await logAudit({
      userId: auth.user.id,
      action: "EXPORT",
      module: "AUDIT_LOG",
      entityType: "AuditLog",
      entityId: "csv",
      details: {
        from: from.toISOString(),
        to: to.toISOString(),
        action: action ?? null,
        moduleFilter: moduleF ?? null,
        rows: rows.length,
      },
    });

    const filename = `audit-log_${from.toISOString().slice(0, 10)}_to_${to.toISOString().slice(0, 10)}.csv`;
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    logger.api("GET", "/api/admin/audit-log/export", error);
    return NextResponse.json(
      { success: false, error: "Failed to export audit log" },
      { status: 500 },
    );
  }
}
