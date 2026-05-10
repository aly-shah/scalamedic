"use client";

/**
 * /billing/claims — Insurance claims list (Tier 4.4 / v58).
 *
 * Rows-style layout matching the v54 billing rework. Status chips
 * default to "all". Inline actions per status:
 *   DRAFT     → Submit | Cancel
 *   SUBMITTED → Mark in review | Decide | Cancel
 *   IN_REVIEW → Decide | Cancel
 *   APPROVED|PARTIAL → Mark paid | Cancel
 *   DENIED    → Appeal
 *   APPEALED  → Decide | Cancel
 *   PAID|CANCELLED → no actions (read-only)
 *
 * Decision opens a small modal collecting outcome + approvedAmount
 * (or denialReason).
 */
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { ArrowLeft, FileText, AlertTriangle, ShieldCheck, Clock, RefreshCw } from "lucide-react";
import { Badge, Button, SearchInput, StatCard } from "@/components/ui";
import { Modal } from "@/components/ui/modal";
import { LoadingSpinner } from "@/components/ui/loading";
import { formatDate } from "@/lib/utils";
import { useFormatCurrency } from "@/hooks/use-format-currency";

type Status =
  | "DRAFT" | "SUBMITTED" | "IN_REVIEW"
  | "APPROVED" | "PARTIAL" | "DENIED"
  | "PAID" | "APPEALED" | "CANCELLED";

interface ClaimRow {
  id: string;
  claimNumber: string;
  status: Status;
  claimedAmount: string | number;
  approvedAmount: string | number | null;
  paidAmount: string | number;
  diagnosisCodes: string[];
  insurerReference: string | null;
  denialReason: string | null;
  notes: string | null;
  submittedAt: string | null;
  decidedAt: string | null;
  paidAt: string | null;
  createdAt: string;
  patient: { firstName: string; lastName: string; patientCode: string; phone: string | null };
  invoice: { invoiceNumber: string; total: string | number; balanceDue?: string | number };
  insurance: { provider: string; policyNumber: string };
  branch: { code: string; name: string };
  createdBy: { name: string };
}

const STATUSES: Status[] = ["DRAFT", "SUBMITTED", "IN_REVIEW", "APPROVED", "PARTIAL", "DENIED", "PAID", "APPEALED", "CANCELLED"];

function statusBadgeVariant(s: Status): "success" | "warning" | "danger" | "info" | "default" {
  switch (s) {
    case "PAID": return "success";
    case "APPROVED": return "success";
    case "PARTIAL": return "info";
    case "DENIED": return "danger";
    case "CANCELLED": return "default";
    case "DRAFT": return "default";
    case "SUBMITTED": case "IN_REVIEW": case "APPEALED": return "warning";
    default: return "default";
  }
}

function num(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "string") { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; }
  return 0;
}

export default function ClaimsListPage() {
  const formatCurrency = useFormatCurrency();
  const [claims, setClaims] = useState<ClaimRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeStatus, setActiveStatus] = useState<Status | "ALL">("ALL");

  // Decision modal state
  const [decideClaim, setDecideClaim] = useState<ClaimRow | null>(null);
  const [decideOutcome, setDecideOutcome] = useState<"APPROVED" | "PARTIAL" | "DENIED">("APPROVED");
  const [decideAmount, setDecideAmount] = useState("");
  const [decideReason, setDecideReason] = useState("");
  const [decideReasonCode, setDecideReasonCode] = useState("");
  const [decideBusy, setDecideBusy] = useState(false);

  // v60 — Denial-reason taxonomy. Lazy-load: fetched the first time
  // a DENIED outcome is selected. Cached for the session.
  const [denialReasons, setDenialReasons] = useState<{ id: string; code: string; description: string; isCommon: boolean }[]>([]);

  // Pay modal
  const [payClaim, setPayClaim] = useState<ClaimRow | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payBusy, setPayBusy] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/claims", { credentials: "include" }).then((r) => r.json());
      if (res?.success && Array.isArray(res.data)) setClaims(res.data as ClaimRow[]);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const filtered = claims.filter((c) => {
    if (activeStatus !== "ALL" && c.status !== activeStatus) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    const hay = [
      c.claimNumber, c.invoice.invoiceNumber, c.insurance.provider,
      c.insurance.policyNumber, `${c.patient.firstName} ${c.patient.lastName}`,
      c.patient.patientCode, c.patient.phone || "",
    ].join(" ").toLowerCase();
    return hay.includes(q);
  });

  const totals = {
    claimed: claims.reduce((s, c) => s + num(c.claimedAmount), 0),
    approved: claims.reduce((s, c) => s + num(c.approvedAmount ?? 0), 0),
    paid: claims.reduce((s, c) => s + num(c.paidAmount), 0),
    open: claims.filter((c) => ["DRAFT", "SUBMITTED", "IN_REVIEW", "APPEALED"].includes(c.status)).length,
  };

  async function patch(id: string, body: Record<string, unknown>) {
    const res = await fetch(`/api/claims/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    }).then((r) => r.json());
    if (!res?.success) throw new Error(res?.error || "Update failed");
    return res.data;
  }

  async function submit(c: ClaimRow) {
    if (!confirm(`Submit claim ${c.claimNumber} to ${c.insurance.provider}?`)) return;
    try { await patch(c.id, { action: "submit" }); reload(); }
    catch (e) { alert(e instanceof Error ? e.message : "Failed"); }
  }
  async function review(c: ClaimRow) {
    try { await patch(c.id, { action: "review" }); reload(); }
    catch (e) { alert(e instanceof Error ? e.message : "Failed"); }
  }
  async function appeal(c: ClaimRow) {
    if (!confirm(`Appeal claim ${c.claimNumber}? Status moves back to APPEALED.`)) return;
    try { await patch(c.id, { action: "appeal" }); reload(); }
    catch (e) { alert(e instanceof Error ? e.message : "Failed"); }
  }
  async function cancel(c: ClaimRow) {
    const reason = prompt(`Cancel claim ${c.claimNumber}? Reason (optional):`) ?? null;
    if (reason === null) return;
    try { await patch(c.id, { action: "cancel", reason: reason || undefined }); reload(); }
    catch (e) { alert(e instanceof Error ? e.message : "Failed"); }
  }

  function openDecide(c: ClaimRow) {
    setDecideClaim(c);
    setDecideOutcome("APPROVED");
    setDecideAmount(String(num(c.claimedAmount)));
    setDecideReason("");
    setDecideReasonCode("");
    // Pre-fetch denial taxonomy if not loaded — even if the user
    // ends up picking APPROVED, the cost is small and switching
    // outcomes feels instant.
    if (denialReasons.length === 0) {
      fetch("/api/admin/denial-reasons?active=true", { credentials: "include" })
        .then((r) => r.json())
        .then((d) => {
          if (d?.success && Array.isArray(d.data)) setDenialReasons(d.data);
        })
        .catch(() => {});
    }
  }
  async function submitDecision() {
    if (!decideClaim) return;
    setDecideBusy(true);
    try {
      const body: Record<string, unknown> = { action: "decide", outcome: decideOutcome };
      if (decideOutcome === "DENIED") {
        if (!decideReason.trim()) { alert("Denial reason required"); setDecideBusy(false); return; }
        body.denialReason = decideReason.trim();
        if (decideReasonCode) body.denialReasonCodeId = decideReasonCode;
      } else {
        const n = parseFloat(decideAmount);
        if (!Number.isFinite(n) || n < 0) { alert("Approved amount must be a number ≥ 0"); setDecideBusy(false); return; }
        body.approvedAmount = n;
      }
      await patch(decideClaim.id, body);
      setDecideClaim(null);
      reload();
    } catch (e) { alert(e instanceof Error ? e.message : "Failed"); }
    finally { setDecideBusy(false); }
  }

  function openPay(c: ClaimRow) {
    setPayClaim(c);
    setPayAmount(String(num(c.approvedAmount ?? 0)));
  }
  async function submitPay() {
    if (!payClaim) return;
    setPayBusy(true);
    try {
      const n = parseFloat(payAmount);
      if (!Number.isFinite(n) || n <= 0) { alert("Paid amount must be > 0"); setPayBusy(false); return; }
      await patch(payClaim.id, { action: "pay", paidAmount: n });
      setPayClaim(null);
      reload();
    } catch (e) { alert(e instanceof Error ? e.message : "Failed"); }
    finally { setPayBusy(false); }
  }

  if (loading) {
    return <div className="flex items-center justify-center py-20"><LoadingSpinner size="lg" /></div>;
  }

  const statusCount = (s: Status | "ALL") =>
    s === "ALL" ? claims.length : claims.filter((c) => c.status === s).length;

  return (
    <div className="animate-fade-in space-y-5 sm:space-y-6" data-id="BILL-CLAIMS">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl border border-stone-100 bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-600 px-5 py-5 sm:px-7 sm:py-6 text-white">
        <div className="absolute inset-0 opacity-25 [background:radial-gradient(circle_at_30%_30%,#fff_0,transparent_45%)]" />
        <div className="relative flex items-start justify-between gap-4 flex-wrap">
          <div>
            <Link href="/billing" className="inline-flex items-center gap-1 text-[11px] uppercase tracking-wider opacity-90 hover:opacity-100 mb-1.5">
              <ArrowLeft className="w-3 h-3" /> Billing
            </Link>
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5" />
              <h1 className="text-xl sm:text-2xl font-semibold leading-tight">Insurance claims</h1>
            </div>
            <p className="text-sm opacity-90 mt-1 max-w-xl">
              Submit, track, and reconcile claims with payers. New claims are created from any invoice with active patient insurance.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/billing/reports/payers"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-white/15 border border-white/30 text-white hover:bg-white/25"
            >
              <FileText className="w-3.5 h-3.5" /> Payer reports
            </Link>
            <Button variant="outline" size="sm" iconLeft={<RefreshCw className="w-3.5 h-3.5" />}
              onClick={reload}
              className="!bg-white/15 !border-white/30 !text-white hover:!bg-white/25">
              Refresh
            </Button>
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard label="Open claims" value={String(totals.open)} icon={<Clock className="w-5 h-5" />} color="warning" />
        <StatCard label="Total claimed" value={formatCurrency(totals.claimed)} icon={<FileText className="w-5 h-5" />} color="primary" />
        <StatCard label="Approved" value={formatCurrency(totals.approved)} icon={<ShieldCheck className="w-5 h-5" />} color="info" />
        <StatCard label="Collected" value={formatCurrency(totals.paid)} icon={<ShieldCheck className="w-5 h-5" />} color="success" />
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-3">
        <SearchInput
          placeholder="Search claim #, invoice, patient, payer…"
          value={search}
          onChange={setSearch}
          className="w-full sm:max-w-sm"
        />
        <div className="flex flex-wrap gap-1.5">
          {(["ALL", ...STATUSES] as const).map((s) => (
            <button
              key={s}
              onClick={() => setActiveStatus(s)}
              className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-all cursor-pointer flex items-center gap-1 ${
                activeStatus === s
                  ? "bg-violet-600 text-white shadow-sm"
                  : "bg-stone-100 text-stone-500 hover:bg-stone-200"
              }`}
            >
              {s === "ALL" ? "All" : s}
              <span className={`text-[9px] font-semibold px-1 rounded ${
                activeStatus === s ? "bg-white/20" : "bg-white/80 text-stone-500"
              }`}>{statusCount(s)}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Rows */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-12 text-center">
          <ShieldCheck className="w-10 h-10 text-stone-200 mx-auto mb-3" />
          <p className="text-sm text-stone-500 font-medium">No claims match these filters</p>
          <p className="text-xs text-stone-400 mt-1">
            New claims are created from /billing → open an invoice → &quot;New claim&quot;.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-stone-100 shadow-sm overflow-hidden">
          <div className="hidden md:grid grid-cols-[1fr_1.4fr_1.4fr_0.9fr_1fr_1.6fr] gap-3 px-4 py-2.5 border-b border-stone-100 bg-stone-50/60 text-[10px] uppercase tracking-wider text-stone-400 font-semibold">
            <div>Claim</div>
            <div>Patient · Invoice</div>
            <div>Payer</div>
            <div>Status</div>
            <div className="text-right">Amounts</div>
            <div className="text-right pr-1">Actions</div>
          </div>

          <ul className="divide-y divide-stone-100">
            {filtered.map((c) => {
              const claimed = num(c.claimedAmount);
              const approved = num(c.approvedAmount ?? 0);
              const paid = num(c.paidAmount);
              const actions: React.ReactNode[] = [];
              const cancellable = !["PAID", "CANCELLED"].includes(c.status);
              if (c.status === "DRAFT") {
                actions.push(<Button key="submit" size="sm" variant="primary" onClick={() => submit(c)}>Submit</Button>);
              }
              if (c.status === "SUBMITTED") {
                actions.push(<Button key="review" size="sm" variant="outline" onClick={() => review(c)}>Mark in review</Button>);
                actions.push(<Button key="decide" size="sm" variant="primary" onClick={() => openDecide(c)}>Decide</Button>);
              }
              if (c.status === "IN_REVIEW" || c.status === "APPEALED") {
                actions.push(<Button key="decide" size="sm" variant="primary" onClick={() => openDecide(c)}>Decide</Button>);
              }
              if (c.status === "APPROVED" || c.status === "PARTIAL") {
                actions.push(<Button key="pay" size="sm" variant="primary" onClick={() => openPay(c)}>Mark paid</Button>);
              }
              if (c.status === "DENIED") {
                actions.push(<Button key="appeal" size="sm" variant="primary" onClick={() => appeal(c)}>Appeal</Button>);
              }
              if (cancellable) {
                actions.push(<Button key="cancel" size="sm" variant="outline" onClick={() => cancel(c)}>Cancel</Button>);
              }

              return (
                <li key={c.id} className="md:grid md:grid-cols-[1fr_1.4fr_1.4fr_0.9fr_1fr_1.6fr] md:gap-3 md:items-center px-4 py-3 hover:bg-stone-50/60 transition-colors">
                  <div className="mb-2 md:mb-0">
                    <p className="text-sm font-semibold text-stone-900">{c.claimNumber}</p>
                    <p className="text-[11px] text-stone-400">{formatDate(c.createdAt)}</p>
                  </div>
                  <div className="mb-1 md:mb-0 min-w-0">
                    <p className="text-sm text-stone-700 truncate">
                      {c.patient.firstName} {c.patient.lastName}
                      <span className="text-stone-400"> · {c.patient.patientCode}</span>
                    </p>
                    <p className="text-[11px] text-stone-500">
                      <Link href={`/billing/invoices/${c.invoice.invoiceNumber}`} className="hover:text-violet-600 underline-offset-2 hover:underline">
                        {c.invoice.invoiceNumber}
                      </Link>
                      <span className="text-stone-400"> · {formatCurrency(num(c.invoice.total))}</span>
                    </p>
                  </div>
                  <div className="mb-2 md:mb-0 min-w-0">
                    <p className="text-sm text-stone-700 truncate">{c.insurance.provider}</p>
                    <p className="text-[11px] text-stone-400 font-mono">{c.insurance.policyNumber}</p>
                  </div>
                  <div className="mb-2 md:mb-0">
                    <Badge variant={statusBadgeVariant(c.status)} dot>{c.status}</Badge>
                    {c.diagnosisCodes.length > 0 && (
                      <p className="text-[10px] text-stone-400 mt-1 font-mono">{c.diagnosisCodes.slice(0, 3).join(" · ")}</p>
                    )}
                  </div>
                  <div className="md:text-right mb-2 md:mb-0">
                    <p className="text-sm font-semibold text-stone-900 tabular-nums">{formatCurrency(claimed)}</p>
                    {approved > 0 && approved !== claimed && (
                      <p className="text-[11px] text-violet-600 tabular-nums">approved {formatCurrency(approved)}</p>
                    )}
                    {paid > 0 && (
                      <p className="text-[11px] text-emerald-600 tabular-nums">paid {formatCurrency(paid)}</p>
                    )}
                    {c.status === "DENIED" && c.denialReason && (
                      <p className="text-[11px] text-red-600 truncate max-w-[180px] md:ml-auto" title={c.denialReason}>
                        <AlertTriangle className="w-3 h-3 inline-block mr-1" />
                        {c.denialReason}
                      </p>
                    )}
                  </div>
                  <div className="flex md:justify-end items-center gap-1.5 flex-wrap">
                    {actions}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Decide modal */}
      {decideClaim && (
        <Modal
          isOpen
          onClose={() => setDecideClaim(null)}
          title={`Decide claim ${decideClaim.claimNumber}`}
          subtitle={`Claimed: ${formatCurrency(num(decideClaim.claimedAmount))} from ${decideClaim.insurance.provider}`}
        >
          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-2 block">Outcome</label>
              <div className="grid grid-cols-3 gap-2">
                {(["APPROVED", "PARTIAL", "DENIED"] as const).map((o) => (
                  <button
                    key={o}
                    onClick={() => {
                      setDecideOutcome(o);
                      if (o === "APPROVED") setDecideAmount(String(num(decideClaim.claimedAmount)));
                    }}
                    className={`py-2 px-3 rounded-xl border-2 text-xs font-semibold transition-all ${
                      decideOutcome === o
                        ? o === "DENIED" ? "border-red-400 bg-red-50 text-red-700" : "border-violet-400 bg-violet-50 text-violet-700"
                        : "border-stone-200 bg-white text-stone-500 hover:border-stone-300"
                    }`}
                  >
                    {o}
                  </button>
                ))}
              </div>
            </div>

            {decideOutcome !== "DENIED" ? (
              <div>
                <label className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-1.5 block">Approved amount (PKR)</label>
                <input
                  type="number"
                  value={decideAmount}
                  onChange={(e) => setDecideAmount(e.target.value)}
                  className="w-full px-4 py-2.5 text-sm bg-stone-50 border border-stone-200 rounded-xl outline-none focus:border-violet-500"
                  min="0"
                  step="0.01"
                  max={num(decideClaim.claimedAmount)}
                />
                <p className="text-[11px] text-stone-400 mt-1">
                  {decideOutcome === "APPROVED" ? "Must equal claimed amount." : `Must be 0 < amount < ${formatCurrency(num(decideClaim.claimedAmount))}.`}
                </p>
              </div>
            ) : (
              <>
                <div>
                  <label className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-1.5 block">
                    Denial code (optional)
                  </label>
                  <select
                    value={decideReasonCode}
                    onChange={(e) => {
                      const v = e.target.value;
                      setDecideReasonCode(v);
                      // If the user picks a structured code and the
                      // free-text is empty, copy the description across
                      // so the audit trail has both.
                      if (v && !decideReason.trim()) {
                        const r = denialReasons.find((x) => x.id === v);
                        if (r) setDecideReason(r.description);
                      }
                    }}
                    className="w-full px-4 py-2.5 text-sm bg-stone-50 border border-stone-200 rounded-xl outline-none focus:border-red-500"
                  >
                    <option value="">— No code (free-text only) —</option>
                    {denialReasons.length === 0 && <option disabled>Loading…</option>}
                    {denialReasons
                      .filter((r) => r.isCommon)
                      .map((r) => (
                        <option key={r.id} value={r.id}>{r.code} — {r.description}</option>
                      ))}
                    {denialReasons.some((r) => r.isCommon) && denialReasons.some((r) => !r.isCommon) && (
                      <option disabled>──────────</option>
                    )}
                    {denialReasons
                      .filter((r) => !r.isCommon)
                      .map((r) => (
                        <option key={r.id} value={r.id}>{r.code} — {r.description}</option>
                      ))}
                  </select>
                  <p className="text-[11px] text-stone-400 mt-1">
                    Picking a code makes payer reports able to group denials. Free-text below is still required.
                  </p>
                </div>
                <div>
                  <label className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-1.5 block">Denial reason (free text)</label>
                  <textarea
                    value={decideReason}
                    onChange={(e) => setDecideReason(e.target.value)}
                    rows={3}
                    className="w-full px-4 py-2.5 text-sm bg-stone-50 border border-stone-200 rounded-xl outline-none focus:border-red-500 resize-none"
                    placeholder="Why did the insurer deny this claim?"
                  />
                </div>
              </>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setDecideClaim(null)}>Cancel</Button>
              <Button size="sm" onClick={submitDecision} disabled={decideBusy}>
                {decideBusy ? "Saving…" : `Save ${decideOutcome}`}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Pay modal */}
      {payClaim && (
        <Modal
          isOpen
          onClose={() => setPayClaim(null)}
          title={`Mark ${payClaim.claimNumber} paid`}
          subtitle={`Approved: ${formatCurrency(num(payClaim.approvedAmount ?? 0))}`}
        >
          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-1.5 block">Amount paid by insurer (PKR)</label>
              <input
                type="number"
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                className="w-full px-4 py-2.5 text-sm bg-stone-50 border border-stone-200 rounded-xl outline-none focus:border-emerald-500"
                min="0"
                step="0.01"
                max={num(payClaim.approvedAmount ?? 0)}
              />
              <p className="text-[11px] text-stone-400 mt-1">
                Must be ≤ {formatCurrency(num(payClaim.approvedAmount ?? 0))} (approved amount).
              </p>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setPayClaim(null)}>Cancel</Button>
              <Button size="sm" onClick={submitPay} disabled={payBusy}>
                {payBusy ? "Saving…" : "Mark paid"}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
