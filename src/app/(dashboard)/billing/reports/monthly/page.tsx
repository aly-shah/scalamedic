"use client";

/**
 * Monthly Billing Report
 *
 * Aggregates DailyClosing snapshots for the chosen month, plus live
 * mini-aggregates for any un-closed days (so a forgotten close
 * doesn't artificially zero out the month). Per-day rows tagged
 * "closing" or "live" so the user can tell which is frozen.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft, Receipt, Download, ChevronLeft, ChevronRight,
  TrendingUp, TrendingDown, Banknote, AlertCircle, CheckCircle2,
  History, CalendarDays,
} from "lucide-react";
import { Button, Card, StatCard, Select } from "@/components/ui";
import { LoadingSpinner } from "@/components/ui/loading";
import { useBranches } from "@/hooks/use-queries";
import { useModuleAccess } from "@/modules/core/hooks";
import { formatCurrency, getClinicToday, CLINIC_TZ } from "@/lib/utils";
import { downloadCSV } from "@/lib/export";
import { api } from "@/lib/api";

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

type MonthlyReport = {
  month: string;
  branchId: string;
  perDay: DayRow[];
  monthTotals: {
    grossSale: number; netSale: number; totalDiscount: number; totalTax: number;
    totalPayments: number; totalExpenses: number; cashReceipts: number;
    invoiceCount: number; paymentCount: number; expenseCount: number;
  };
  salesByCategory: Record<string, number>;
  paymentsByMethod: Record<string, number>;
  expensesByCategory: Record<string, number>;
  closedDays: string[];
};

const PAYMENT_LABELS: Record<string, string> = {
  CASH: "Cash", CARD: "Card", CHEQUE: "Cheque",
  BANK_TRANSFER: "Bank transfer", DIGITAL_WALLET: "Digital wallet",
  INSURANCE: "Insurance", PACKAGE_DEDUCTION: "Package",
};
const EXPENSE_LABELS: Record<string, string> = {
  SALARY: "Salary", SALARY_ADVANCE: "Salary advance",
  OFFICE_EXPENSE: "Office expense", CONSUMABLES: "Consumables",
  MAINTENANCE: "Maintenance", UTILITIES: "Utilities",
  REFUND_OUT: "Refund out", OTHER: "Other",
};

function navigateMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function fmtMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-PK", {
    month: "long", year: "numeric", timeZone: CLINIC_TZ,
  });
}

function fmtDay(d: string): string {
  return new Date(d + "T00:00:00").toLocaleDateString("en-PK", {
    weekday: "short", day: "numeric", month: "short", timeZone: CLINIC_TZ,
  });
}

export default function MonthlyReportPage() {
  const access = useModuleAccess("MOD-BILLING");

  const [month, setMonth] = useState(getClinicToday().slice(0, 7));
  // Empty string = "all branches" — same default as the daily report.
  const [branchId, setBranchId] = useState("");
  const [report, setReport] = useState<MonthlyReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: branchesRes } = useBranches();
  const branches = (branchesRes?.data || []) as Array<{ id: string; name: string; isActive: boolean }>;

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(null);
    const params: Record<string, string> = { month };
    if (branchId) params.branchId = branchId;
    api.billing.reports
      .monthly(params)
      .then((r) => {
        if (cancelled) return;
        const res = r as { success?: boolean; data?: MonthlyReport; error?: string };
        if (!res.success) throw new Error(res.error || "Failed to load");
        setReport(res.data || null);
      })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [month, branchId]);

  const exportMonthCSV = () => {
    if (!report) return;
    const rows = report.perDay.map((d) => ({
      Date: d.date,
      Status: d.source === "closing" ? "Closed" : "Live",
      Invoices: d.invoiceCount,
      "Gross Sale": d.grossSale.toFixed(2),
      Discount: d.totalDiscount.toFixed(2),
      Tax: d.totalTax.toFixed(2),
      "Net Sale": d.netSale.toFixed(2),
      Payments: d.paymentCount,
      "Total Payments": d.totalPayments.toFixed(2),
      "Cash Receipts": d.cashReceipts.toFixed(2),
      "Petty Cash": d.totalExpenses.toFixed(2),
      "Difference (over/short)": d.difference != null ? d.difference.toFixed(2) : "",
    }));
    if (rows.length === 0) return;
    downloadCSV(rows, `monthly-report`, month);
  };

  if (!access.canView) {
    return (
      <div className="flex items-center justify-center py-20 text-stone-500">
        You don&apos;t have access to this module.
      </div>
    );
  }

  return (
    <div className="space-y-5 sm:space-y-6 animate-fade-in">
      {/* ===== HERO ===== */}
      <div className="relative overflow-hidden rounded-2xl border border-stone-100 bg-gradient-to-br from-violet-600 via-purple-600 to-fuchsia-600 px-5 py-5 sm:px-7 sm:py-6 text-white">
        <div className="absolute inset-0 opacity-25 [background:radial-gradient(circle_at_30%_30%,#fff_0,transparent_45%)]" />
        <div className="relative flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <Link href="/billing/reports" className="inline-flex items-center gap-1 text-[11px] uppercase tracking-wider font-semibold opacity-90 hover:opacity-100">
                <ArrowLeft className="w-3 h-3" /> Daily report
              </Link>
              <span className="opacity-60">/</span>
              <span className="text-[11px] uppercase tracking-wider font-semibold opacity-90">Monthly</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-semibold leading-tight">{fmtMonth(month)} — month at a glance</h1>
            <p className="text-sm opacity-90 mt-1 max-w-xl">
              Sales, payments, and expenses rolled up by day. Closed days are frozen; live days update as new entries land.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Link href="/billing/reports" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-white/15 border border-white/30 text-white hover:bg-white/25">
              <CalendarDays className="w-3.5 h-3.5" /> Today
            </Link>
          </div>
        </div>
      </div>

      {/* ===== CONTROLS ===== */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1 bg-white rounded-xl border border-stone-200 p-1">
          <button onClick={() => setMonth(navigateMonth(month, -1))} className="p-2 rounded-lg hover:bg-stone-100 cursor-pointer">
            <ChevronLeft className="w-4 h-4 text-stone-500" />
          </button>
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="px-2 py-1.5 text-sm font-medium text-stone-900 bg-transparent border-none outline-none cursor-pointer"
          />
          <button onClick={() => setMonth(navigateMonth(month, 1))} className="p-2 rounded-lg hover:bg-stone-100 cursor-pointer">
            <ChevronRight className="w-4 h-4 text-stone-500" />
          </button>
        </div>

        <Select
          value={branchId}
          onChange={(e) => setBranchId(e.target.value)}
          options={[
            { value: "", label: "All branches" },
            ...branches.filter((b) => b.isActive).map((b) => ({ value: b.id, label: b.name })),
          ]}
        />
        {!branchId && branches.length > 1 && (
          <span className="text-xs text-stone-500 italic">Aggregated across all branches.</span>
        )}

        <div className="flex-1" />

        <Button variant="outline" size="sm" iconLeft={<Download className="w-3.5 h-3.5" />} onClick={exportMonthCSV} disabled={!report || report.perDay.length === 0}>
          Export month
        </Button>
      </div>

      {loading && <div className="flex items-center justify-center py-20"><LoadingSpinner size="lg" /></div>}
      {error && (
        <div className="px-4 py-3 rounded-2xl bg-red-50 border border-red-200 text-sm text-red-700 flex items-center gap-2">
          <AlertCircle className="w-4 h-4" /> {error}
        </div>
      )}

      {!loading && report && (
        <>
          {/* ===== TILES ===== */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <StatCard label="Gross sale" value={formatCurrency(report.monthTotals.grossSale)} icon={<TrendingUp className="w-5 h-5" />} color="primary" />
            <StatCard label="Net sale" value={formatCurrency(report.monthTotals.netSale)} icon={<Receipt className="w-5 h-5" />} color="success" />
            <StatCard label="Payments" value={formatCurrency(report.monthTotals.totalPayments)} icon={<Banknote className="w-5 h-5" />} color="info" />
            <StatCard label="Petty cash out" value={formatCurrency(report.monthTotals.totalExpenses)} icon={<TrendingDown className="w-5 h-5" />} color="warning" />
          </div>

          {/* ===== BREAKDOWNS ===== */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <BreakdownCard title="Payments by method" entries={Object.entries(report.paymentsByMethod)} labels={PAYMENT_LABELS} total={report.monthTotals.totalPayments} accent="emerald" empty="No payments." />
            <BreakdownCard title="Sales by category" entries={Object.entries(report.salesByCategory)} labels={{}} total={report.monthTotals.grossSale} accent="violet" empty="No sales." />
            <BreakdownCard title="Petty cash by category" entries={Object.entries(report.expensesByCategory)} labels={EXPENSE_LABELS} total={report.monthTotals.totalExpenses} accent="amber" empty="No expenses." />
          </div>

          {/* ===== PER-DAY TABLE ===== */}
          <Card padding="lg">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <div>
                <h2 className="text-base font-semibold text-stone-900">
                  Daily breakdown ({report.perDay.length} day{report.perDay.length === 1 ? "" : "s"})
                </h2>
                <p className="text-xs text-stone-500 mt-0.5">
                  {report.closedDays.length} closed · {report.perDay.length - report.closedDays.length} live
                </p>
              </div>
            </div>
            {report.perDay.length === 0 ? (
              <div className="text-center py-8 text-sm text-stone-400">No activity this month yet.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs text-stone-500 uppercase tracking-wider">
                    <tr className="border-b border-stone-100">
                      <th className="text-left py-2 px-2 font-medium">Date</th>
                      <th className="text-left py-2 px-2 font-medium">Status</th>
                      <th className="text-right py-2 px-2 font-medium">Invoices</th>
                      <th className="text-right py-2 px-2 font-medium">Gross</th>
                      <th className="text-right py-2 px-2 font-medium">Discount</th>
                      <th className="text-right py-2 px-2 font-medium">Net</th>
                      <th className="text-right py-2 px-2 font-medium">Cash</th>
                      <th className="text-right py-2 px-2 font-medium">Payments</th>
                      <th className="text-right py-2 px-2 font-medium">Petty cash</th>
                      <th className="text-right py-2 px-2 font-medium">Diff.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.perDay.map((d) => (
                      <tr key={d.date} className="border-b border-stone-50 last:border-b-0 hover:bg-stone-50/50">
                        <td className="py-2 px-2">
                          <Link href={`/billing/reports?date=${d.date}`} className="font-medium text-stone-900 hover:text-emerald-600">
                            {fmtDay(d.date)}
                          </Link>
                        </td>
                        <td className="py-2 px-2">
                          {d.source === "closing" ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded-full">
                              <CheckCircle2 className="w-3 h-3" /> Closed
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-stone-500 bg-stone-100 px-1.5 py-0.5 rounded-full">Live</span>
                          )}
                        </td>
                        <td className="py-2 px-2 text-right text-stone-500">{d.invoiceCount}</td>
                        <td className="py-2 px-2 text-right text-stone-900">{formatCurrency(d.grossSale)}</td>
                        <td className="py-2 px-2 text-right text-red-600">−{formatCurrency(d.totalDiscount)}</td>
                        <td className="py-2 px-2 text-right font-semibold text-stone-900">{formatCurrency(d.netSale)}</td>
                        <td className="py-2 px-2 text-right text-stone-700">{formatCurrency(d.cashReceipts)}</td>
                        <td className="py-2 px-2 text-right text-stone-900">{formatCurrency(d.totalPayments)}</td>
                        <td className="py-2 px-2 text-right text-amber-700">{formatCurrency(d.totalExpenses)}</td>
                        <td className="py-2 px-2 text-right">
                          {d.difference == null ? (
                            <span className="text-stone-300">—</span>
                          ) : Math.abs(d.difference) < 0.01 ? (
                            <span className="text-emerald-600">0</span>
                          ) : (
                            <span className={d.difference > 0 ? "text-blue-600" : "text-amber-700"}>
                              {d.difference > 0 ? "+" : ""}{formatCurrency(d.difference)}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-stone-200 font-semibold">
                      <td className="py-2 px-2 text-stone-900">Total</td>
                      <td className="py-2 px-2" />
                      <td className="py-2 px-2 text-right text-stone-500">{report.monthTotals.invoiceCount}</td>
                      <td className="py-2 px-2 text-right text-stone-900">{formatCurrency(report.monthTotals.grossSale)}</td>
                      <td className="py-2 px-2 text-right text-red-600">−{formatCurrency(report.monthTotals.totalDiscount)}</td>
                      <td className="py-2 px-2 text-right text-stone-900">{formatCurrency(report.monthTotals.netSale)}</td>
                      <td className="py-2 px-2 text-right text-stone-700">{formatCurrency(report.monthTotals.cashReceipts)}</td>
                      <td className="py-2 px-2 text-right text-stone-900">{formatCurrency(report.monthTotals.totalPayments)}</td>
                      <td className="py-2 px-2 text-right text-amber-700">{formatCurrency(report.monthTotals.totalExpenses)}</td>
                      <td className="py-2 px-2" />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </Card>

          <div className="flex items-center justify-between text-xs text-stone-500">
            <Link href="/billing/reports" className="inline-flex items-center gap-1 hover:text-stone-700 cursor-pointer">
              <History className="w-3.5 h-3.5" /> Back to today&apos;s daily report
            </Link>
          </div>
        </>
      )}
    </div>
  );
}

function BreakdownCard({
  title, entries, labels, total, accent, empty,
}: {
  title: string;
  entries: Array<[string, number]>;
  labels: Record<string, string>;
  total: number;
  accent: "emerald" | "violet" | "amber";
  empty: string;
}) {
  const sorted = [...entries].sort((a, b) => b[1] - a[1]);
  const accentClass =
    accent === "emerald" ? "bg-emerald-500" :
    accent === "violet" ? "bg-violet-500" : "bg-amber-500";
  return (
    <Card padding="lg">
      <h2 className="text-sm font-semibold text-stone-900 mb-3">{title}</h2>
      {sorted.length === 0 ? (
        <p className="text-sm text-stone-400 py-4 text-center">{empty}</p>
      ) : (
        <div className="space-y-2">
          {sorted.map(([k, v]) => {
            const pct = total > 0 ? (v / total) * 100 : 0;
            return (
              <div key={k}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-stone-700 font-medium">{labels[k] || k}</span>
                  <span className="text-stone-900 font-semibold">{formatCurrency(v)}</span>
                </div>
                <div className="h-1.5 bg-stone-100 rounded-full overflow-hidden">
                  <div className={`h-full ${accentClass}`} style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
