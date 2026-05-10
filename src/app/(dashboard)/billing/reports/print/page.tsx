"use client";

/**
 * Print-friendly daily report
 *
 * Opened in a new window/tab from /billing/reports's "Print / PDF"
 * button. Auto-triggers window.print() on load. Browser's "Save as
 * PDF" makes a saved copy.
 *
 * Layout matches the SkedWise Cash Register PDF the client uses today:
 * one A4-ish page with the day's totals up top, then payment-method
 * breakdown + sales-by-category side by side, the cash reconciliation
 * box, and the per-invoice + petty-cash tables underneath.
 */
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CLINIC_TZ, getClinicToday } from "@/lib/utils";
import { useFormatCurrency } from "@/hooks/use-format-currency";
import { api } from "@/lib/api";

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

const fmtFullDate = (d: string) =>
  new Date(d + "T00:00:00").toLocaleDateString("en-PK", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
    timeZone: CLINIC_TZ,
  });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Report = any;

export default function PrintReportPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-stone-400">Loading…</div>}>
      <PrintReportInner />
    </Suspense>
  );
}

function PrintReportInner() {
  const formatCurrency = useFormatCurrency();
  const params = useSearchParams();
  const date = params.get("date") || getClinicToday();
  const branchId = params.get("branchId") || "";

  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q: Record<string, string> = { date };
    if (branchId) q.branchId = branchId;
    api.billing.reports.daily(q)
      .then((r) => {
        const res = r as { success?: boolean; data?: Report; error?: string };
        if (!res.success) { setError(res.error || "Failed to load"); return; }
        setReport(res.data || null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"));
  }, [date, branchId]);

  // Auto-trigger print once data is on screen. setTimeout so the DOM
  // has a beat to settle (ProgressBars / fonts render before print).
  useEffect(() => {
    if (!report) return;
    const t = setTimeout(() => window.print(), 400);
    return () => clearTimeout(t);
  }, [report]);

  if (error) {
    return <div className="p-8 text-center text-red-600">{error}</div>;
  }
  if (!report) {
    return <div className="p-8 text-center text-stone-400">Loading report…</div>;
  }

  const t = report.totals;
  const branchLabel = branchId
    ? (report.invoices[0]?.branch?.name
        || report.expenses[0]?.branch?.name
        || "Selected branch")
    : "All branches";

  const salesRows = Object.entries(report.salesByCategory || {})
    .map(([k, v]) => [k, num(v)] as const)
    .sort((a, b) => b[1] - a[1]);

  const expenseRows = Object.entries(report.expensesByCategory || {})
    .map(([k, v]) => [k, num(v)] as const)
    .sort((a, b) => b[1] - a[1]);

  return (
    <div className="print-page bg-white text-stone-900 p-6 max-w-[820px] mx-auto text-[11px] leading-snug">
      {/* Print toolbar — only on screen, hidden when printing. */}
      <div className="no-print mb-4 flex items-center justify-between">
        <div>
          <p className="text-xs text-stone-500">If the print dialog didn&apos;t open automatically:</p>
          <button
            onClick={() => window.print()}
            className="mt-1 px-3 py-1.5 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 cursor-pointer"
          >
            Print / Save as PDF
          </button>
        </div>
        <button
          onClick={() => window.close()}
          className="text-xs text-stone-500 hover:text-stone-700 cursor-pointer"
        >
          Close
        </button>
      </div>

      {/* ── Header ── */}
      <div className="border-b-2 border-stone-900 pb-3 mb-4">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold">Daily Cash &amp; Sales Report</h1>
            <p className="text-sm text-stone-600 mt-0.5">{branchLabel}</p>
          </div>
          <div className="text-right">
            <p className="text-sm font-semibold">{fmtFullDate(date)}</p>
            <p className="text-[10px] text-stone-500 mt-0.5">
              Generated {new Date().toLocaleString("en-PK", { timeZone: CLINIC_TZ })}
            </p>
            {report.closing && (
              <p className="text-[10px] text-emerald-700 font-semibold mt-0.5">
                CLOSED · by {report.closing.closedBy?.name || "—"}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ── Top totals strip ── */}
      <div className="grid grid-cols-4 gap-2 mb-4 text-center">
        <TotalBox label="Gross Sale" value={t.grossSale} />
        <TotalBox label="Net Sale" value={t.netSale} bold />
        <TotalBox label="Payments Received" value={t.totalPayments} bold />
        <TotalBox label="Petty Cash Out" value={t.totalExpenses} />
      </div>

      {/* ── Payment-method strip — always shows Cash/Card/Cheque/
            Digital Wallet/Bank Transfer so the day-end reader knows
            exactly what's on hand vs in the bank. ── */}
      <Section title="Payments Received — by Method (cash on hand vs bank)">
        {(() => {
          const ALWAYS = ["CASH", "CARD", "CHEQUE", "DIGITAL_WALLET", "BANK_TRANSFER"];
          const allMethods = Array.from(new Set([...ALWAYS, ...Object.keys(report.paymentsByMethod || {})]));
          return (
            <table className="w-full">
              <thead>
                <tr className="border-b-2 border-stone-900 text-left">
                  <th className="py-1 pr-2">Method</th>
                  <th className="py-1 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {allMethods.map((m) => {
                  const v = num(report.paymentsByMethod?.[m] || 0);
                  return (
                    <tr key={m} className={`border-b border-stone-200 last:border-b-0 ${m === "CASH" ? "bg-amber-50/50" : ""}`}>
                      <td className="py-1 pr-2 font-medium">{PAYMENT_LABELS[m] || m}</td>
                      <td className="py-1 text-right font-medium">{formatCurrency(v)}</td>
                    </tr>
                  );
                })}
                <tr className="border-t-2 border-stone-900 font-bold">
                  <td className="py-1.5">Total Payments</td>
                  <td className="py-1.5 text-right">{formatCurrency(t.totalPayments)}</td>
                </tr>
              </tbody>
            </table>
          );
        })()}
      </Section>

      {/* ── Sales by category ── */}
      <Section title="Sales — by Category">
        {salesRows.length === 0 ? (
          <p className="text-stone-400 text-center py-4">No sales recorded.</p>
        ) : (
          <table className="w-full">
            <tbody>
              {salesRows.map(([k, v]) => (
                <tr key={k} className="border-b border-stone-200 last:border-b-0">
                  <td className="py-1">{k}</td>
                  <td className="py-1 text-right font-medium">{formatCurrency(v)}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-stone-900 font-bold">
                <td className="py-1.5">Gross Sale</td>
                <td className="py-1.5 text-right">{formatCurrency(t.grossSale)}</td>
              </tr>
            </tbody>
          </table>
        )}
      </Section>

      {/* ── Cash reconciliation ── */}
      <Section title="Cash Reconciliation">
        <div className="grid grid-cols-2 gap-x-6 gap-y-1">
          <ReconLine label="Opening till" value={t.opening} />
          <ReconLine label="(+) Cash received" value={t.cashReceipts} positive />
          <ReconLine label="(−) Petty cash out" value={t.totalExpenses} negative />
          <ReconLine label="Expected in drawer" value={t.expectedCash} bold />
          {report.closing && (
            <>
              <ReconLine label="Counted in drawer" value={num(report.closing.cashCounted)} bold />
              <ReconLine
                label="Difference (over/short)"
                value={num(report.closing.difference)}
                bold
                positive={num(report.closing.difference) > 0}
                negative={num(report.closing.difference) < 0}
              />
            </>
          )}
        </div>

        {report.closing?.denominations && Object.keys(report.closing.denominations).length > 0 && (
          <div className="mt-3 pt-3 border-t border-stone-200">
            <p className="font-semibold mb-1">Denomination count</p>
            <div className="grid grid-cols-5 gap-x-3 gap-y-1">
              {Object.entries(report.closing.denominations as Record<string, number>)
                .map(([d, c]) => [parseInt(d, 10), Number(c)] as const)
                .sort((a, b) => b[0] - a[0])
                .map(([d, c]) => (
                  <div key={d} className="flex justify-between border border-stone-200 px-2 py-1 rounded">
                    <span className="text-stone-600">Rs. {d}</span>
                    <span className="font-medium">× {c}</span>
                  </div>
                ))}
            </div>
          </div>
        )}

        {report.closing?.remarks && (
          <div className="mt-3 pt-3 border-t border-stone-200">
            <p className="font-semibold mb-0.5">Remarks</p>
            <p className="text-stone-700">{report.closing.remarks}</p>
          </div>
        )}
      </Section>

      {/* ── Petty cash detail ── */}
      {report.expenses.length > 0 && (
        <Section title={`Petty Cash / Till Disbursements (${report.expenses.length})`}>
          <table className="w-full">
            <thead>
              <tr className="border-b-2 border-stone-900 text-left">
                <th className="py-1 pr-2">Category</th>
                <th className="py-1 pr-2">Description</th>
                <th className="py-1 pr-2">Paid To</th>
                <th className="py-1 pr-2">By</th>
                <th className="py-1 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {report.expenses.map((e: { id: string; category: string; description: string; paidTo: string | null; recordedBy: { name: string } | null; amount: number | string }) => (
                <tr key={e.id} className="border-b border-stone-200 last:border-b-0">
                  <td className="py-1 pr-2">{EXPENSE_LABELS[e.category] || e.category}</td>
                  <td className="py-1 pr-2">{e.description}</td>
                  <td className="py-1 pr-2">{e.paidTo || "—"}</td>
                  <td className="py-1 pr-2">{e.recordedBy?.name || "—"}</td>
                  <td className="py-1 text-right font-medium">{formatCurrency(num(e.amount))}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-stone-900 font-bold">
                <td colSpan={4} className="py-1.5">Total</td>
                <td className="py-1.5 text-right">{formatCurrency(t.totalExpenses)}</td>
              </tr>
            </tbody>
          </table>
        </Section>
      )}

      {/* ── Invoices ── */}
      <Section title={`Invoices Billed Today (${report.invoices.length})`}>
        {report.invoices.length === 0 ? (
          <p className="text-stone-400 text-center py-4">No invoices billed.</p>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b-2 border-stone-900 text-left">
                <th className="py-1 pr-2">Time</th>
                <th className="py-1 pr-2">Invoice</th>
                <th className="py-1 pr-2">Patient</th>
                <th className="py-1 pr-2">Doctor</th>
                <th className="py-1 pr-2">Method</th>
                <th className="py-1 pr-2">Status</th>
                <th className="py-1 text-right">Total</th>
                <th className="py-1 text-right">Paid</th>
                <th className="py-1 text-right">Balance</th>
              </tr>
            </thead>
            <tbody>
              {report.invoices.map((inv: { id: string; invoiceNumber: string; createdAt: string; status: string; patient: { firstName: string; lastName: string }; doctor: { name: string } | null; total: number | string; amountPaid: number | string; balanceDue: number | string; payments: Array<{ method: string; status: string }> }) => {
                const methods = Array.from(new Set(
                  (inv.payments || []).filter((p) => p.status === "COMPLETED").map((p) => p.method)
                ));
                const methodText = methods.length === 0
                  ? "—"
                  : methods.map((m) => PAYMENT_LABELS[m] || m).join(" + ");
                return (
                  <tr key={inv.id} className="border-b border-stone-200 last:border-b-0">
                    <td className="py-1 pr-2">{fmtTime(inv.createdAt)}</td>
                    <td className="py-1 pr-2 font-mono">{inv.invoiceNumber}</td>
                    <td className="py-1 pr-2">{inv.patient.firstName} {inv.patient.lastName}</td>
                    <td className="py-1 pr-2">{inv.doctor?.name || "—"}</td>
                    <td className="py-1 pr-2">{methodText}</td>
                    <td className="py-1 pr-2">{inv.status}</td>
                    <td className="py-1 text-right font-medium">{formatCurrency(num(inv.total))}</td>
                    <td className="py-1 text-right text-emerald-700">{formatCurrency(num(inv.amountPaid))}</td>
                    <td className="py-1 text-right">{num(inv.balanceDue) > 0 ? formatCurrency(num(inv.balanceDue)) : "—"}</td>
                  </tr>
                );
              })}
              <tr className="border-t-2 border-stone-900 font-bold">
                <td colSpan={6} className="py-1.5">Total</td>
                <td className="py-1.5 text-right">{formatCurrency(t.grossSale)}</td>
                <td className="py-1.5 text-right" />
                <td className="py-1.5 text-right" />
              </tr>
            </tbody>
          </table>
        )}
      </Section>

      {/* ── Footer ── */}
      <div className="mt-6 pt-3 border-t border-stone-300 text-[9px] text-stone-500 text-center">
        MediCore ERP · {fmtFullDate(date)} · {branchLabel}
      </div>
    </div>
  );
}

function TotalBox({ label, value, bold }: { label: string; value: number; bold?: boolean }) {
  const formatCurrency = useFormatCurrency();
  return (
    <div className={`border ${bold ? "border-stone-900 bg-stone-50" : "border-stone-300"} rounded p-2`}>
      <p className="text-[9px] uppercase font-medium text-stone-500 tracking-wider">{label}</p>
      <p className={`mt-0.5 ${bold ? "text-base font-bold" : "text-sm font-semibold"}`}>{formatCurrency(value)}</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4 border border-stone-300 rounded p-3">
      <p className="text-[10px] uppercase font-bold text-stone-700 tracking-wider mb-2 border-b border-stone-200 pb-1">{title}</p>
      {children}
    </div>
  );
}

function ReconLine({
  label, value, positive, negative, bold,
}: { label: string; value: number; positive?: boolean; negative?: boolean; bold?: boolean }) {
  const formatCurrency = useFormatCurrency();
  const tone = positive ? "text-emerald-700" : negative ? "text-red-700" : "text-stone-900";
  return (
    <div className="flex justify-between items-baseline">
      <span className={bold ? "font-semibold" : "text-stone-600"}>{label}</span>
      <span className={`${tone} ${bold ? "font-bold" : "font-medium"}`}>{formatCurrency(value)}</span>
    </div>
  );
}
