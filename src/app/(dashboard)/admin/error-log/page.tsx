"use client";

/**
 * /admin/error-log — operator-grade error reader.
 *
 * Tails pm2's stderr stream for the medicore process and parses the
 * JSON entries our `logger.error()` emits. Refreshes on demand or
 * every 30s when the page is open. Filters by level + free-text on
 * the message.
 */
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle, ArrowLeft, RefreshCw, Filter, AlertCircle,
} from "lucide-react";
import { Card, Badge } from "@/components/ui";

interface Entry {
  level: "info" | "warn" | "error";
  message: string;
  module?: string;
  data?: unknown;
  timestamp: string;
}
interface Summary {
  path: string;
  sizeBytes: number;
  parsedCount: number;
  returnedCount: number;
}

const fmtBytes = (b: number) => b > 1024 * 1024 ? `${(b / (1024 * 1024)).toFixed(1)} MB` : `${(b / 1024).toFixed(0)} KB`;
const fmtTime  = (iso: string) => new Date(iso).toLocaleString("en-PK", { timeZone: "Asia/Karachi", year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });

const TONE: Record<string, "danger" | "warning" | "default"> = {
  error: "danger", warn: "warning", info: "default",
};

export default function ErrorLogPage() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [level, setLevel] = useState<"all" | "error" | "warn">("error");
  const [q, setQ] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/error-log?limit=300", { credentials: "include" });
      const d = await res.json();
      if (!d.success) { setErr(d.error || "Failed"); return; }
      setEntries(d.data || []);
      setSummary(d.summary || null);
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Network error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, []);

  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return entries.filter((e) => {
      if (level !== "all" && e.level !== level) return false;
      if (ql && !(e.message + " " + JSON.stringify(e.data ?? "")).toLowerCase().includes(ql)) return false;
      return true;
    });
  }, [entries, level, q]);

  const counts = useMemo(() => ({
    error: entries.filter((e) => e.level === "error").length,
    warn:  entries.filter((e) => e.level === "warn").length,
    info:  entries.filter((e) => e.level === "info").length,
  }), [entries]);

  return (
    <div className="space-y-5">
      <div>
        <Link href="/dashboard" className="text-xs text-stone-500 hover:text-teal-600 inline-flex items-center gap-1">
          <ArrowLeft className="w-3 h-3" /> Dashboard
        </Link>
        <div className="flex items-center justify-between mt-1 flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-stone-900 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-600" /> Error log
            </h1>
            <p className="text-sm text-stone-500">
              Server-side errors from the last few hours. Refreshes every 30s while open.
            </p>
          </div>
          <button onClick={load} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-stone-200 rounded-xl bg-white hover:bg-stone-50">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card padding="md">
          <p className="text-[10px] uppercase tracking-wider text-stone-400 font-semibold">Errors</p>
          <p className="mt-1 text-2xl font-bold text-red-700">{counts.error}</p>
        </Card>
        <Card padding="md">
          <p className="text-[10px] uppercase tracking-wider text-stone-400 font-semibold">Warnings</p>
          <p className="mt-1 text-2xl font-bold text-amber-700">{counts.warn}</p>
        </Card>
        <Card padding="md">
          <p className="text-[10px] uppercase tracking-wider text-stone-400 font-semibold">Info</p>
          <p className="mt-1 text-2xl font-bold text-stone-700">{counts.info}</p>
        </Card>
        <Card padding="md">
          <p className="text-[10px] uppercase tracking-wider text-stone-400 font-semibold">Log size</p>
          <p className="mt-1 text-lg font-mono text-stone-700">{summary ? fmtBytes(summary.sizeBytes) : "—"}</p>
          <p className="text-[10px] text-stone-400 mt-0.5 truncate">{summary?.path}</p>
        </Card>
      </div>

      <Card padding="md">
        <div className="flex items-center gap-2 flex-wrap">
          <Filter className="w-4 h-4 text-stone-400" />
          {(["all", "error", "warn"] as const).map((l) => (
            <button key={l} onClick={() => setLevel(l)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium border ${
                level === l ? "bg-teal-600 text-white border-teal-600" : "bg-white text-stone-600 border-stone-200"
              }`}>
              {l}
            </button>
          ))}
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search message or data…"
            className="flex-1 min-w-[200px] px-3 py-1.5 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
        </div>
      </Card>

      {err && (
        <Card padding="md" className="border-l-4 border-l-red-400 bg-red-50 text-red-800 text-sm">
          <AlertCircle className="w-4 h-4 inline mr-2" /> {err}
        </Card>
      )}

      {filtered.length === 0 ? (
        <Card padding="md" className="text-center py-10">
          <p className="text-sm text-stone-500">No entries match the current filters.</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((e, i) => (
            <Card key={i} padding="md">
              <div className="flex items-start gap-3 flex-wrap">
                <Badge variant={TONE[e.level] ?? "default"} className="text-[10px] uppercase">{e.level}</Badge>
                <span className="text-[11px] text-stone-400 font-mono">{fmtTime(e.timestamp)}</span>
                {e.module && <span className="text-[10px] text-stone-500 font-mono">{e.module}</span>}
              </div>
              <p className="text-sm font-medium text-stone-900 mt-1">{e.message}</p>
              {e.data !== undefined && (
                <pre className="text-[11px] text-stone-600 mt-1 bg-stone-50 border border-stone-100 rounded-lg p-2 overflow-x-auto whitespace-pre-wrap">
                  {JSON.stringify(e.data, null, 2)}
                </pre>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
