/**
 * @system MediCore ERP — Daily billing report
 * @route GET /api/billing/reports/daily?date=YYYY-MM-DD&branchId=…
 *
 * The all-in-one daily close report. Returns:
 *   - perInvoice: every invoice processed that day (line items + payments)
 *   - paymentsByMethod: CASH / CARD / CHEQUE / etc breakdown
 *   - salesByCategory: by Treatment.category (Services / Products / etc)
 *   - expenses: petty cash payouts logged for the day
 *   - reconciliation: opening, gross, net, expenses, expectedCash
 *   - closing: the saved DailyClosing snapshot (or null if not closed)
 *
 * If a closing snapshot exists for this date+branch, the totals come
 * from the snapshot (frozen at close time) — invoices may have been
 * edited since but the report stays stable.
 *
 * Pre-close, the same shape is computed live from invoices + payments
 * + petty_cash_expenses for the day.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/require-auth";
import { logger } from "@/lib/logger";
import { clinicDayRange, clinicDayRangeTz, getClinicToday } from "@/lib/utils";

export async function GET(request: Request) {
  try {
    const auth = await requireAuth();
    if (auth.response) return auth.response;

    const { searchParams } = new URL(request.url);
    const date = searchParams.get("date") || getClinicToday();
    const branchId = searchParams.get("branchId"); // optional — null = all branches

    // Two day-ranges side by side:
    //   dayRangeDate — for @db.Date columns (PettyCashExpense.date,
    //     DailyClosing.date) where Prisma stores date-only and bounds
    //     must be UTC midnight to align.
    //   dayRange     — for DateTime columns (Invoice.createdAt,
    //     Payment.processedAt) where the actual instant matters; bounds
    //     are PKT midnight so a row at 21:07Z on May 2 (= 02:07 PKT
    //     May 3) is correctly counted under May 3, not May 2.
    const dayRangeDate = clinicDayRange(date);
    const dayRange = clinicDayRangeTz(date);

    // ── 1. Saved closing snapshot (if any) ─────────────────────────
    // Snapshots are per-branch; only meaningful with a specific branchId.
    // In all-branches mode there's no single snapshot to look up.
    const closing = branchId
      ? await prisma.dailyClosing.findUnique({
          where: { branchId_date: { branchId, date: dayRangeDate.gte } },
          include: { closedBy: { select: { id: true, name: true } } },
        })
      : null;

    // ── 2. Per-invoice detail ──────────────────────────────────────
    // Filter on Invoice.createdAt within the day; that's when the
    // patient was billed. (Alternative: filter on Payment.processedAt,
    // but then invoices that were billed but not yet paid wouldn't
    // appear, and we want them on the day's gross-sale line.)
    const invoices = await prisma.invoice.findMany({
      where: {
        ...(branchId ? { branchId } : {}),
        createdAt: { gte: dayRange.gte, lt: dayRange.lt },
        status: { notIn: ["CANCELLED"] },
      },
      include: {
        patient: { select: { id: true, firstName: true, lastName: true, patientCode: true, phone: true } },
        branch: { select: { id: true, name: true, code: true } },
        appointment: {
          select: {
            id: true, appointmentCode: true, startTime: true, endTime: true,
            doctor: { select: { id: true, name: true } },
            treatment: { select: { id: true, name: true, category: true } },
          },
        },
        items: {
          include: {
            treatment: { select: { id: true, name: true, category: true } },
          },
        },
        payments: {
          include: {
            processedBy: { select: { id: true, name: true } },
          },
          orderBy: { processedAt: "asc" },
        },
        createdBy: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    // ── 3. Payments processed today (across ALL invoices, even old) ─
    // Reception cares about *today's cash-flow*, not just today's
    // billed invoices. A payment received today against last week's
    // invoice still affects today's cash drawer.
    const paymentsToday = await prisma.payment.findMany({
      where: {
        processedAt: { gte: dayRange.gte, lt: dayRange.lt },
        ...(branchId ? { invoice: { branchId } } : {}),
      },
      include: {
        invoice: {
          select: {
            id: true, invoiceNumber: true, total: true, createdAt: true,
            patient: { select: { id: true, firstName: true, lastName: true, patientCode: true } },
            appointment: { select: { doctor: { select: { id: true, name: true } } } },
          },
        },
        processedBy: { select: { id: true, name: true } },
      },
      orderBy: { processedAt: "asc" },
    });

    // ── 4. Petty cash for the day ──────────────────────────────────
    const expenses = await prisma.pettyCashExpense.findMany({
      where: {
        ...(branchId ? { branchId } : {}),
        date: { gte: dayRangeDate.gte, lt: dayRangeDate.lt }, // @db.Date — UTC bounds
      },
      include: {
        recordedBy: { select: { id: true, name: true } },
        branch: { select: { id: true, name: true, code: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    // ── 5. Aggregations ────────────────────────────────────────────
    // Server-side, Prisma returns Decimal columns as Decimal *instances*,
    // NOT strings — strings only appear after JSON serialization on the
    // way out. So the previous "covered by the string branch" comment
    // was wrong: typeof Decimal === "object", which fell through and
    // returned 0. That's why every aggregated total in the report
    // (gross sale / cash / etc) showed 0 even when the per-invoice
    // rows rendered the right amounts client-side.
    const num = (v: unknown): number => {
      if (v == null) return 0;
      if (typeof v === "number") return Number.isFinite(v) ? v : 0;
      if (typeof v === "string") { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; }
      // Prisma Decimal — duck-typed via toString. Same trick covers any
      // value whose JSON form would be a numeric string.
      const s = String(v);
      const n = parseFloat(s);
      return Number.isFinite(n) ? n : 0;
    };

    // Sales by category — derived from invoice items' treatment.category.
    // Items without a treatment fall under "Other". This mirrors the
    // SkedWise "Services / Products / Vouchers / Training" breakdown;
    // skin clinics primarily sell Services so the bulk lands there.
    const salesByCategory: Record<string, number> = {};
    for (const inv of invoices) {
      for (const item of inv.items) {
        const cat = item.treatment?.category || "Other";
        const lineTotal = num(item.total);
        salesByCategory[cat] = (salesByCategory[cat] || 0) + lineTotal;
      }
    }

    // Payments by method — across ALL payments processed today,
    // regardless of which invoice they belong to.
    const paymentsByMethod: Record<string, number> = {};
    for (const p of paymentsToday) {
      const m = p.method;
      paymentsByMethod[m] = (paymentsByMethod[m] || 0) + num(p.amount);
    }

    // Expenses by category
    const expensesByCategory: Record<string, number> = {};
    for (const e of expenses) {
      expensesByCategory[e.category] = (expensesByCategory[e.category] || 0) + num(e.amount);
    }

    const grossSale = invoices.reduce((s, i) => s + num(i.total), 0);
    const totalDiscount = invoices.reduce((s, i) => s + num(i.discount), 0);
    const totalTax = invoices.reduce((s, i) => s + num(i.tax), 0);
    // Net sale = gross − discount (tax is included in `total` already
    // in our schema). Matches the SkedWise "Today's Net Sale" intent.
    const netSale = grossSale - totalDiscount;
    const totalPayments = paymentsToday.reduce((s, p) => s + num(p.amount), 0);
    const totalExpenses = expenses.reduce((s, e) => s + num(e.amount), 0);

    const cashReceipts = paymentsByMethod["CASH"] || 0;
    const opening = closing ? num(closing.openingTill) : 0;
    // "Cash in hand" / "expected cash" = opening + cash receipts − expenses.
    // CC tips would be subtracted here too if we tracked them.
    const expectedCash = opening + cashReceipts - totalExpenses;

    // ── 6. Hints: previous-day closing + nearby active dates ──────
    // Two purposes:
    //   (a) Pre-fill Opening Till in the close-day modal from the
    //       previous day's `cashCounted` (carry-forward).
    //   (b) When today is empty, point the user at the nearest
    //       active day so they don't think the report is broken.
    const previousClosing = branchId
      ? await prisma.dailyClosing.findFirst({
          where: { branchId, date: { lt: dayRangeDate.gte } },
          orderBy: { date: "desc" },
          select: { date: true, cashCounted: true },
        })
      : null;

    const isEmpty =
      invoices.length === 0 && paymentsToday.length === 0 && expenses.length === 0;
    let previousActiveDate: string | null = null;
    let nextActiveDate: string | null = null;
    if (isEmpty) {
      const where = branchId ? { branchId } : {};
      const [prev, next] = await Promise.all([
        prisma.invoice.findFirst({
          where: { ...where, createdAt: { lt: dayRange.gte }, status: { notIn: ["CANCELLED"] } },
          orderBy: { createdAt: "desc" },
          select: { createdAt: true },
        }),
        prisma.invoice.findFirst({
          where: { ...where, createdAt: { gte: dayRange.lt }, status: { notIn: ["CANCELLED"] } },
          orderBy: { createdAt: "asc" },
          select: { createdAt: true },
        }),
      ]);
      // Convert to clinic-day key (YYYY-MM-DD) for the client.
      if (prev) previousActiveDate = prev.createdAt
        .toLocaleDateString("en-CA", { timeZone: "Asia/Karachi" });
      if (next) nextActiveDate = next.createdAt
        .toLocaleDateString("en-CA", { timeZone: "Asia/Karachi" });
    }

    return NextResponse.json({
      success: true,
      data: {
        date,
        branchId,
        hints: {
          previousClosingCashCounted: previousClosing
            ? Number(previousClosing.cashCounted)
            : null,
          previousClosingDate: previousClosing
            ? previousClosing.date.toLocaleDateString("en-CA", { timeZone: "Asia/Karachi" })
            : null,
          previousActiveDate,
          nextActiveDate,
          isEmpty,
        },
        invoices: invoices.map((i) => ({
          id: i.id,
          invoiceNumber: i.invoiceNumber,
          createdAt: i.createdAt,
          status: i.status,
          branch: i.branch,
          patient: i.patient,
          doctor: i.appointment?.doctor || null,
          appointmentCode: i.appointment?.appointmentCode || null,
          subtotal: i.subtotal,
          discount: i.discount,
          tax: i.tax,
          total: i.total,
          amountPaid: i.amountPaid,
          balanceDue: i.balanceDue,
          createdBy: i.createdBy,
          items: i.items.map((it) => ({
            id: it.id,
            // Prefer the catalog name (so receipts say "Hydra Facial"
            // instead of "Hydra Facial — package add-on"), fall back to
            // the line description for ad-hoc / non-catalog items.
            name: it.treatment?.name || it.description,
            category: it.treatment?.category || "Other",
            quantity: it.quantity,
            unitPrice: it.unitPrice,
            discount: it.discount,
            tax: it.tax,
            total: it.total,
          })),
          payments: i.payments.map((p) => ({
            id: p.id,
            amount: p.amount,
            method: p.method,
            reference: p.reference,
            status: p.status,
            processedAt: p.processedAt,
            processedBy: p.processedBy,
          })),
        })),
        paymentsToday: paymentsToday.map((p) => ({
          id: p.id,
          processedAt: p.processedAt,
          amount: p.amount,
          method: p.method,
          reference: p.reference,
          status: p.status,
          invoiceNumber: p.invoice.invoiceNumber,
          invoiceTotal: p.invoice.total,
          patient: p.invoice.patient,
          doctor: p.invoice.appointment?.doctor || null,
          processedBy: p.processedBy,
        })),
        expenses,
        salesByCategory,
        paymentsByMethod,
        expensesByCategory,
        totals: {
          invoiceCount: invoices.length,
          paymentCount: paymentsToday.length,
          expenseCount: expenses.length,
          grossSale,
          netSale,
          totalDiscount,
          totalTax,
          totalPayments,
          totalExpenses,
          cashReceipts,
          opening,
          expectedCash,
        },
        closing: closing
          ? {
              ...closing,
              isClosed: true,
            }
          : null,
      },
    });
  } catch (error) {
    logger.api("GET", "/api/billing/reports/daily", error);
    return NextResponse.json(
      { success: false, error: "Failed to compute daily report" },
      { status: 500 }
    );
  }
}
