/**
 * @system MediCore ERP — Accounting Export
 * @route GET /api/export/accounting — Export daily financial summary as CSV
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

import { getClinicToday, toClinicDay } from "@/lib/utils";
import { requireAuth } from "@/lib/require-auth";
import { logger } from "@/lib/logger";
export async function GET(request: Request) {
  try {
    const auth = await requireAuth({ minRole: "ADMIN" });
    if (auth.response) return auth.response;

    const { searchParams } = new URL(request.url);
    const from = searchParams.get("from") || toClinicDay(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));
    const to = searchParams.get("to") || getClinicToday();
    const branchId = searchParams.get("branchId");

    const where: Record<string, unknown> = {
      createdAt: { gte: new Date(from), lte: new Date(to + "T23:59:59") },
    };
    if (branchId) where.branchId = branchId;

    // Fetch invoices with payments
    const invoices = await prisma.invoice.findMany({
      where,
      include: {
        payments: true,
        patient: { select: { firstName: true, lastName: true, patientCode: true } },
        branch: { select: { name: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    // Build CSV
    const headers = ["Date", "Invoice #", "Patient", "Patient Code", "Branch", "Subtotal", "Discount", "Tax", "Total", "Paid", "Balance", "Status", "Payment Methods"];
    const rows = invoices.map((inv) => {
      const methods = inv.payments.map((p) => `${p.method}:${Number(p.amount)}`).join("; ");
      return [
        toClinicDay(inv.createdAt),
        inv.invoiceNumber,
        `${inv.patient.firstName} ${inv.patient.lastName}`,
        inv.patient.patientCode,
        inv.branch.name,
        Number(inv.subtotal),
        Number(inv.discount),
        Number(inv.tax),
        Number(inv.total),
        Number(inv.amountPaid),
        Number(inv.balanceDue),
        inv.status,
        methods,
      ].map((v) => {
        const s = String(v);
        return s.includes(",") ? `"${s}"` : s;
      }).join(",");
    });

    const csv = [headers.join(","), ...rows].join("\n");

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="medicore_accounting_${from}_to_${to}.csv"`,
      },
    });
  } catch (error) {
    logger.api("GET", "/api/export/accounting", error);
    return NextResponse.json({ success: false, error: "Export failed" }, { status: 500 });
  }
}
