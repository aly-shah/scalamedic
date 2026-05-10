"use client";

/**
 * /billing/reports/payers — Per-payer claim aggregation (v60).
 *
 * One row per payer with claimed / approved / paid / approval rate /
 * avg-days-to-decide, plus a top-5 denial-reason breakdown. Date
 * window defaults to the last 90 days.
 */
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { ArrowLeft, ShieldCheck, Building2, AlertTriangle, RefreshCw } from "lucide-react";
import { Button, StatCard } from "@/components/ui";
import { DatePicker } from "@/components/ui/date-picker";
import { LoadingSpinner } from "@/components/ui/loading";
import { getClinicToday, toClinicDay } from "@/lib/utils";
import { useFormatCurrency } from "@/hooks/use-format-currency";

interface PayerRow {
  payerId: string | null;
  payerName: string;
  payerCode: string | null;
  claims: number;
  claimed: number;
  approved: number;
  paid: number;
  approvalRate: number;
  denialRate: number;
  avgDaysToDecide: number | null;
  statusCounts: Record<string, number>;
  topDenialReasons: { code: string; description: string; count: number }[];
}
interface ReportData {
  window: { from: string | null; to: string | null };
  totals: { claims: number; claimed: number; approved: number; paid: number; approvalRate: number };
  byPayer: PayerRow[];
  unmappedClaims: number;
}

function ninetyDaysAgo(): string {
  const d = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  return toClinicDay(d);
}

export default function PayerReportsPage() {
  const formatCurrency = useFormatCurrency();
  const [from, setFrom] = useState(ninetyDaysAgo());
  const [to, setTo] = useState(getClinicToday());
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const reload = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const params = new URLSearchParams();
      if (from) params.set("from", from);
      if (to)   params.set("to", to);
      const res = await fetch(`/api/billing/reports/payers?${params.toString()}`, { credentials: "include" })
        .then((r) => r.json());
      if (res?.success) setData(res.data);
      else setError(res?.error || "Failed");
    } catch { setError("Network error"); }
    finally { setLoading(false); }
  }, [from, to]);

  useEffect(() => { reload(); }, [reload]);

  function pct(v: number): string {
    return `${(v * 100).toFixed(1)}%`;
  }

  return (
    <div className="animate-fade-in space-y-5 sm:space-y-6" data-id="BILL-REPORTS-PAYERS">
      <div className="relative overflow-hidden rounded-2xl border border-stone-100 bg-gradient-to-br from-blue-600 via-indigo-600 to-violet-600 px-5 py-5 sm:px-7 sm:py-6 text-white">
        <div className="absolute inset-0 opacity-25 [background:radial-gradient(circle_at_30%_30%,#fff_0,transparent_45%)]" />
        <div className="relative flex items-start justify-between gap-4 flex-wrap">
          <div>
            <Link href="/billing/claims" className="inline-flex items-center gap-1 text-[11px] uppercase tracking-wider opacity-90 hover:opacity-100 mb-1.5">
              <ArrowLeft className="w-3 h-3" /> Claims
            </Link>
            <div className="flex items-center gap-2">
              <Building2 className="w-5 h-5" />
              <h1 className="text-xl sm:text-2xl font-semibold leading-tight">Payer reports</h1>
            </div>
            <p className="text-sm opacity-90 mt-1 max-w-xl">
              Per-payer claim metrics for the selected window. Includes approval rate, average days to decision, and top denial codes.
            </p>
          </div>
          <Button variant="outline" size="sm" iconLeft={<RefreshCw className="w-3.5 h-3.5" />} onClick={reload}
            className="!bg-white/15 !border-white/30 !text-white hover:!bg-white/25">
            Refresh
          </Button>
        </div>
      </div>

      {/* Window pickers */}
      <div className="flex flex-wrap items-end gap-3 bg-white border border-stone-100 rounded-2xl shadow-sm p-4">
        <div className="w-44">
          <DatePicker label="From" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="w-44">
          <DatePicker label="To" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <Button size="sm" variant="outline" onClick={() => { setFrom(ninetyDaysAgo()); setTo(getClinicToday()); }}>
          Last 90 days
        </Button>
        <Button size="sm" variant="outline" onClick={() => {
          const d = new Date(); d.setDate(1);
          setFrom(toClinicDay(d)); setTo(getClinicToday());
        }}>
          This month
        </Button>
      </div>

      {/* Totals */}
      {data && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <StatCard label="Claims" value={String(data.totals.claims)} icon={<ShieldCheck className="w-5 h-5" />} color="primary" />
          <StatCard label="Claimed" value={formatCurrency(data.totals.claimed)} icon={<Building2 className="w-5 h-5" />} color="info" />
          <StatCard label="Approved" value={formatCurrency(data.totals.approved)} icon={<ShieldCheck className="w-5 h-5" />} color="success" />
          <StatCard label="Approval rate" value={pct(data.totals.approvalRate)} icon={<ShieldCheck className="w-5 h-5" />} color="success" />
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" /> {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20"><LoadingSpinner size="lg" /></div>
      ) : !data || data.byPayer.length === 0 ? (
        <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-12 text-center">
          <ShieldCheck className="w-10 h-10 text-stone-200 mx-auto mb-3" />
          <p className="text-sm text-stone-500 font-medium">No claims in this window</p>
          <p className="text-xs text-stone-400 mt-1">Adjust the date range or check that claims exist for this branch.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-stone-100 shadow-sm overflow-hidden">
          <div className="hidden md:grid grid-cols-[1.5fr_0.6fr_1fr_1fr_1fr_0.8fr_0.8fr_1.5fr] gap-3 px-4 py-2.5 border-b border-stone-100 bg-stone-50/60 text-[10px] uppercase tracking-wider text-stone-400 font-semibold">
            <div>Payer</div>
            <div className="text-right">Claims</div>
            <div className="text-right">Claimed</div>
            <div className="text-right">Approved</div>
            <div className="text-right">Paid</div>
            <div className="text-right">Approval %</div>
            <div className="text-right">Avg days</div>
            <div>Top denials</div>
          </div>

          <ul className="divide-y divide-stone-100">
            {data.byPayer.map((p, i) => (
              <li key={`${p.payerId ?? "free"}-${i}`} className="md:grid md:grid-cols-[1.5fr_0.6fr_1fr_1fr_1fr_0.8fr_0.8fr_1.5fr] md:gap-3 md:items-center px-4 py-3 hover:bg-stone-50/60">
                <div className="mb-1 md:mb-0">
                  <p className="text-sm font-semibold text-stone-900">{p.payerName}</p>
                  {p.payerCode ? (
                    <p className="text-[11px] text-stone-400 font-mono">{p.payerCode}</p>
                  ) : (
                    <p className="text-[11px] text-amber-600">unmapped (free-text)</p>
                  )}
                </div>
                <div className="md:text-right text-sm tabular-nums text-stone-700">{p.claims}</div>
                <div className="md:text-right text-sm tabular-nums">{formatCurrency(p.claimed)}</div>
                <div className="md:text-right text-sm tabular-nums text-violet-700">{formatCurrency(p.approved)}</div>
                <div className="md:text-right text-sm tabular-nums text-emerald-700">{formatCurrency(p.paid)}</div>
                <div className="md:text-right text-sm tabular-nums">
                  <span className={p.approvalRate >= 0.8 ? "text-emerald-600" : p.approvalRate >= 0.5 ? "text-amber-600" : "text-red-600"}>
                    {pct(p.approvalRate)}
                  </span>
                </div>
                <div className="md:text-right text-sm tabular-nums text-stone-600">
                  {p.avgDaysToDecide != null ? `${p.avgDaysToDecide}d` : "—"}
                </div>
                <div className="text-[11px] text-stone-600">
                  {p.topDenialReasons.length === 0 ? (
                    <span className="text-stone-300">—</span>
                  ) : (
                    <ul className="space-y-0.5">
                      {p.topDenialReasons.map((r) => (
                        <li key={r.code} className="truncate" title={r.description}>
                          <span className="font-mono text-stone-500">{r.code}</span>
                          <span className="text-stone-400"> · </span>
                          <span>{r.count}× </span>
                          <span className="text-stone-500">{r.description}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </li>
            ))}
          </ul>

          {data.unmappedClaims > 0 && (
            <div className="px-4 py-3 bg-amber-50 border-t border-amber-200 text-xs text-amber-800 flex items-center gap-2">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              {data.unmappedClaims} claim{data.unmappedClaims === 1 ? "" : "s"} have free-text payer names (no payerId). Edit the patient&apos;s insurance to link them to a Payer for cleaner reports.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
