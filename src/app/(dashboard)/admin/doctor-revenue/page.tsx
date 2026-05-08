"use client";

/**
 * /admin/doctor-revenue — per-doctor utilization + revenue.
 *
 * Picks a date window, shows a sortable table of every doctor in
 * the tenant with completed visits, invoices issued, total billed,
 * collected, outstanding, and average-per-visit. Walk-in invoices
 * (no linked doctor) are reported separately so the totals stay
 * balanced.
 */
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, BarChart3, Loader2, AlertCircle } from "lucide-react";
import { Card } from "@/components/ui";
import { formatCurrency } from "@/lib/utils";

interface DoctorRow {
  doctorId: string;
  doctorName: string;
  speciality: string | null;
  completedVisits: number;
  invoicesIssued: number;
  totalBilled: number;
  totalCollected: number;
  totalOutstanding: number;
  avgPerVisit: number;
}
interface Totals {
  completedVisits: number;
  invoicesIssued: number;
  totalBilled: number;
  totalCollected: number;
  totalOutstanding: number;
}
interface ReportPayload {
  from: string;
  to: string;
  rows: DoctorRow[];
  totals: Totals;
  walkIns: { count: number; billed: number; collected: number; outstanding: number };
}

const today = new Date().toISOString().slice(0, 10);
const monthStart = (() => {
  const d = new Date(); d.setDate(1);
  return d.toISOString().slice(0, 10);
})();

export default function DoctorRevenuePage() {
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(today);
  const [data, setData] = useState<ReportPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr(null);
    fetch(`/api/admin/reports/doctor-revenue?from=${from}&to=${to}`, { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (!d.success) { setErr(d.error || "Failed"); return; }
        setData(d.data);
      })
      .catch((e) => !cancelled && setErr(e instanceof Error ? e.message : "Failed"))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [from, to]);

  const collectionRate = useMemo(() => {
    if (!data) return null;
    if (data.totals.totalBilled === 0) return null;
    return Math.round((data.totals.totalCollected / data.totals.totalBilled) * 100);
  }, [data]);

  return (
    <div className="space-y-5">
      <div>
        <Link href="/dashboard" className="text-xs text-stone-500 hover:text-teal-600 inline-flex items-center gap-1">
          <ArrowLeft className="w-3 h-3" /> Dashboard
        </Link>
        <h1 className="text-2xl font-bold text-stone-900 mt-1 flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-teal-600" /> Doctor revenue
        </h1>
        <p className="text-sm text-stone-500">
          Per-doctor utilization and billing over the selected window. Walk-in invoices (no linked doctor) reported separately.
        </p>
      </div>

      <Card padding="md">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-xs uppercase tracking-wider text-stone-400 font-semibold">Window:</span>
          <input
            type="date"
            value={from}
            max={to}
            onChange={(e) => setFrom(e.target.value)}
            className="px-3 py-1.5 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
          <span className="text-stone-400">→</span>
          <input
            type="date"
            value={to}
            min={from}
            max={today}
            onChange={(e) => setTo(e.target.value)}
            className="px-3 py-1.5 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
          <div className="flex-1" />
          {(["MTD", "Last 30d", "YTD"] as const).map((preset) => (
            <button
              key={preset}
              onClick={() => {
                const now = new Date();
                if (preset === "MTD") { const d = new Date(now.getFullYear(), now.getMonth(), 1); setFrom(d.toISOString().slice(0, 10)); setTo(today); }
                else if (preset === "Last 30d") { const d = new Date(now.getTime() - 30 * 86400_000); setFrom(d.toISOString().slice(0, 10)); setTo(today); }
                else if (preset === "YTD") { const d = new Date(now.getFullYear(), 0, 1); setFrom(d.toISOString().slice(0, 10)); setTo(today); }
              }}
              className="px-2.5 py-1 text-xs font-medium border border-stone-200 rounded-full bg-white hover:bg-stone-50"
            >
              {preset}
            </button>
          ))}
        </div>
      </Card>

      {err && (
        <Card padding="md" className="border-l-4 border-l-red-400 bg-red-50 text-red-800 text-sm">
          <AlertCircle className="w-4 h-4 inline mr-2" /> {err}
        </Card>
      )}

      {loading || !data ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 text-teal-600 animate-spin" />
        </div>
      ) : (
        <>
          {/* Summary tiles */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <Card padding="md">
              <p className="text-[10px] uppercase tracking-wider text-stone-400 font-semibold">Visits</p>
              <p className="mt-1 text-2xl font-bold text-stone-900">{data.totals.completedVisits}</p>
            </Card>
            <Card padding="md">
              <p className="text-[10px] uppercase tracking-wider text-stone-400 font-semibold">Invoices</p>
              <p className="mt-1 text-2xl font-bold text-stone-900">{data.totals.invoicesIssued}</p>
            </Card>
            <Card padding="md">
              <p className="text-[10px] uppercase tracking-wider text-stone-400 font-semibold">Billed</p>
              <p className="mt-1 text-xl font-bold text-stone-900">{formatCurrency(data.totals.totalBilled)}</p>
            </Card>
            <Card padding="md">
              <p className="text-[10px] uppercase tracking-wider text-stone-400 font-semibold">Collected</p>
              <p className="mt-1 text-xl font-bold text-emerald-700">{formatCurrency(data.totals.totalCollected)}</p>
              {collectionRate !== null && <p className="text-[10px] text-stone-500 mt-0.5">{collectionRate}% collection</p>}
            </Card>
            <Card padding="md">
              <p className="text-[10px] uppercase tracking-wider text-stone-400 font-semibold">Outstanding</p>
              <p className="mt-1 text-xl font-bold text-red-700">{formatCurrency(data.totals.totalOutstanding)}</p>
            </Card>
          </div>

          {/* Per-doctor table */}
          <Card padding="md">
            <h2 className="text-sm font-semibold text-stone-900 mb-3">By doctor</h2>
            {data.rows.length === 0 ? (
              <p className="text-sm text-stone-500 text-center py-4">No completed visits in this window.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[10px] uppercase tracking-wider text-stone-400 border-b border-stone-100">
                      <th className="py-2 pr-3">Doctor</th>
                      <th className="py-2 px-3 text-right">Visits</th>
                      <th className="py-2 px-3 text-right">Invoices</th>
                      <th className="py-2 px-3 text-right">Billed</th>
                      <th className="py-2 px-3 text-right">Collected</th>
                      <th className="py-2 px-3 text-right">Outstanding</th>
                      <th className="py-2 pl-3 text-right">Avg / visit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.map((r) => (
                      <tr key={r.doctorId} className="border-b border-stone-50 last:border-b-0 hover:bg-stone-50/50">
                        <td className="py-2 pr-3">
                          <p className="font-medium text-stone-900">{r.doctorName}</p>
                          {r.speciality && <p className="text-[10px] text-stone-400">{r.speciality}</p>}
                        </td>
                        <td className="py-2 px-3 text-right font-mono text-stone-700">{r.completedVisits}</td>
                        <td className="py-2 px-3 text-right font-mono text-stone-700">{r.invoicesIssued}</td>
                        <td className="py-2 px-3 text-right font-mono text-stone-900 font-semibold">{formatCurrency(r.totalBilled)}</td>
                        <td className="py-2 px-3 text-right font-mono text-emerald-700">{formatCurrency(r.totalCollected)}</td>
                        <td className="py-2 px-3 text-right font-mono text-red-700">{formatCurrency(r.totalOutstanding)}</td>
                        <td className="py-2 pl-3 text-right font-mono text-stone-600">{formatCurrency(r.avgPerVisit)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {/* Walk-in invoices breakdown */}
          {data.walkIns.count > 0 && (
            <Card padding="md" className="bg-stone-50">
              <p className="text-xs uppercase tracking-wider text-stone-400 font-semibold mb-2">Walk-in invoices (no linked doctor)</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                <div>
                  <p className="text-[10px] text-stone-400">Count</p>
                  <p className="font-bold text-stone-900">{data.walkIns.count}</p>
                </div>
                <div>
                  <p className="text-[10px] text-stone-400">Billed</p>
                  <p className="font-bold text-stone-900">{formatCurrency(data.walkIns.billed)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-stone-400">Collected</p>
                  <p className="font-bold text-emerald-700">{formatCurrency(data.walkIns.collected)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-stone-400">Outstanding</p>
                  <p className="font-bold text-red-700">{formatCurrency(data.walkIns.outstanding)}</p>
                </div>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
