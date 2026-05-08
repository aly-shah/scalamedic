/**
 * @system MediCore ERP — Daily closing snapshots
 * @route GET  /api/billing/closings — list past closings
 * @route POST /api/billing/closings — close a day (freeze snapshot)
 *
 * Closing locks the (branch, date) pair: all totals are recomputed and
 * stored as JSON, and the snapshot becomes the source of truth for that
 * day's report. Petty cash for that date can no longer be edited.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/require-auth";
import { logger } from "@/lib/logger";
import { clinicDayRange, clinicDayRangeTz } from "@/lib/utils";

export async function GET(request: Request) {
  try {
    const auth = await requireAuth();
    if (auth.response) return auth.response;

    const { searchParams } = new URL(request.url);
    const branchId = searchParams.get("branchId");
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const limit = Math.min(parseInt(searchParams.get("limit") || "60") || 60, 366);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {};
    if (branchId) where.branchId = branchId;
    if (from || to) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const range: any = {};
      if (from) range.gte = clinicDayRange(from).gte;
      if (to) range.lt = clinicDayRange(to).lt;
      where.date = range;
    }

    const closings = await prisma.dailyClosing.findMany({
      where,
      include: {
        closedBy: { select: { id: true, name: true } },
        branch: { select: { id: true, name: true, code: true } },
      },
      orderBy: { date: "desc" },
      take: limit,
    });

    return NextResponse.json({ success: true, data: closings });
  } catch (error) {
    logger.api("GET", "/api/billing/closings", error);
    return NextResponse.json(
      { success: false, error: "Failed to list closings" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAuth({
      roles: ["SUPER_ADMIN", "ADMIN", "BILLING"],
    });
    if (auth.response) return auth.response;

    const body = await request.json();
    const date = body.date as string | undefined;
    const branchId = body.branchId as string | undefined;
    if (!date || !branchId) {
      return NextResponse.json(
        { success: false, error: "date and branchId are required" },
        { status: 400 }
      );
    }

    // dayRangeDate = UTC bounds for @db.Date columns (PettyCashExpense.date,
    // DailyClosing.date). dayRange = PKT bounds for DateTime columns
    // (Invoice.createdAt, Payment.processedAt). Same split as
    // /api/billing/reports/daily.
    const dayRangeDate = clinicDayRange(date);
    const dayRange = clinicDayRangeTz(date);

    // Reject if already closed (let the caller hit a separate
    // /reopen endpoint if they really meant to). Cleaner UX than
    // silently overwriting the snapshot.
    const existing = await prisma.dailyClosing.findUnique({
      where: { branchId_date: { branchId, date: dayRangeDate.gte } },
      select: { id: true },
    });
    if (existing) {
      return NextResponse.json(
        { success: false, error: "Day is already closed. Reopen the closing to recompute." },
        { status: 409 }
      );
    }

    // Decimal-aware: Prisma Decimal is an object server-side, so the
    // number/string branches alone returned 0 and silently zeroed out
    // the snapshot totals.
    const num = (v: unknown): number => {
      if (v == null) return 0;
      if (typeof v === "number") return Number.isFinite(v) ? v : 0;
      if (typeof v === "string") { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; }
      const n = parseFloat(String(v));
      return Number.isFinite(n) ? n : 0;
    };

    // Recompute everything fresh — same logic as /reports/daily.
    const [invoices, paymentsToday, expenses] = await Promise.all([
      prisma.invoice.findMany({
        where: {
          branchId,
          createdAt: { gte: dayRange.gte, lt: dayRange.lt },
          status: { notIn: ["CANCELLED"] },
        },
        include: { items: { include: { treatment: { select: { category: true } } } } },
      }),
      prisma.payment.findMany({
        where: {
          processedAt: { gte: dayRange.gte, lt: dayRange.lt },
          invoice: { branchId },
        },
      }),
      prisma.pettyCashExpense.findMany({
        where: { branchId, date: { gte: dayRangeDate.gte, lt: dayRangeDate.lt } }, // @db.Date — UTC
      }),
    ]);

    const salesByCategory: Record<string, number> = {};
    for (const inv of invoices) {
      for (const item of inv.items) {
        const cat = item.treatment?.category || "Other";
        salesByCategory[cat] = (salesByCategory[cat] || 0) + num(item.total);
      }
    }
    const paymentsByMethod: Record<string, number> = {};
    for (const p of paymentsToday) {
      paymentsByMethod[p.method] = (paymentsByMethod[p.method] || 0) + num(p.amount);
    }
    const expensesByCategory: Record<string, number> = {};
    for (const e of expenses) {
      expensesByCategory[e.category] = (expensesByCategory[e.category] || 0) + num(e.amount);
    }

    const grossSale = invoices.reduce((s, i) => s + num(i.total), 0);
    const totalDiscount = invoices.reduce((s, i) => s + num(i.discount), 0);
    const totalTax = invoices.reduce((s, i) => s + num(i.tax), 0);
    const netSale = grossSale - totalDiscount;
    const totalPayments = paymentsToday.reduce((s, p) => s + num(p.amount), 0);
    const totalExpenses = expenses.reduce((s, e) => s + num(e.amount), 0);
    const cashReceipts = paymentsByMethod["CASH"] || 0;
    const opening = num(body.openingTill);
    const cashCounted = num(body.cashCounted);
    const expectedCash = opening + cashReceipts - totalExpenses;
    const difference = cashCounted - expectedCash;

    const closing = await prisma.dailyClosing.create({
      data: {
        branchId,
        date: dayRangeDate.gte, // @db.Date — store at UTC midnight to align
        openingTill: opening,
        denominations: body.denominations ?? null,
        cashCounted,
        salesByCategory,
        paymentsByMethod,
        expensesByCategory,
        invoiceCount: invoices.length,
        paymentCount: paymentsToday.length,
        expenseCount: expenses.length,
        grossSale,
        netSale,
        totalDiscount,
        totalTax,
        totalPayments,
        totalExpenses,
        expectedCash,
        difference,
        remarks: body.remarks ? String(body.remarks).trim() : null,
        closedById: auth.user.id,
      },
      include: { closedBy: { select: { id: true, name: true } } },
    });

    return NextResponse.json({ success: true, data: closing }, { status: 201 });
  } catch (error) {
    logger.api("POST", "/api/billing/closings", error);
    return NextResponse.json(
      { success: false, error: "Failed to close the day" },
      { status: 500 }
    );
  }
}
