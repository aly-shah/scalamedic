/**
 * @system MediCore ERP — Monthly billing report
 * @route GET /api/billing/reports/monthly?month=YYYY-MM&branchId=…
 *
 * Aggregates DailyClosing snapshots for the month plus, for any
 * un-closed days, computes a live mini-aggregate from raw invoices /
 * payments / petty-cash so the month total isn't artificially low
 * just because someone forgot to close yesterday.
 *
 * Returns:
 *   - perDay: array of {date, source: "closing"|"live", totals}
 *   - monthTotals: rolled-up totals for the whole month
 *   - salesByCategory / paymentsByMethod / expensesByCategory: rolled up
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/require-auth";
import { logger } from "@/lib/logger";
import { clinicDayRange, clinicDayRangeTz, getClinicToday, toClinicDay, CLINIC_TZ } from "@/lib/utils";

const MONTH_RE = /^\d{4}-\d{2}$/;

export async function GET(request: Request) {
  try {
    const auth = await requireAuth();
    if (auth.response) return auth.response;

    const { searchParams } = new URL(request.url);
    const month = searchParams.get("month") || getClinicToday().slice(0, 7);
    const branchId = searchParams.get("branchId"); // optional — null = all branches

    if (!MONTH_RE.test(month)) {
      return NextResponse.json(
        { success: false, error: "month must be YYYY-MM" },
        { status: 400 }
      );
    }

    // Month boundaries in clinic time. First day at 00:00 PKT,
    // first of next month at 00:00 PKT.
    const [y, m] = month.split("-").map(Number);
    const firstDay = `${y}-${String(m).padStart(2, "0")}-01`;
    const nextMonth = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
    // Two parallel ranges: PKT-bounds for DateTime columns,
    // UTC-bounds for @db.Date columns. Same split as the daily report.
    const startRangeDate = clinicDayRange(firstDay);
    const endRangeDate = clinicDayRange(nextMonth);
    const startRange = clinicDayRangeTz(firstDay);
    const endRange = clinicDayRangeTz(nextMonth);

    // ── Saved closings for the month ───────────────────────────────
    const closings = await prisma.dailyClosing.findMany({
      where: {
        ...(branchId ? { branchId } : {}),
        date: { gte: startRangeDate.gte, lt: endRangeDate.gte }, // @db.Date — UTC bounds
      },
      orderBy: { date: "asc" },
    });

    const closedDays = new Set(closings.map((c) => toClinicDay(c.date)));

    // ── Un-closed days: pull raw rows so we can fill in live totals ──
    // Heavy-ish but bounded by 31 days × clinic volume. Acceptable.
    // Decimal-aware (Prisma returns Decimal as object server-side).
    const num = (v: unknown): number => {
      if (v == null) return 0;
      if (typeof v === "number") return Number.isFinite(v) ? v : 0;
      if (typeof v === "string") { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; }
      const n = parseFloat(String(v));
      return Number.isFinite(n) ? n : 0;
    };

    const [invoices, paymentsAll, expenses] = await Promise.all([
      prisma.invoice.findMany({
        where: {
          ...(branchId ? { branchId } : {}),
          createdAt: { gte: startRange.gte, lt: endRange.gte },
          status: { notIn: ["CANCELLED"] },
        },
        select: {
          id: true, total: true, discount: true, tax: true, createdAt: true,
          items: { select: { total: true, treatment: { select: { category: true } } } },
        },
      }),
      prisma.payment.findMany({
        where: {
          processedAt: { gte: startRange.gte, lt: endRange.gte },
          ...(branchId ? { invoice: { branchId } } : {}),
        },
        select: { amount: true, method: true, processedAt: true },
      }),
      prisma.pettyCashExpense.findMany({
        where: {
          ...(branchId ? { branchId } : {}),
          date: { gte: startRangeDate.gte, lt: endRangeDate.gte }, // @db.Date — UTC bounds
        },
        select: { amount: true, category: true, date: true },
      }),
    ]);

    // Index live data by clinic-day.
    type DayBucket = {
      grossSale: number; netSale: number; totalDiscount: number;
      totalTax: number; totalPayments: number; totalExpenses: number;
      cashReceipts: number; invoiceCount: number; paymentCount: number;
      expenseCount: number;
      salesByCategory: Record<string, number>;
      paymentsByMethod: Record<string, number>;
      expensesByCategory: Record<string, number>;
    };
    const newBucket = (): DayBucket => ({
      grossSale: 0, netSale: 0, totalDiscount: 0, totalTax: 0,
      totalPayments: 0, totalExpenses: 0, cashReceipts: 0,
      invoiceCount: 0, paymentCount: 0, expenseCount: 0,
      salesByCategory: {}, paymentsByMethod: {}, expensesByCategory: {},
    });
    const liveByDay: Record<string, DayBucket> = {};
    const bucket = (day: string): DayBucket => (liveByDay[day] ||= newBucket());

    for (const inv of invoices) {
      const day = toClinicDay(inv.createdAt);
      if (closedDays.has(day)) continue; // covered by snapshot
      const b = bucket(day);
      const t = num(inv.total);
      const d = num(inv.discount);
      b.grossSale += t;
      b.totalDiscount += d;
      b.totalTax += num(inv.tax);
      b.invoiceCount += 1;
      for (const it of inv.items) {
        const cat = it.treatment?.category || "Other";
        b.salesByCategory[cat] = (b.salesByCategory[cat] || 0) + num(it.total);
      }
    }
    for (const p of paymentsAll) {
      if (!p.processedAt) continue;
      const day = toClinicDay(p.processedAt);
      if (closedDays.has(day)) continue;
      const b = bucket(day);
      const a = num(p.amount);
      b.totalPayments += a;
      b.paymentsByMethod[p.method] = (b.paymentsByMethod[p.method] || 0) + a;
      if (p.method === "CASH") b.cashReceipts += a;
      b.paymentCount += 1;
    }
    for (const e of expenses) {
      const day = toClinicDay(e.date);
      if (closedDays.has(day)) continue;
      const b = bucket(day);
      const a = num(e.amount);
      b.totalExpenses += a;
      b.expensesByCategory[e.category] = (b.expensesByCategory[e.category] || 0) + a;
      b.expenseCount += 1;
    }
    // Net sale = gross − discount, applied per bucket.
    for (const day of Object.keys(liveByDay)) {
      const b = liveByDay[day];
      b.netSale = b.grossSale - b.totalDiscount;
    }

    // ── Stitch closings + live into perDay rows ────────────────────
    type DayRow = {
      date: string;
      source: "closing" | "live";
      grossSale: number; netSale: number; totalDiscount: number; totalTax: number;
      totalPayments: number; totalExpenses: number; cashReceipts: number;
      invoiceCount: number; paymentCount: number; expenseCount: number;
      difference: number | null;
      salesByCategory: Record<string, number>;
      paymentsByMethod: Record<string, number>;
      expensesByCategory: Record<string, number>;
    };
    const perDay: DayRow[] = [];

    for (const c of closings) {
      perDay.push({
        date: toClinicDay(c.date),
        source: "closing",
        grossSale: num(c.grossSale),
        netSale: num(c.netSale),
        totalDiscount: num(c.totalDiscount),
        totalTax: num(c.totalTax),
        totalPayments: num(c.totalPayments),
        totalExpenses: num(c.totalExpenses),
        cashReceipts: num((c.paymentsByMethod as Record<string, number>)?.["CASH"] || 0),
        invoiceCount: c.invoiceCount,
        paymentCount: c.paymentCount,
        expenseCount: c.expenseCount,
        difference: num(c.difference),
        salesByCategory: (c.salesByCategory as Record<string, number>) || {},
        paymentsByMethod: (c.paymentsByMethod as Record<string, number>) || {},
        expensesByCategory: (c.expensesByCategory as Record<string, number>) || {},
      });
    }
    for (const [day, b] of Object.entries(liveByDay)) {
      perDay.push({
        date: day,
        source: "live",
        grossSale: b.grossSale,
        netSale: b.netSale,
        totalDiscount: b.totalDiscount,
        totalTax: b.totalTax,
        totalPayments: b.totalPayments,
        totalExpenses: b.totalExpenses,
        cashReceipts: b.cashReceipts,
        invoiceCount: b.invoiceCount,
        paymentCount: b.paymentCount,
        expenseCount: b.expenseCount,
        difference: null,
        salesByCategory: b.salesByCategory,
        paymentsByMethod: b.paymentsByMethod,
        expensesByCategory: b.expensesByCategory,
      });
    }
    perDay.sort((a, b) => a.date.localeCompare(b.date));

    // ── Roll-ups ──────────────────────────────────────────────────
    const monthTotals = perDay.reduce(
      (acc, r) => {
        acc.grossSale += r.grossSale;
        acc.netSale += r.netSale;
        acc.totalDiscount += r.totalDiscount;
        acc.totalTax += r.totalTax;
        acc.totalPayments += r.totalPayments;
        acc.totalExpenses += r.totalExpenses;
        acc.cashReceipts += r.cashReceipts;
        acc.invoiceCount += r.invoiceCount;
        acc.paymentCount += r.paymentCount;
        acc.expenseCount += r.expenseCount;
        return acc;
      },
      {
        grossSale: 0, netSale: 0, totalDiscount: 0, totalTax: 0,
        totalPayments: 0, totalExpenses: 0, cashReceipts: 0,
        invoiceCount: 0, paymentCount: 0, expenseCount: 0,
      }
    );

    const sumMaps = (key: "salesByCategory" | "paymentsByMethod" | "expensesByCategory") => {
      const out: Record<string, number> = {};
      for (const r of perDay) {
        for (const [k, v] of Object.entries(r[key])) {
          out[k] = (out[k] || 0) + v;
        }
      }
      return out;
    };

    return NextResponse.json({
      success: true,
      data: {
        month,
        branchId,
        perDay,
        monthTotals,
        salesByCategory: sumMaps("salesByCategory"),
        paymentsByMethod: sumMaps("paymentsByMethod"),
        expensesByCategory: sumMaps("expensesByCategory"),
        closedDays: Array.from(closedDays).sort(),
        timezone: CLINIC_TZ,
      },
    });
  } catch (error) {
    logger.api("GET", "/api/billing/reports/monthly", error);
    return NextResponse.json(
      { success: false, error: "Failed to compute monthly report" },
      { status: 500 }
    );
  }
}
