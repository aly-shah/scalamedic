"use client";

/**
 * Daily Billing & Accounts Report
 *
 * Modeled after the SkedWise Daily Sheet + Cash Register reports the
 * client showed me. Combines:
 *   - Per-invoice itemization (with line items, payment methods, taxes)
 *   - Sales by category (Services / Products / etc — driven by
 *     Treatment.category on each invoice line)
 *   - Payments by method (CASH / CARD / etc — across ALL payments
 *     processed today, even those against older invoices)
 *   - Petty cash / till disbursements for the day
 *   - Cash reconciliation: opening + cash receipts − petty cash
 *
 * Pre-close: the report is computed live from raw rows.
 * Post-close: the saved snapshot is the source of truth.
 *
 * "Close day" freezes the snapshot so re-opening the same date weeks
 * later still shows the same numbers.
 */
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft, Receipt, Download, ChevronLeft, ChevronRight,
  Lock, CheckCircle2, AlertCircle, Plus, Trash2, Loader2, FileText,
  CalendarDays, Banknote, TrendingUp, TrendingDown, History, Printer,
} from "lucide-react";
import { Button, Badge, Card, StatCard, Input, Select } from "@/components/ui";
import { Textarea } from "@/components/ui/textarea";
import { Modal } from "@/components/ui/modal";
import { DatePicker } from "@/components/ui/date-picker";
import { LoadingSpinner } from "@/components/ui/loading";
import { useBranches } from "@/hooks/use-queries";
import { useAuth } from "@/lib/auth-context";
import { useModuleAccess } from "@/modules/core/hooks";
import {
  formatCurrency, getClinicToday, toClinicDay, CLINIC_TZ,
} from "@/lib/utils";
import { downloadCSV } from "@/lib/export";
import { api } from "@/lib/api";

// ── Types ────────────────────────────────────────────────────────
type DailyReport = {
  date: string;
  branchId: string;
  invoices: Array<{
    id: string; invoiceNumber: string; createdAt: string; status: string;
    branch: { id: string; name: string; code: string } | null;
    patient: { firstName: string; lastName: string; patientCode: string; phone: string | null };
    doctor: { id: string; name: string } | null;
    appointmentCode: string | null;
    subtotal: number | string; discount: number | string; tax: number | string;
    total: number | string; amountPaid: number | string; balanceDue: number | string;
    createdBy: { name: string } | null;
    items: Array<{ id: string; name: string; category: string; quantity: number; unitPrice: number | string; discount: number | string; tax: number | string; total: number | string }>;
    payments: Array<{ id: string; amount: number | string; method: string; reference: string | null; status: string; processedAt: string | null; processedBy: { name: string } | null }>;
  }>;
  paymentsToday: Array<{
    id: string; processedAt: string | null; amount: number | string; method: string;
    reference: string | null; status: string;
    invoiceNumber: string; invoiceTotal: number | string;
    patient: { firstName: string; lastName: string; patientCode: string };
    doctor: { id: string; name: string } | null;
    processedBy: { name: string } | null;
  }>;
  expenses: Array<{
    id: string; date: string; category: string; description: string;
    paidTo: string | null; amount: number | string; notes: string | null;
    recordedBy: { name: string } | null;
  }>;
  salesByCategory: Record<string, number>;
  paymentsByMethod: Record<string, number>;
  expensesByCategory: Record<string, number>;
  totals: {
    invoiceCount: number; paymentCount: number; expenseCount: number;
    grossSale: number; netSale: number; totalDiscount: number; totalTax: number;
    totalPayments: number; totalExpenses: number; cashReceipts: number;
    opening: number; expectedCash: number;
  };
  closing: null | {
    id: string; openingTill: number | string; cashCounted: number | string;
    denominations: Record<string, number> | null;
    expectedCash: number | string; difference: number | string;
    remarks: string | null;
    closedBy: { name: string } | null; closedAt: string;
    isClosed: true;
  };
  hints?: {
    previousClosingCashCounted: number | null;
    previousClosingDate: string | null;
    previousActiveDate: string | null;
    nextActiveDate: string | null;
    isEmpty: boolean;
  };
};

const DENOMS = [5000, 1000, 500, 100, 75, 50, 20, 10, 5, 1] as const;

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

const num = (v: unknown): number => {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "string") { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; }
  return 0;
};

const fmtTime = (iso: string | null) => {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("en-PK", {
    timeZone: CLINIC_TZ, hour: "2-digit", minute: "2-digit", hour12: false,
  });
};

const navigateDate = (date: string, delta: number): string => {
  const d = new Date(date + "T00:00:00");
  d.setDate(d.getDate() + delta);
  return toClinicDay(d);
};

export default function BillingReportsPage() {
  const access = useModuleAccess("MOD-BILLING");
  const { user } = useAuth();
  const isAdminOrBilling = !!user && ["SUPER_ADMIN", "ADMIN", "BILLING"].includes(user.role);

  const [date, setDate] = useState(getClinicToday());
  // Empty string = "all branches" — surfaces work done at branches the
  // logged-in user isn't assigned to. Receptionists at one branch
  // routinely need to see what their colleagues at another branch
  // billed (e.g. Clifton reception checking on Phase 8 numbers).
  const [branchId, setBranchId] = useState<string>("");
  const [report, setReport] = useState<DailyReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  const { data: branchesRes } = useBranches();
  const branches = (branchesRes?.data || []) as Array<{ id: string; name: string; isActive: boolean }>;

  // No auto-default for branch — start in "all branches" mode. The
  // user can narrow via the picker. Closing-day flow forces a specific
  // branch (you can only close one till at a time), enforced lower down.

  // Fetch the report whenever date / branch / refresh tick changes.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const params: Record<string, string> = { date };
    if (branchId) params.branchId = branchId;
    api.billing.reports
      .daily(params)
      .then((r) => {
        if (cancelled) return;
        const res = r as { success?: boolean; data?: DailyReport; error?: string };
        if (!res.success) throw new Error(res.error || "Failed to load");
        setReport(res.data || null);
      })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [date, branchId, refreshTick]);

  // ── Petty cash modal state ────────────────────────────────────
  const [pcOpen, setPcOpen] = useState(false);
  // ── Close day modal state ─────────────────────────────────────
  const [closeOpen, setCloseOpen] = useState(false);

  const isClosed = !!report?.closing;
  const isToday = date === getClinicToday();

  if (!access.canView) {
    return (
      <div className="flex items-center justify-center py-20 text-stone-500">
        You don&apos;t have access to this module.
      </div>
    );
  }

  // ── CSV exports ──────────────────────────────────────────────
  const exportInvoicesCSV = () => {
    if (!report) return;
    const rows = report.invoices.flatMap((inv) => {
      const methods = Array.from(new Set(
        inv.payments.filter((p) => p.status === "COMPLETED").map((p) => p.method)
      ));
      const methodText = methods.map((m) => PAYMENT_LABELS[m] || m).join(" + ") || "";
      return inv.items.map((it) => ({
        Time: fmtTime(inv.createdAt),
        Invoice: inv.invoiceNumber,
        "Patient Code": inv.patient.patientCode,
        Patient: `${inv.patient.firstName} ${inv.patient.lastName}`.trim(),
        Doctor: inv.doctor?.name || "",
        "Service Category": it.category,
        Service: it.name,
        Qty: it.quantity,
        "Unit Price": num(it.unitPrice).toFixed(2),
        Discount: num(it.discount).toFixed(2),
        Tax: num(it.tax).toFixed(2),
        "Line Total": num(it.total).toFixed(2),
        "Invoice Total": num(inv.total).toFixed(2),
        "Payment Method": methodText,
        Status: inv.status,
      }));
    });
    if (rows.length === 0) return;
    downloadCSV(rows, `invoice-detail`, date);
  };

  const exportPaymentsCSV = () => {
    if (!report) return;
    const rows = report.paymentsToday.map((p) => ({
      Time: fmtTime(p.processedAt),
      Invoice: p.invoiceNumber,
      "Patient Code": p.patient.patientCode,
      Patient: `${p.patient.firstName} ${p.patient.lastName}`.trim(),
      Doctor: p.doctor?.name || "",
      Method: PAYMENT_LABELS[p.method] || p.method,
      Reference: p.reference || "",
      Amount: num(p.amount).toFixed(2),
      Status: p.status,
      "Processed By": p.processedBy?.name || "",
    }));
    if (rows.length === 0) return;
    downloadCSV(rows, `payments`, date);
  };

  const exportExpensesCSV = () => {
    if (!report) return;
    const rows = report.expenses.map((e) => ({
      Date: e.date.slice(0, 10),
      Category: EXPENSE_LABELS[e.category] || e.category,
      Description: e.description,
      "Paid To": e.paidTo || "",
      Amount: num(e.amount).toFixed(2),
      "Recorded By": e.recordedBy?.name || "",
      Notes: e.notes || "",
    }));
    if (rows.length === 0) return;
    downloadCSV(rows, `petty-cash`, date);
  };

  return (
    <div className="space-y-5 sm:space-y-6 animate-fade-in">
      {/* ===== HERO ===== */}
      <div className="relative overflow-hidden rounded-2xl border border-stone-100 bg-gradient-to-br from-emerald-600 via-green-600 to-teal-600 px-5 py-5 sm:px-7 sm:py-6 text-white">
        <div className="absolute inset-0 opacity-25 [background:radial-gradient(circle_at_30%_30%,#fff_0,transparent_45%)]" />
        <div className="relative flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <Link href="/billing" className="inline-flex items-center gap-1 text-[11px] uppercase tracking-wider font-semibold opacity-90 hover:opacity-100">
                <ArrowLeft className="w-3 h-3" /> Billing
              </Link>
              <span className="opacity-60">/</span>
              <span className="text-[11px] uppercase tracking-wider font-semibold opacity-90">Daily report</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-semibold leading-tight">End-of-day cash, sales, and reconciliation.</h1>
            <p className="text-sm opacity-90 mt-1 max-w-xl">
              Per-invoice detail, payments by method, petty cash, and the till count for the day.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => {
                const q = new URLSearchParams({ date });
                if (branchId) q.set("branchId", branchId);
                window.open(
                  `/billing/reports/print?${q.toString()}`,
                  "_blank",
                  "width=900,height=900,noopener=yes",
                );
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-white text-emerald-700 hover:bg-stone-50 cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" /> Print / PDF
            </button>
            <Link
              href="/billing/reports/monthly"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-white/15 border border-white/30 text-white hover:bg-white/25"
            >
              <CalendarDays className="w-3.5 h-3.5" /> Monthly
            </Link>
          </div>
        </div>
      </div>

      {/* ===== CONTROLS ===== */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1 bg-white rounded-xl border border-stone-200 p-1">
          <button onClick={() => setDate(navigateDate(date, -1))} className="p-2 rounded-lg hover:bg-stone-100 cursor-pointer">
            <ChevronLeft className="w-4 h-4 text-stone-500" />
          </button>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="px-2 py-1.5 text-sm font-medium text-stone-900 bg-transparent border-none outline-none cursor-pointer"
          />
          <button onClick={() => setDate(navigateDate(date, 1))} className="p-2 rounded-lg hover:bg-stone-100 cursor-pointer">
            <ChevronRight className="w-4 h-4 text-stone-500" />
          </button>
          {!isToday && (
            <button onClick={() => setDate(getClinicToday())} className="px-2 py-1 text-xs font-medium text-emerald-600 hover:bg-emerald-50 rounded-lg cursor-pointer">
              Today
            </button>
          )}
        </div>

        <Select
          value={branchId}
          onChange={(e) => setBranchId(e.target.value)}
          options={[
            { value: "", label: "All branches" },
            ...branches.filter((b) => b.isActive).map((b) => ({ value: b.id, label: b.name })),
          ]}
        />

        <div className="flex-1" />

        <div className="flex items-center gap-2 flex-wrap">
          {!isClosed && branchId && (
            <Button
              variant="outline"
              size="sm"
              iconLeft={<Plus className="w-3.5 h-3.5" />}
              onClick={() => setPcOpen(true)}
              disabled={!isAdminOrBilling && user?.role !== "RECEPTIONIST"}
            >
              Add petty cash
            </Button>
          )}
          {!isClosed && branchId && isAdminOrBilling && (
            <Button
              size="sm"
              iconLeft={<Lock className="w-3.5 h-3.5" />}
              onClick={() => setCloseOpen(true)}
              disabled={!report}
            >
              Close day
            </Button>
          )}
          {!branchId && (
            <span className="text-xs text-stone-500 italic">
              Pick a branch to add petty cash or close the day.
            </span>
          )}
          {isClosed && (
            <Badge variant="success" dot>
              <span className="inline-flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Closed</span>
            </Badge>
          )}
        </div>
      </div>

      {/* ===== CLOSED BANNER ===== */}
      {isClosed && report?.closing && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 text-sm text-emerald-900">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-medium">
                Day closed by {report.closing.closedBy?.name || "—"} on{" "}
                {new Date(report.closing.closedAt).toLocaleString("en-PK", { timeZone: CLINIC_TZ })}
              </p>
              {report.closing.remarks && (
                <p className="mt-1 text-emerald-800">{report.closing.remarks}</p>
              )}
              <p className="text-xs mt-1.5 text-emerald-700">
                Numbers below are frozen from the snapshot — edits to invoices since then aren&apos;t reflected.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ===== LOADING / ERROR ===== */}
      {loading && (
        <div className="flex items-center justify-center py-20"><LoadingSpinner size="lg" /></div>
      )}
      {error && (
        <div className="px-4 py-3 rounded-2xl bg-red-50 border border-red-200 text-sm text-red-700 flex items-center gap-2">
          <AlertCircle className="w-4 h-4" /> {error}
        </div>
      )}

      {!loading && report && report.hints?.isEmpty && (report.hints.previousActiveDate || report.hints.nextActiveDate) && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-sm text-amber-900 flex items-center gap-3 flex-wrap">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <div className="flex-1">
            <p className="font-medium">No activity on this date{branchId ? " for this branch" : ""}.</p>
            <p className="text-xs text-amber-800 mt-0.5">
              Try the date picker above to navigate to a day with invoices, payments, or petty cash entries.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {report.hints.previousActiveDate && (
              <button
                onClick={() => setDate(report.hints!.previousActiveDate!)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-600 text-white hover:bg-amber-700 cursor-pointer"
              >
                Previous active: {report.hints.previousActiveDate}
              </button>
            )}
            {report.hints.nextActiveDate && (
              <button
                onClick={() => setDate(report.hints!.nextActiveDate!)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-100 text-amber-800 hover:bg-amber-200 cursor-pointer"
              >
                Next active: {report.hints.nextActiveDate}
              </button>
            )}
          </div>
        </div>
      )}

      {!loading && report && (
        <>
          {/* ===== TOP-LEVEL TILES ===== */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <StatCard
              label="Gross sale"
              value={formatCurrency(report.totals.grossSale)}
              icon={<TrendingUp className="w-5 h-5" />}
              color="primary"
            />
            <StatCard
              label="Net sale"
              value={formatCurrency(report.totals.netSale)}
              icon={<Receipt className="w-5 h-5" />}
              color="success"
            />
            <StatCard
              label="Payments received"
              value={formatCurrency(report.totals.totalPayments)}
              icon={<Banknote className="w-5 h-5" />}
              color="info"
            />
            <StatCard
              label="Petty cash out"
              value={formatCurrency(report.totals.totalExpenses)}
              icon={<TrendingDown className="w-5 h-5" />}
              color="warning"
            />
          </div>

          {/* ===== PAYMENT METHOD STRIP =====
              Sits right under the headline tiles so end-of-day cash vs bank
              splits are visible without scrolling. Always shows Cash / Card /
              Cheque / Digital Wallet at minimum even when 0, since "what's
              in the till" and "what's on the card terminal" are the two
              numbers reception reconciles against every evening. */}
          <Card padding="lg">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="text-base font-semibold text-stone-900">Payments received — by method</h2>
                <p className="text-xs text-stone-500 mt-0.5">
                  What you have on hand vs what went to the bank.
                </p>
              </div>
              <p className="text-sm font-semibold text-stone-900">
                Total {formatCurrency(report.totals.totalPayments)}
              </p>
            </div>
            {(() => {
              // Always show these 5 methods so reception sees a stable
              // line-up at end-of-day. Any extras (PACKAGE_DEDUCTION,
              // INSURANCE) show only when used.
              const ALWAYS = ["CASH", "CARD", "CHEQUE", "DIGITAL_WALLET", "BANK_TRANSFER"];
              const allMethods = Array.from(new Set([...ALWAYS, ...Object.keys(report.paymentsByMethod)]));
              return (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                  {allMethods.map((m) => {
                    const v = report.paymentsByMethod[m] || 0;
                    const isCash = m === "CASH";
                    return (
                      <div
                        key={m}
                        className={`rounded-xl border px-3 py-2.5 ${
                          v > 0
                            ? isCash
                              ? "bg-amber-50 border-amber-200"
                              : "bg-emerald-50 border-emerald-200"
                            : "bg-stone-50/50 border-stone-100"
                        }`}
                      >
                        <p className="text-[10px] uppercase tracking-wider font-semibold text-stone-500">
                          {PAYMENT_LABELS[m] || m}
                        </p>
                        <p className={`mt-0.5 text-base font-semibold ${
                          v > 0 ? "text-stone-900" : "text-stone-400"
                        }`}>
                          {formatCurrency(v)}
                        </p>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </Card>

          {/* ===== SALES BY CATEGORY =====
              Payment-method breakdown moved up to its own strip above
              (the most-checked figure for end-of-day reconciliation),
              so this card only shows sales-by-treatment-category now. */}
          <BreakdownCard
            title="Sales by category"
            entries={Object.entries(report.salesByCategory)}
            labels={{}}
            total={report.totals.grossSale}
            accent="violet"
            empty="No invoices billed yet."
          />

          {/* ===== CASH RECONCILIATION ===== */}
          <Card padding="lg">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base font-semibold text-stone-900">Cash reconciliation</h2>
                <p className="text-xs text-stone-500 mt-0.5">
                  Opening + cash receipts − petty cash = expected cash
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
              <ReconRow label="Opening till" value={report.totals.opening} />
              <ReconRow label="Cash received" value={report.totals.cashReceipts} positive />
              <ReconRow label="Petty cash out" value={report.totals.totalExpenses} negative />
              <ReconRow label="Expected in drawer" value={report.totals.expectedCash} bold />
            </div>
            {isClosed && report.closing && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4 mt-4 pt-4 border-t border-stone-100">
                <ReconRow label="Counted in drawer" value={num(report.closing.cashCounted)} bold />
                <ReconRow
                  label="Difference"
                  value={num(report.closing.difference)}
                  positive={num(report.closing.difference) > 0}
                  negative={num(report.closing.difference) < 0}
                  bold
                />
              </div>
            )}
          </Card>

          {/* ===== INVOICES TABLE ===== */}
          <Card padding="lg">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <div>
                <h2 className="text-base font-semibold text-stone-900">
                  Invoices billed today ({report.invoices.length})
                </h2>
                <p className="text-xs text-stone-500 mt-0.5">
                  Each row expands to show service line items.
                </p>
              </div>
              <Button variant="outline" size="sm" iconLeft={<Download className="w-3.5 h-3.5" />} onClick={exportInvoicesCSV} disabled={report.invoices.length === 0}>
                Export detail
              </Button>
            </div>
            {report.invoices.length === 0 ? (
              <div className="text-center py-8 text-sm text-stone-400">No invoices billed on this day.</div>
            ) : (
              <div className="space-y-2">
                {report.invoices.map((inv) => (
                  <InvoiceRow key={inv.id} inv={inv} showBranch={!branchId} />
                ))}
              </div>
            )}
          </Card>

          {/* ===== PAYMENTS TODAY ===== */}
          <Card padding="lg">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <div>
                <h2 className="text-base font-semibold text-stone-900">
                  Payments processed today ({report.paymentsToday.length})
                </h2>
                <p className="text-xs text-stone-500 mt-0.5">
                  All payments — including those collected against invoices billed earlier.
                </p>
              </div>
              <Button variant="outline" size="sm" iconLeft={<Download className="w-3.5 h-3.5" />} onClick={exportPaymentsCSV} disabled={report.paymentsToday.length === 0}>
                Export payments
              </Button>
            </div>
            {report.paymentsToday.length === 0 ? (
              <div className="text-center py-8 text-sm text-stone-400">No payments processed yet.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs text-stone-500 uppercase tracking-wider">
                    <tr className="border-b border-stone-100">
                      <th className="text-left py-2 px-2 font-medium">Time</th>
                      <th className="text-left py-2 px-2 font-medium">Invoice</th>
                      <th className="text-left py-2 px-2 font-medium">Patient</th>
                      <th className="text-left py-2 px-2 font-medium">Doctor</th>
                      <th className="text-left py-2 px-2 font-medium">Method</th>
                      <th className="text-left py-2 px-2 font-medium">Reference</th>
                      <th className="text-right py-2 px-2 font-medium">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.paymentsToday.map((p) => (
                      <tr key={p.id} className="border-b border-stone-50 last:border-b-0">
                        <td className="py-2 px-2 text-stone-500">{fmtTime(p.processedAt)}</td>
                        <td className="py-2 px-2 font-medium text-stone-900">{p.invoiceNumber}</td>
                        <td className="py-2 px-2 text-stone-700">
                          {p.patient.firstName} {p.patient.lastName}
                        </td>
                        <td className="py-2 px-2 text-stone-500">{p.doctor?.name || "—"}</td>
                        <td className="py-2 px-2">
                          <Badge variant={p.method === "CASH" ? "warning" : "info"}>
                            {PAYMENT_LABELS[p.method] || p.method}
                          </Badge>
                        </td>
                        <td className="py-2 px-2 text-xs text-stone-500">{p.reference || "—"}</td>
                        <td className="py-2 px-2 text-right font-semibold text-stone-900">
                          {formatCurrency(num(p.amount))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {/* ===== PETTY CASH ===== */}
          <Card padding="lg">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <div>
                <h2 className="text-base font-semibold text-stone-900">
                  Petty cash / till disbursements ({report.expenses.length})
                </h2>
                <p className="text-xs text-stone-500 mt-0.5">
                  Cash paid out of the till for salaries, supplies, refunds, etc.
                </p>
              </div>
              <Button variant="outline" size="sm" iconLeft={<Download className="w-3.5 h-3.5" />} onClick={exportExpensesCSV} disabled={report.expenses.length === 0}>
                Export petty cash
              </Button>
            </div>
            {report.expenses.length === 0 ? (
              <div className="text-center py-8 text-sm text-stone-400">No petty cash logged.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs text-stone-500 uppercase tracking-wider">
                    <tr className="border-b border-stone-100">
                      <th className="text-left py-2 px-2 font-medium">Category</th>
                      <th className="text-left py-2 px-2 font-medium">Description</th>
                      <th className="text-left py-2 px-2 font-medium">Paid to</th>
                      <th className="text-right py-2 px-2 font-medium">Amount</th>
                      <th className="text-left py-2 px-2 font-medium">By</th>
                      {!isClosed && <th className="py-2 px-2 w-8" />}
                    </tr>
                  </thead>
                  <tbody>
                    {report.expenses.map((e) => (
                      <tr key={e.id} className="border-b border-stone-50 last:border-b-0">
                        <td className="py-2 px-2">
                          <Badge variant="warning">{EXPENSE_LABELS[e.category] || e.category}</Badge>
                        </td>
                        <td className="py-2 px-2 text-stone-700">{e.description}</td>
                        <td className="py-2 px-2 text-stone-500">{e.paidTo || "—"}</td>
                        <td className="py-2 px-2 text-right font-semibold text-stone-900">
                          {formatCurrency(num(e.amount))}
                        </td>
                        <td className="py-2 px-2 text-xs text-stone-500">{e.recordedBy?.name || "—"}</td>
                        {!isClosed && (
                          <td className="py-2 px-2 text-right">
                            <button
                              onClick={async () => {
                                if (!confirm(`Delete this petty cash entry?\n\n${e.description} — ${formatCurrency(num(e.amount))}`)) return;
                                try {
                                  await api.billing.pettyCash.remove(e.id);
                                  setRefreshTick((t) => t + 1);
                                } catch (err) {
                                  alert(err instanceof Error ? err.message : "Failed to delete");
                                }
                              }}
                              className="text-stone-400 hover:text-red-600 cursor-pointer"
                              title="Delete"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {/* ===== HISTORY LINK ===== */}
          <div className="flex items-center justify-between text-xs text-stone-500">
            <Link href="/billing/reports/monthly" className="inline-flex items-center gap-1 hover:text-stone-700 cursor-pointer">
              <History className="w-3.5 h-3.5" /> View monthly report &amp; past closings
            </Link>
          </div>
        </>
      )}

      {/* ===== MODALS ===== */}
      <PettyCashModal
        isOpen={pcOpen}
        onClose={() => setPcOpen(false)}
        date={date}
        branchId={branchId}
        onSaved={() => { setPcOpen(false); setRefreshTick((t) => t + 1); }}
      />
      <CloseDayModal
        isOpen={closeOpen}
        onClose={() => setCloseOpen(false)}
        report={report}
        date={date}
        branchId={branchId}
        onClosed={() => { setCloseOpen(false); setRefreshTick((t) => t + 1); }}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────

function ReconRow({
  label, value, positive, negative, bold,
}: { label: string; value: number; positive?: boolean; negative?: boolean; bold?: boolean }) {
  const tone = positive ? "text-emerald-600" : negative ? "text-red-600" : "text-stone-900";
  return (
    <div className="bg-stone-50/60 rounded-xl p-3 border border-stone-100">
      <p className="text-[10px] uppercase tracking-wider font-medium text-stone-400">{label}</p>
      <p className={`mt-1 ${bold ? "text-base font-semibold" : "text-sm"} ${tone}`}>
        {formatCurrency(value)}
      </p>
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
  accent: "emerald" | "violet";
  empty: string;
}) {
  const sorted = [...entries].sort((a, b) => b[1] - a[1]);
  const accentClass = accent === "emerald" ? "bg-emerald-500" : "bg-violet-500";
  return (
    <Card padding="lg">
      <h2 className="text-base font-semibold text-stone-900 mb-3">{title}</h2>
      {sorted.length === 0 ? (
        <p className="text-sm text-stone-400 py-4 text-center">{empty}</p>
      ) : (
        <div className="space-y-2.5">
          {sorted.map(([k, v]) => {
            const pct = total > 0 ? (v / total) * 100 : 0;
            return (
              <div key={k}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="text-stone-700 font-medium">{labels[k] || k}</span>
                  <span className="text-stone-900 font-semibold">{formatCurrency(v)}</span>
                </div>
                <div className="h-1.5 bg-stone-100 rounded-full overflow-hidden">
                  <div className={`h-full ${accentClass}`} style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
          <div className="pt-2 mt-2 border-t border-stone-100 flex items-center justify-between text-sm font-semibold">
            <span className="text-stone-500">Total</span>
            <span className="text-stone-900">{formatCurrency(total)}</span>
          </div>
        </div>
      )}
    </Card>
  );
}

function InvoiceRow({ inv, showBranch }: { inv: DailyReport["invoices"][number]; showBranch?: boolean }) {
  const [open, setOpen] = useState(false);
  // Distinct payment methods used on this invoice. An invoice can be
  // settled with a mix (e.g. partial cash + partial card), so we show
  // every method actually recorded — not just the first one.
  const methods = Array.from(new Set(inv.payments.filter((p) => p.status === "COMPLETED").map((p) => p.method)));
  return (
    <div className="border border-stone-100 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-stone-50 cursor-pointer"
      >
        <div className="text-xs font-medium text-stone-500 w-12 shrink-0">{fmtTime(inv.createdAt)}</div>
        <div className="text-sm font-semibold text-stone-900 w-24 shrink-0">{inv.invoiceNumber}</div>
        <div className="flex-1 min-w-0 text-left">
          <p className="text-sm text-stone-700 truncate">
            {inv.patient.firstName} {inv.patient.lastName}{" "}
            <span className="text-xs text-stone-400">· {inv.patient.patientCode}</span>
          </p>
          <p className="text-xs text-stone-500 truncate">
            {inv.doctor?.name || "—"}
            {showBranch && inv.branch && (
              <span className="ml-1.5 inline-block px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-violet-50 text-violet-700">
                {inv.branch.code || inv.branch.name}
              </span>
            )}
          </p>
        </div>
        <div className="hidden sm:flex items-center gap-1 shrink-0">
          {methods.length === 0 ? (
            <span className="text-[10px] text-stone-400 italic">unpaid</span>
          ) : (
            methods.map((m) => (
              <Badge key={m} variant={m === "CASH" ? "warning" : "info"}>
                {PAYMENT_LABELS[m] || m}
              </Badge>
            ))
          )}
        </div>
        <div className="text-right shrink-0">
          <p className="text-sm font-semibold text-stone-900">{formatCurrency(num(inv.total))}</p>
          {num(inv.balanceDue) > 0 && (
            <p className="text-[10px] text-amber-600 font-medium">
              {formatCurrency(num(inv.balanceDue))} due
            </p>
          )}
        </div>
        <Badge variant={inv.status === "PAID" ? "success" : inv.status === "PARTIAL" ? "warning" : "default"} className="shrink-0">
          {inv.status}
        </Badge>
      </button>
      {open && (
        <div className="bg-stone-50/50 px-4 py-3 border-t border-stone-100 space-y-3">
          {/* Items */}
          <div>
            <p className="text-[10px] uppercase font-semibold text-stone-400 mb-1.5">Services / items</p>
            <table className="w-full text-xs">
              <tbody>
                {inv.items.map((it) => (
                  <tr key={it.id} className="border-b border-stone-100 last:border-b-0">
                    <td className="py-1.5 pr-3">
                      <p className="text-stone-700">{it.name}</p>
                      <p className="text-[10px] text-stone-400">{it.category}</p>
                    </td>
                    <td className="py-1.5 px-3 text-right text-stone-500 w-12">×{it.quantity}</td>
                    <td className="py-1.5 px-3 text-right text-stone-500 w-24">{formatCurrency(num(it.unitPrice))}</td>
                    <td className="py-1.5 pl-3 text-right text-stone-900 font-medium w-24">{formatCurrency(num(it.total))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Payments */}
          {inv.payments.length > 0 && (
            <div>
              <p className="text-[10px] uppercase font-semibold text-stone-400 mb-1.5">Payments</p>
              <div className="space-y-1">
                {inv.payments.map((p) => (
                  <div key={p.id} className="flex items-center gap-2 text-xs">
                    <span className="text-stone-500 w-12">{fmtTime(p.processedAt)}</span>
                    <Badge variant={p.method === "CASH" ? "warning" : "info"}>
                      {PAYMENT_LABELS[p.method] || p.method}
                    </Badge>
                    {p.reference && <span className="text-stone-400">ref {p.reference}</span>}
                    <span className="flex-1" />
                    <span className="text-stone-900 font-medium">{formatCurrency(num(p.amount))}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {/* Totals strip */}
          <div className="flex items-center gap-4 pt-2 border-t border-stone-100 text-xs">
            <span className="text-stone-500">Subtotal: <span className="text-stone-900 font-medium">{formatCurrency(num(inv.subtotal))}</span></span>
            {num(inv.discount) > 0 && <span className="text-stone-500">Discount: <span className="text-red-600 font-medium">−{formatCurrency(num(inv.discount))}</span></span>}
            {num(inv.tax) > 0 && <span className="text-stone-500">Tax: <span className="text-stone-900 font-medium">{formatCurrency(num(inv.tax))}</span></span>}
            <span className="flex-1" />
            <span className="text-stone-500">Paid: <span className="text-emerald-600 font-medium">{formatCurrency(num(inv.amountPaid))}</span></span>
            <span className="text-stone-500">Total: <span className="text-stone-900 font-semibold">{formatCurrency(num(inv.total))}</span></span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// PettyCash + CloseDay modals
// ─────────────────────────────────────────────────────────────────

function PettyCashModal({
  isOpen, onClose, date, branchId, onSaved,
}: {
  isOpen: boolean; onClose: () => void; date: string; branchId: string;
  onSaved: () => void;
}) {
  const [category, setCategory] = useState<string>("OFFICE_EXPENSE");
  const [description, setDescription] = useState("");
  const [paidTo, setPaidTo] = useState("");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [seenOpen, setSeenOpen] = useState(false);
  if (isOpen !== seenOpen) {
    setSeenOpen(isOpen);
    if (isOpen) {
      setCategory("OFFICE_EXPENSE"); setDescription(""); setPaidTo("");
      setAmount(""); setNotes(""); setError(null); setBusy(false);
    }
  }

  async function submit() {
    if (!description.trim()) { setError("Description is required."); return; }
    const amt = parseFloat(amount);
    if (!Number.isFinite(amt) || amt <= 0) { setError("Amount must be a positive number."); return; }
    setBusy(true); setError(null);
    try {
      const res = await api.billing.pettyCash.create({
        branchId, date, category,
        description: description.trim(),
        paidTo: paidTo.trim() || undefined,
        amount: amt,
        notes: notes.trim() || undefined,
      }) as { success?: boolean; error?: string };
      if (!res.success) throw new Error(res.error || "Failed to save");
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
      setBusy(false);
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={busy ? () => {} : onClose}
      title="Add petty cash entry"
      subtitle={`Cash paid out of the till on ${date}`}
      size="md"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={busy} iconLeft={busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}>
            {busy ? "Saving…" : "Save entry"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Select
          label="Category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          options={Object.entries(EXPENSE_LABELS).map(([v, label]) => ({ value: v, label }))}
        />
        <Input
          label="Description"
          required
          placeholder="e.g. ali advance salary, printer ink"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Paid to (optional)"
            placeholder="Recipient name"
            value={paidTo}
            onChange={(e) => setPaidTo(e.target.value)}
          />
          <Input
            label="Amount (PKR)"
            required
            type="number"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>
        <Textarea
          label="Notes (optional)"
          rows={2}
          placeholder="Anything reception or accounts should know"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
        {error && (
          <div className="px-3 py-2 rounded-xl bg-red-50 border border-red-100 text-sm text-red-700">
            {error}
          </div>
        )}
      </div>
    </Modal>
  );
}

function CloseDayModal({
  isOpen, onClose, report, date, branchId, onClosed,
}: {
  isOpen: boolean; onClose: () => void; report: DailyReport | null;
  date: string; branchId: string; onClosed: () => void;
}) {
  const [opening, setOpening] = useState("0");
  const [denoms, setDenoms] = useState<Record<number, string>>({});
  const [remarks, setRemarks] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [seenOpen, setSeenOpen] = useState(false);
  if (isOpen !== seenOpen) {
    setSeenOpen(isOpen);
    if (isOpen) {
      // Pre-fill opening till from previous day's `cashCounted` (carry-
      // forward). Falls back to 0 if no prior closing exists yet.
      const carry = report?.hints?.previousClosingCashCounted;
      setOpening(carry != null ? String(carry) : "0");
      setDenoms({});
      setRemarks("");
      setError(null); setBusy(false);
    }
  }

  const counted = useMemo(() => {
    let s = 0;
    for (const d of DENOMS) {
      const c = parseInt(denoms[d] || "0", 10);
      if (Number.isFinite(c)) s += d * c;
    }
    return s;
  }, [denoms]);

  const cashReceipts = report?.totals.cashReceipts || 0;
  const expenses = report?.totals.totalExpenses || 0;
  const opening_n = parseFloat(opening) || 0;
  const expected = opening_n + cashReceipts - expenses;
  const diff = counted - expected;

  async function submit() {
    setBusy(true); setError(null);
    try {
      const denomJson: Record<string, number> = {};
      for (const d of DENOMS) {
        const c = parseInt(denoms[d] || "0", 10);
        if (Number.isFinite(c) && c > 0) denomJson[String(d)] = c;
      }
      const res = await api.billing.closings.close({
        branchId, date,
        openingTill: opening_n,
        denominations: denomJson,
        cashCounted: counted,
        remarks: remarks.trim() || undefined,
      }) as { success?: boolean; error?: string };
      if (!res.success) throw new Error(res.error || "Failed to close day");
      onClosed();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to close day");
      setBusy(false);
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={busy ? () => {} : onClose}
      title="Close the day"
      subtitle={`Freeze the snapshot for ${date} — totals stop updating after this`}
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={busy} iconLeft={busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}>
            {busy ? "Closing…" : "Close day"}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <Input
          label="Opening till amount"
          type="number"
          placeholder="0.00"
          value={opening}
          onChange={(e) => setOpening(e.target.value)}
          helperText={
            report?.hints?.previousClosingCashCounted != null
              ? `Pre-filled from ${report.hints.previousClosingDate}'s close (${formatCurrency(report.hints.previousClosingCashCounted)} counted). Edit if you topped up the till this morning.`
              : "Cash brought forward from yesterday + any morning top-up"
          }
        />

        <div>
          <label className="text-sm font-medium text-stone-700 block mb-2">Denomination count</label>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {DENOMS.map((d) => (
              <div key={d} className="flex items-center gap-1.5 bg-stone-50 rounded-xl border border-stone-100 px-2 py-1.5">
                <span className="text-xs text-stone-500 font-medium w-12 shrink-0">Rs. {d}</span>
                <input
                  type="number"
                  min="0"
                  placeholder="0"
                  value={denoms[d] || ""}
                  onChange={(e) => setDenoms({ ...denoms, [d]: e.target.value })}
                  className="w-full text-sm bg-transparent border-none outline-none text-stone-900 font-semibold text-right"
                />
              </div>
            ))}
          </div>
          <p className="text-xs text-stone-500 mt-2">
            Counted: <span className="font-semibold text-stone-900">{formatCurrency(counted)}</span>
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <ReconRow label="Opening" value={opening_n} />
          <ReconRow label="+ Cash received" value={cashReceipts} positive />
          <ReconRow label="− Petty cash" value={expenses} negative />
          <ReconRow label="Expected" value={expected} bold />
        </div>

        <div className={`px-4 py-3 rounded-xl border text-sm ${
          Math.abs(diff) < 0.01
            ? "bg-emerald-50 border-emerald-200 text-emerald-800"
            : diff > 0
              ? "bg-blue-50 border-blue-200 text-blue-800"
              : "bg-amber-50 border-amber-200 text-amber-800"
        }`}>
          {Math.abs(diff) < 0.01
            ? "Balanced — counted matches expected."
            : diff > 0
              ? `Over by ${formatCurrency(diff)} — counted is more than expected.`
              : `Short by ${formatCurrency(-diff)} — counted is less than expected.`}
        </div>

        <Textarea
          label="Remarks (optional)"
          rows={2}
          placeholder="Anything to flag — over/short reason, who counted, etc."
          value={remarks}
          onChange={(e) => setRemarks(e.target.value)}
        />

        {error && (
          <div className="px-3 py-2 rounded-xl bg-red-50 border border-red-100 text-sm text-red-700">
            {error}
          </div>
        )}
      </div>
    </Modal>
  );
}
