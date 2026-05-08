"use client";

/**
 * /admin/ai-suggestions — AI suggestion audit reader.
 *
 * Lists every AI proposal the platform has generated in a chosen
 * window (default 30 days), with the doctor's accept/reject
 * decision and a link to the resulting clinical artifact (LabTest,
 * FollowUp) where applicable. Filterable by kind, status, doctor.
 */
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Sparkles, ArrowLeft, CheckCircle2, XCircle, Clock, AlertCircle,
  Pill, FlaskConical, CalendarClock, Filter, Loader2,
} from "lucide-react";
import { Card, Badge } from "@/components/ui";

interface SuggestionRow {
  id: string;
  kind: "MEDICATION" | "LAB" | "FOLLOWUP" | "PROCEDURE" | "NOTE_FIELD" | "DIAGNOSIS_HINT";
  status: "PENDING" | "ACCEPTED" | "REJECTED" | "EXPIRED";
  payload: Record<string, unknown>;
  modelId: string;
  promptVersion: string;
  createdAt: string;
  decidedAt: string | null;
  acceptedEntityType: string | null;
  acceptedEntityId: string | null;
  rejectionReason: string | null;
  doctor: { id: string; name: string } | null;
  decidedBy: { id: string; name: string } | null;
  patient: { id: string; firstName: string; lastName: string; patientCode: string } | null;
  appointment: { id: string; appointmentCode: string; date: string } | null;
}

interface Summary {
  windowDays: number;
  byKind: Record<string, number>;
  byStatus: Record<string, number>;
  total: number;
}

const fmt = (iso: string) => new Date(iso).toLocaleString("en-PK", {
  timeZone: "Asia/Karachi",
  month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: true,
});

const KIND_TONE: Record<string, string> = {
  MEDICATION: "bg-indigo-100 text-indigo-800",
  LAB: "bg-rose-100 text-rose-800",
  FOLLOWUP: "bg-amber-100 text-amber-800",
  PROCEDURE: "bg-pink-100 text-pink-800",
  NOTE_FIELD: "bg-blue-100 text-blue-800",
  DIAGNOSIS_HINT: "bg-purple-100 text-purple-800",
};
const KIND_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  MEDICATION: Pill, LAB: FlaskConical, FOLLOWUP: CalendarClock,
  PROCEDURE: Sparkles, NOTE_FIELD: Sparkles, DIAGNOSIS_HINT: Sparkles,
};
const STATUS_TONE: Record<string, "success" | "danger" | "warning" | "default"> = {
  ACCEPTED: "success", REJECTED: "danger", PENDING: "warning", EXPIRED: "default",
};

export default function AISuggestionsAuditPage() {
  const [rows, setRows] = useState<SuggestionRow[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<string>("");
  const [status, setStatus] = useState<string>("");
  const [days, setDays] = useState(30);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const params = new URLSearchParams();
    if (kind) params.set("kind", kind);
    if (status) params.set("status", status);
    params.set("days", String(days));
    fetch(`/api/admin/ai-suggestions?${params.toString()}`, { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (!d.success) { setError(d.error || "Failed to load"); return; }
        setRows(d.data || []); setSummary(d.summary || null); setError(null);
      })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : "Failed"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [kind, status, days]);

  const acceptanceRate = useMemo(() => {
    if (!summary) return null;
    const accepted = summary.byStatus.ACCEPTED ?? 0;
    const decided = (summary.byStatus.ACCEPTED ?? 0) + (summary.byStatus.REJECTED ?? 0);
    if (decided === 0) return null;
    return Math.round((accepted / decided) * 100);
  }, [summary]);

  return (
    <div className="space-y-5">
      <div>
        <Link href="/dashboard" className="text-xs text-stone-500 hover:text-teal-600 inline-flex items-center gap-1">
          <ArrowLeft className="w-3 h-3" /> Dashboard
        </Link>
        <h1 className="text-2xl font-bold text-stone-900 mt-1 flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-violet-600" /> AI Suggestions
        </h1>
        <p className="text-sm text-stone-500">
          Every AI proposal the platform has generated, with the doctor&apos;s decision and the resulting clinical artifact.
        </p>
      </div>

      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card padding="md">
            <p className="text-[10px] uppercase tracking-wider text-stone-400 font-semibold">Total ({summary.windowDays}d)</p>
            <p className="mt-1 text-2xl font-bold text-stone-900">{summary.total}</p>
          </Card>
          <Card padding="md">
            <p className="text-[10px] uppercase tracking-wider text-stone-400 font-semibold">Accepted</p>
            <p className="mt-1 text-2xl font-bold text-emerald-700">{summary.byStatus.ACCEPTED ?? 0}</p>
          </Card>
          <Card padding="md">
            <p className="text-[10px] uppercase tracking-wider text-stone-400 font-semibold">Rejected</p>
            <p className="mt-1 text-2xl font-bold text-red-700">{summary.byStatus.REJECTED ?? 0}</p>
          </Card>
          <Card padding="md">
            <p className="text-[10px] uppercase tracking-wider text-stone-400 font-semibold">Acceptance rate</p>
            <p className="mt-1 text-2xl font-bold text-stone-900">{acceptanceRate !== null ? `${acceptanceRate}%` : "—"}</p>
          </Card>
        </div>
      )}

      <Card padding="md">
        <div className="flex items-center gap-2 flex-wrap">
          <Filter className="w-4 h-4 text-stone-400" />
          <span className="text-xs uppercase tracking-wider text-stone-400 font-semibold">Kind:</span>
          {(["", "MEDICATION", "LAB", "FOLLOWUP"] as const).map((k) => (
            <button key={k || "all"} onClick={() => setKind(k)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium border ${
                kind === k ? "bg-teal-600 text-white border-teal-600" : "bg-white text-stone-600 border-stone-200"
              }`}>
              {k || "All"}
            </button>
          ))}
          <span className="ml-3 text-xs uppercase tracking-wider text-stone-400 font-semibold">Status:</span>
          {(["", "PENDING", "ACCEPTED", "REJECTED"] as const).map((s) => (
            <button key={s || "all"} onClick={() => setStatus(s)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium border ${
                status === s ? "bg-teal-600 text-white border-teal-600" : "bg-white text-stone-600 border-stone-200"
              }`}>
              {s || "All"}
            </button>
          ))}
          <span className="ml-3 text-xs uppercase tracking-wider text-stone-400 font-semibold">Window:</span>
          <select value={days} onChange={(e) => setDays(Number(e.target.value))}
            className="px-2 py-1 rounded-lg text-xs border border-stone-200 bg-white">
            <option value={7}>7d</option>
            <option value={30}>30d</option>
            <option value={90}>90d</option>
            <option value={365}>1y</option>
          </select>
        </div>
      </Card>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 text-teal-600 animate-spin" />
        </div>
      ) : error ? (
        <Card padding="md" className="border-l-4 border-l-red-400 bg-red-50 text-red-800 text-sm">
          <AlertCircle className="w-4 h-4 inline mr-2" /> {error}
        </Card>
      ) : rows.length === 0 ? (
        <Card padding="md" className="text-center py-10">
          <p className="text-sm text-stone-500">No AI suggestions match the selected filters.</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => {
            const Icon = KIND_ICON[r.kind] ?? Sparkles;
            const tone = KIND_TONE[r.kind] ?? "bg-stone-100 text-stone-700";
            const desc = renderPayload(r);
            return (
              <Card key={r.id} padding="md">
                <div className="flex items-start gap-3 flex-wrap">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${tone}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-[10px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded ${tone}`}>
                        {r.kind.replace(/_/g, " ")}
                      </span>
                      <Badge variant={STATUS_TONE[r.status]} dot className="text-[10px]">{r.status}</Badge>
                      <span className="text-[11px] text-stone-400">{fmt(r.createdAt)}</span>
                      <span className="text-[10px] text-stone-400 font-mono">{r.modelId} · {r.promptVersion}</span>
                    </div>
                    <p className="text-sm font-medium text-stone-900 mt-1">{desc}</p>
                    <div className="mt-1 text-[11px] text-stone-500 flex flex-wrap gap-x-3 gap-y-0.5">
                      {r.patient && (
                        <Link href={`/patients/${r.patient.id}`} className="hover:text-teal-600">
                          {r.patient.firstName} {r.patient.lastName} <span className="font-mono">{r.patient.patientCode}</span>
                        </Link>
                      )}
                      {r.doctor && <span>by {r.doctor.name}</span>}
                      {r.decidedAt && r.decidedBy && (
                        <span className="text-stone-400">
                          decided {fmt(r.decidedAt)} by {r.decidedBy.name}
                        </span>
                      )}
                      {r.acceptedEntityType && r.acceptedEntityId && (
                        <span className="text-emerald-600 font-mono text-[10px]">
                          → {r.acceptedEntityType}:{r.acceptedEntityId.slice(0, 8)}
                        </span>
                      )}
                      {r.rejectionReason && (
                        <span className="text-red-600">reason: {r.rejectionReason}</span>
                      )}
                    </div>
                  </div>
                  <div className="shrink-0">
                    {r.status === "ACCEPTED" && <CheckCircle2 className="w-5 h-5 text-emerald-500" />}
                    {r.status === "REJECTED" && <XCircle className="w-5 h-5 text-red-400" />}
                    {r.status === "PENDING" && <Clock className="w-5 h-5 text-amber-500" />}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function renderPayload(r: SuggestionRow): string {
  const p = r.payload;
  if (r.kind === "MEDICATION") {
    return `${(p.medicineName as string) || "Medicine"}${p.dosage ? ` · ${p.dosage}` : ""}${p.frequency ? ` · ${p.frequency}` : ""}${p.duration ? ` · ${p.duration}` : ""}`;
  }
  if (r.kind === "LAB") {
    return `${(p.testName as string) || "Lab"}${p.testCode ? ` (${p.testCode})` : ""}`;
  }
  if (r.kind === "FOLLOWUP") {
    return `${(p.reason as string) || "Follow-up"}${p.days ? ` · ${p.days}d` : ""}`;
  }
  return JSON.stringify(p).slice(0, 100);
}
