/**
 * @system MediCore ERP — Updates dashboard
 * @route /admin/updates
 *
 * Single landing page for everything the clinic gets *from* patients
 * and the public website. Three tabs:
 *
 *   - Reviews     — feedback submitted via the receipt-QR review form
 *                   (local DB, see /api/admin/reviews)
 *   - Bookings    — booking-requests submitted on drnakhodas.com,
 *                   proxied via /api/admin/website-bookings
 *   - Messages    — contact-form submissions on drnakhodas.com,
 *                   proxied via /api/admin/website-messages
 *
 * Reviews land on whichever box hosts app.drnakhodas.com (currently
 * crm); the page surfaces a hint when it's empty on medical. The
 * external feeds work the same on either host since they go through
 * a server-side proxy.
 */
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Star,
  ThumbsUp,
  ThumbsDown,
  Filter,
  Loader2,
  Info,
  CalendarPlus,
  MessageSquare,
  Mail,
  Phone,
  ArrowLeft,
  ExternalLink,
  UserPlus,
} from "lucide-react";
import { Card, Badge } from "@/components/ui";

// ── shared helpers ────────────────────────────────────────────────

const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString("en-PK", {
    timeZone: "Asia/Karachi",
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: true,
  });

// ── types ─────────────────────────────────────────────────────────

interface Review {
  id: string;
  rating: number;
  feedback: string | null;
  wouldRecommend: boolean | null;
  pseudonym: string | null;
  submittedAt: string;
  appointment: {
    id: string;
    appointmentCode: string;
    date: string;
    doctorName: string | null;
    treatmentName: string | null;
  } | null;
  invoice: { id: string; invoiceNumber: string } | null;
  patient: { id: string; firstName: string; lastName: string; patientCode: string } | null;
}
interface ReviewSummary {
  count: number;
  averageRating: number;
  ratingDistribution: { rating: number; count: number }[];
  recommendYes: number;
  recommendNo: number;
  recommendPercent: number | null;
}

type CrmBookingStatus = "PENDING" | "CONTACTED" | "SCHEDULED" | "CLOSED" | "REJECTED";

interface WebsiteBooking {
  id: number;
  full_name: string;
  email: string;
  phone: string;
  service: string | null;
  status: string;
  created_at: string;
  // CRM-side override layered onto the upstream row.
  crmStatus: CrmBookingStatus;
  crmNotes: string | null;
  crmConvertedLeadId: string | null;
  crmUpdatedAt: string | null;
  crmUpdatedBy: { id: string; name: string } | null;
}

interface WebsiteMessage {
  id: number;
  full_name: string;
  email: string;
  phone: string;
  message: string;
  created_at: string;
  // CRM-side override: if non-null the message has been promoted to
  // a Lead (see WebsiteMessageOverride). Drives the "View lead" link
  // in place of the Convert button.
  crmConvertedLeadId: string | null;
}

type TabKey = "reviews" | "bookings" | "messages";

// ── page ──────────────────────────────────────────────────────────

export default function UpdatesPage() {
  const [tab, setTab] = useState<TabKey>("reviews");

  // On mount, mark this admin's lastUpdatesSeenAt = now() so the
  // sidebar badge clears. Best-effort — a 500 just leaves the badge
  // up which is recoverable.
  useEffect(() => {
    fetch("/api/admin/updates/seen", { method: "POST", credentials: "include" }).catch(() => {});
  }, []);

  // Counters per tab so the chip row shows "Bookings 3" etc. without
  // forcing the user to switch in just to find out. Setters are
  // wrapped in useCallback with [] deps so child useEffects don't see
  // a "new" callback every render — without this, each tab loops
  // fetch → setCount → parent re-render → new callback → re-fetch.
  const [counts, setCounts] = useState<{ reviews: number | null; bookings: number | null; messages: number | null }>({
    reviews: null, bookings: null, messages: null,
  });
  const onReviewsCount  = useCallback((c: number) => setCounts((s) => ({ ...s, reviews: c })),  []);
  const onBookingsCount = useCallback((c: number) => setCounts((s) => ({ ...s, bookings: c })), []);
  const onMessagesCount = useCallback((c: number) => setCounts((s) => ({ ...s, messages: c })), []);

  return (
    <div className="space-y-5">
      <div>
        <Link href="/dashboard" className="text-xs text-stone-500 hover:text-teal-600 inline-flex items-center gap-1">
          <ArrowLeft className="w-3 h-3" /> Dashboard
        </Link>
        <h1 className="text-2xl font-bold text-stone-900 mt-1">Updates</h1>
        <p className="text-sm text-stone-500">
          Patient reviews, booking requests, and contact messages.
        </p>
      </div>

      {/* Tab strip */}
      <div className="flex items-center gap-1.5 flex-wrap border-b border-stone-200 pb-0">
        {([
          { k: "reviews",  label: "Reviews",  icon: Star },
          { k: "bookings", label: "Bookings", icon: CalendarPlus },
          { k: "messages", label: "Messages", icon: MessageSquare },
        ] as const).map(({ k, label, icon: Icon }) => {
          const active = tab === k;
          const count = counts[k];
          return (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`relative -mb-px px-3.5 py-2 text-sm font-medium transition-colors cursor-pointer inline-flex items-center gap-1.5 border-b-2 ${
                active
                  ? "text-teal-700 border-teal-600"
                  : "text-stone-500 hover:text-stone-800 border-transparent"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
              {count !== null && count > 0 && (
                <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${active ? "bg-teal-100 text-teal-700" : "bg-stone-100 text-stone-600"}`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {tab === "reviews"  && <ReviewsTab  onCount={onReviewsCount}  />}
      {tab === "bookings" && <BookingsTab onCount={onBookingsCount} />}
      {tab === "messages" && <MessagesTab onCount={onMessagesCount} />}
    </div>
  );
}

// ── Reviews tab ───────────────────────────────────────────────────

function ReviewsTab({ onCount }: { onCount: (n: number) => void }) {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [summary, setSummary] = useState<ReviewSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ratingFilter, setRatingFilter] = useState<number | "all">("all");

  const [host, setHost] = useState("");
  useEffect(() => { if (typeof window !== "undefined") setHost(window.location.host); }, []);
  const isMedicalHost = host.includes("medical.scalamatic.com");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const params = new URLSearchParams();
    if (ratingFilter !== "all") params.set("rating", String(ratingFilter));
    params.set("limit", "100");

    fetch(`/api/admin/reviews?${params.toString()}`, { credentials: "include" })
      .then((r) => r.json())
      .then((d: { success: boolean; data?: Review[]; summary?: ReviewSummary; error?: string }) => {
        if (cancelled) return;
        if (!d.success) {
          setError(d.error || "Failed to load reviews");
          return;
        }
        setReviews(d.data || []);
        setSummary(d.summary || null);
        if (d.summary) onCount(d.summary.count);
        setError(null);
      })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : "Failed"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [ratingFilter, onCount]);

  const maxBucket = useMemo(() => {
    if (!summary) return 0;
    return Math.max(1, ...summary.ratingDistribution.map((r) => r.count));
  }, [summary]);

  return (
    <div className="space-y-5">
      {isMedicalHost && summary && summary.count === 0 && !loading && (
        <Card padding="md" className="border-l-4 border-l-amber-400 bg-amber-50">
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="flex-1 text-sm">
              <p className="font-semibold text-amber-900">No reviews on this box.</p>
              <p className="text-amber-800 mt-0.5">
                Reviews are submitted at <span className="font-mono">app.drnakhodas.com</span>{" "}
                which writes to <span className="font-mono">crm.drnakhodas.com</span>&apos;s database.
                Open this page on{" "}
                <a href="https://crm.drnakhodas.com/admin/updates" className="font-semibold underline hover:text-amber-700">
                  crm.drnakhodas.com
                </a>{" "}
                to see live data.
              </p>
            </div>
          </div>
        </Card>
      )}

      {summary && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Card padding="md">
            <p className="text-[10px] uppercase tracking-wider text-stone-400 font-semibold">Total reviews</p>
            <p className="mt-1 text-3xl font-bold text-stone-900">{summary.count}</p>
            <p className="mt-0.5 text-xs text-stone-500">all-time submissions</p>
          </Card>
          <Card padding="md">
            <p className="text-[10px] uppercase tracking-wider text-stone-400 font-semibold">Average rating</p>
            <div className="mt-1 flex items-baseline gap-2">
              <p className="text-3xl font-bold text-stone-900">
                {summary.count > 0 ? summary.averageRating.toFixed(1) : "—"}
              </p>
              {summary.count > 0 && (
                <div className="flex items-center gap-0.5">
                  {[1,2,3,4,5].map((n) => (
                    <Star key={n} className={`w-3.5 h-3.5 ${n <= Math.round(summary.averageRating) ? "text-amber-400 fill-amber-400" : "text-stone-200"}`} />
                  ))}
                </div>
              )}
            </div>
            <p className="mt-0.5 text-xs text-stone-500">across {summary.count} reviews</p>
          </Card>
          <Card padding="md">
            <p className="text-[10px] uppercase tracking-wider text-stone-400 font-semibold">Would recommend</p>
            <p className="mt-1 text-3xl font-bold text-stone-900">
              {summary.recommendPercent !== null ? `${summary.recommendPercent.toFixed(0)}%` : "—"}
            </p>
            <p className="mt-0.5 text-xs text-stone-500">
              {summary.recommendYes} yes · {summary.recommendNo} no
            </p>
          </Card>
        </div>
      )}

      {summary && summary.count > 0 && (
        <Card padding="md">
          <p className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-3">Rating distribution</p>
          <div className="space-y-1.5">
            {[5,4,3,2,1].map((rating) => {
              const bucket = summary.ratingDistribution.find((b) => b.rating === rating);
              const count = bucket?.count ?? 0;
              const pct = (count / maxBucket) * 100;
              return (
                <div key={rating} className="flex items-center gap-3 text-sm">
                  <span className="w-12 inline-flex items-center gap-1 text-stone-600">
                    <span className="font-semibold">{rating}</span>
                    <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
                  </span>
                  <div className="flex-1 h-2 bg-stone-100 rounded-full overflow-hidden">
                    <div className="h-full bg-amber-400" style={{ width: count > 0 ? `${Math.max(pct, 4)}%` : "0%" }} />
                  </div>
                  <span className="w-10 text-right text-xs text-stone-500 font-mono">{count}</span>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <Filter className="w-4 h-4 text-stone-400" />
        <span className="text-xs uppercase tracking-wider text-stone-400 font-semibold">Filter:</span>
        {(["all", 5, 4, 3, 2, 1] as const).map((opt) => (
          <button
            key={opt}
            onClick={() => setRatingFilter(opt)}
            className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors cursor-pointer border ${
              ratingFilter === opt
                ? "bg-teal-600 text-white border-teal-600"
                : "bg-white text-stone-600 border-stone-200 hover:border-stone-300"
            }`}
          >
            {opt === "all" ? "All" : `${opt} ★`}
          </button>
        ))}
      </div>

      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 text-teal-600 animate-spin" />
        </div>
      )}
      {error && !loading && (
        <Card padding="md" className="border-l-4 border-l-red-400 bg-red-50 text-red-800 text-sm">{error}</Card>
      )}
      {!loading && !error && reviews.length === 0 && (
        <Card padding="md" className="text-center py-10">
          <p className="text-sm text-stone-500">
            No reviews{ratingFilter !== "all" ? " match this filter" : " yet"}.
          </p>
        </Card>
      )}
      {!loading && reviews.length > 0 && (
        <div className="space-y-3">
          {reviews.map((r) => (
            <Card key={r.id} padding="md">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="flex items-center gap-0.5">
                      {[1,2,3,4,5].map((n) => (
                        <Star key={n} className={`w-4 h-4 ${n <= r.rating ? "text-amber-400 fill-amber-400" : "text-stone-200"}`} />
                      ))}
                    </div>
                    {r.wouldRecommend === true && (
                      <Badge variant="success" className="inline-flex items-center gap-1 text-[10px]">
                        <ThumbsUp className="w-3 h-3" /> Recommends
                      </Badge>
                    )}
                    {r.wouldRecommend === false && (
                      <Badge variant="danger" className="inline-flex items-center gap-1 text-[10px]">
                        <ThumbsDown className="w-3 h-3" /> Would not
                      </Badge>
                    )}
                    <span className="text-xs text-stone-400">{fmtDateTime(r.submittedAt)}</span>
                  </div>
                  <p className="mt-1.5 text-sm font-semibold text-stone-900">
                    {r.pseudonym || <span className="text-stone-400 italic font-normal">Anonymous</span>}
                  </p>
                  {r.feedback && (
                    <p className="mt-1.5 text-sm text-stone-700 leading-relaxed whitespace-pre-wrap">
                      {r.feedback}
                    </p>
                  )}
                </div>
              </div>

              {(r.patient || r.appointment || r.invoice) && (
                <div className="mt-3 pt-3 border-t border-stone-100 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-stone-500">
                  {r.patient && (
                    <Link href={`/patients/${r.patient.id}`} className="inline-flex items-center gap-1 hover:text-teal-600">
                      <span className="font-semibold text-stone-700">{r.patient.firstName} {r.patient.lastName}</span>
                      <span className="font-mono text-[10px]">{r.patient.patientCode}</span>
                    </Link>
                  )}
                  {r.appointment && (
                    <span className="inline-flex items-center gap-1">
                      <span className="font-mono">{r.appointment.appointmentCode}</span>
                      {r.appointment.doctorName && <span>· {r.appointment.doctorName}</span>}
                      {r.appointment.treatmentName && <span>· {r.appointment.treatmentName}</span>}
                    </span>
                  )}
                  {r.invoice && (
                    <Link href={`/billing/invoices/${r.invoice.id}`} className="inline-flex items-center gap-1 font-mono hover:text-teal-600">
                      {r.invoice.invoiceNumber} <ExternalLink className="w-3 h-3" />
                    </Link>
                  )}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Bookings tab (drnakhodas.com booking-form submissions) ───────

const CRM_STATUS_TONE: Record<CrmBookingStatus, string> = {
  PENDING:   "bg-amber-100 text-amber-800",
  CONTACTED: "bg-blue-100 text-blue-800",
  SCHEDULED: "bg-emerald-100 text-emerald-800",
  CLOSED:    "bg-stone-100 text-stone-600",
  REJECTED:  "bg-red-100 text-red-700",
};
const CRM_STATUS_LABELS: Record<CrmBookingStatus, string> = {
  PENDING:   "Pending",
  CONTACTED: "Contacted",
  SCHEDULED: "Scheduled",
  CLOSED:    "Closed",
  REJECTED:  "Rejected",
};
const CRM_STATUS_OPTIONS: CrmBookingStatus[] = ["PENDING", "CONTACTED", "SCHEDULED", "CLOSED", "REJECTED"];

function BookingsTab({ onCount }: { onCount: (n: number) => void }) {
  const [rows, setRows] = useState<WebsiteBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // "all" | one of CrmBookingStatus. Defaults to all so the agent
  // sees the full inbox; once they start triaging they typically
  // pin to PENDING.
  const [statusFilter, setStatusFilter] = useState<CrmBookingStatus | "all">("all");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch("/api/admin/website-bookings", { credentials: "include" })
      .then((r) => r.json())
      .then((d: { success: boolean; data?: WebsiteBooking[]; error?: string }) => {
        if (cancelled) return;
        if (!d.success) { setError(d.error || "Failed to load"); return; }
        const list = d.data || [];
        setRows(list);
        onCount(list.length);
      })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : "Failed"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [onCount]);

  // Optimistic update for one row's CRM status / notes. The dropdown
  // and notes input write through this — server is canonical, but we
  // mutate locally first so the UI feels instant.
  const updateRow = useCallback((upstreamId: number, patch: Partial<WebsiteBooking>) => {
    setRows((cur) => cur.map((r) => (r.id === upstreamId ? { ...r, ...patch } : r)));
  }, []);

  // Per-status counts for the filter chips. Computed off the
  // already-loaded list so the UI stays static after the first
  // fetch.
  const statusCounts = useMemo(() => {
    const map: Record<CrmBookingStatus, number> = { PENDING: 0, CONTACTED: 0, SCHEDULED: 0, CLOSED: 0, REJECTED: 0 };
    for (const r of rows) map[r.crmStatus] = (map[r.crmStatus] ?? 0) + 1;
    return map;
  }, [rows]);

  const filtered = statusFilter === "all"
    ? rows
    : rows.filter((r) => r.crmStatus === statusFilter);

  if (loading) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 text-teal-600 animate-spin" /></div>;
  }
  if (error) {
    return <Card padding="md" className="border-l-4 border-l-red-400 bg-red-50 text-red-800 text-sm">{error}</Card>;
  }
  if (rows.length === 0) {
    return (
      <Card padding="md" className="text-center py-10">
        <p className="text-sm text-stone-500">No booking requests from the website yet.</p>
        <p className="text-xs text-stone-400 mt-1">Source: drnakhodas.com /api/appointments</p>
      </Card>
    );
  }
  return (
    <div className="space-y-3">
      {/* Filter chips — All + each status with a count */}
      <div className="flex items-center gap-2 flex-wrap">
        <Filter className="w-4 h-4 text-stone-400" />
        <span className="text-xs uppercase tracking-wider text-stone-400 font-semibold">Filter:</span>
        <button
          onClick={() => setStatusFilter("all")}
          className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors cursor-pointer border ${
            statusFilter === "all"
              ? "bg-teal-600 text-white border-teal-600"
              : "bg-white text-stone-600 border-stone-200 hover:border-stone-300"
          }`}
        >
          All <span className="opacity-60 ml-0.5">({rows.length})</span>
        </button>
        {CRM_STATUS_OPTIONS.map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors cursor-pointer border ${
              statusFilter === s
                ? "bg-teal-600 text-white border-teal-600"
                : "bg-white text-stone-600 border-stone-200 hover:border-stone-300"
            }`}
          >
            {CRM_STATUS_LABELS[s]} <span className="opacity-60 ml-0.5">({statusCounts[s]})</span>
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <Card padding="md" className="text-center py-8">
          <p className="text-sm text-stone-500">
            No bookings in &ldquo;{CRM_STATUS_LABELS[statusFilter as CrmBookingStatus]}&rdquo;.
          </p>
        </Card>
      ) : (
        filtered.map((b) => (
          <BookingCard key={b.id} booking={b} onUpdate={updateRow} />
        ))
      )}
    </div>
  );
}

function BookingCard({
  booking,
  onUpdate,
}: {
  booking: WebsiteBooking;
  onUpdate: (upstreamId: number, patch: Partial<WebsiteBooking>) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draftNotes, setDraftNotes] = useState(booking.crmNotes || "");
  const [saving, setSaving] = useState(false);
  const [converting, setConverting] = useState(false);
  // Captured leadId after a fresh convert in this session. Falls
  // back to the persisted FK from the override row (v30+) so the
  // "✓ View lead" link survives a page refresh.
  const [optimisticLeadId, setOptimisticLeadId] = useState<string | null>(null);
  const convertedLeadId = optimisticLeadId ?? booking.crmConvertedLeadId;
  const [err, setErr] = useState<string | null>(null);

  // Once a booking has been converted (or otherwise closed), the
  // upstream record is "done" from the CRM's perspective. We disable
  // the convert button to prevent doubles.
  const isConverted = booking.crmStatus === "CLOSED" || convertedLeadId !== null;

  async function convertToLead() {
    if (converting || isConverted) return;
    setConverting(true);
    setErr(null);
    try {
      const r = await fetch(`/api/admin/website-bookings/${booking.id}/convert`, {
        method: "POST",
        credentials: "include",
      });
      const d = await r.json();
      if (!d.success) {
        setErr(d.error || "Convert failed");
        return;
      }
      setOptimisticLeadId(d.data.leadId);
      onUpdate(booking.id, {
        crmStatus: "CLOSED",
        crmConvertedLeadId: d.data.leadId,
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Convert failed");
    } finally {
      setConverting(false);
    }
  }

  async function save(nextStatus: CrmBookingStatus, nextNotes: string | null) {
    setSaving(true);
    setErr(null);
    try {
      const r = await fetch(`/api/admin/website-bookings/${booking.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status: nextStatus, notes: nextNotes }),
      });
      const d = await r.json();
      if (!d.success) {
        setErr(d.error || "Save failed");
        return;
      }
      onUpdate(booking.id, {
        crmStatus: d.data.status,
        crmNotes: d.data.notes,
        crmUpdatedAt: d.data.updatedAt,
        crmUpdatedBy: d.data.updatedBy,
      });
      setEditing(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card padding="md">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-base font-semibold text-stone-900">{booking.full_name}</p>
            <select
              value={booking.crmStatus}
              onChange={(e) => save(e.target.value as CrmBookingStatus, draftNotes.trim() || null)}
              disabled={saving}
              className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider cursor-pointer border-0 ${CRM_STATUS_TONE[booking.crmStatus]}`}
            >
              {CRM_STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>{CRM_STATUS_LABELS[s]}</option>
              ))}
            </select>
            {saving && <Loader2 className="w-3 h-3 animate-spin text-stone-400" />}
          </div>
          {booking.service && (
            <p className="text-sm text-stone-700 mt-0.5">
              Wants: <span className="font-medium">{booking.service}</span>
            </p>
          )}
          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-stone-500">
            {booking.email && (
              <a href={`mailto:${booking.email}`} className="inline-flex items-center gap-1 hover:text-teal-600">
                <Mail className="w-3 h-3" /> {booking.email}
              </a>
            )}
            {booking.phone && (
              <a href={`tel:${booking.phone}`} className="inline-flex items-center gap-1 hover:text-teal-600 font-mono">
                <Phone className="w-3 h-3" /> {booking.phone}
              </a>
            )}
          </div>
        </div>
        <div className="shrink-0 flex flex-col items-end gap-1.5">
          <span className="text-xs text-stone-400">{fmtDateTime(booking.created_at)}</span>
          {/* Convert → CRM lead. Disabled once the row has been
              closed (already converted or otherwise actioned). After
              a fresh convert, swap the button for a "View lead"
              link so the agent can jump straight to the kanban. */}
          {convertedLeadId ? (
            <Link
              href="/call-center"
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 hover:underline"
            >
              ✓ View lead in pipeline →
            </Link>
          ) : (
            <button
              onClick={convertToLead}
              disabled={converting || isConverted}
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-teal-700 hover:text-teal-900 disabled:text-stone-300 disabled:cursor-not-allowed cursor-pointer"
              title={isConverted ? "Already actioned" : "Promote to a lead in the call-center pipeline"}
            >
              {converting ? <Loader2 className="w-3 h-3 animate-spin" /> : <UserPlus className="w-3 h-3" />}
              {converting ? "Converting…" : "Convert to lead"}
            </button>
          )}
        </div>
      </div>

      {/* Notes — collapsed when empty + not editing, otherwise inline */}
      {(booking.crmNotes || editing) && (
        <div className="mt-3 pt-3 border-t border-stone-100">
          {editing ? (
            <>
              <textarea
                value={draftNotes}
                onChange={(e) => setDraftNotes(e.target.value.slice(0, 2000))}
                placeholder="Follow-up note (e.g. left voicemail, called back at 4pm…)"
                rows={3}
                className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
              <div className="mt-2 flex items-center justify-end gap-2">
                <button
                  onClick={() => { setEditing(false); setDraftNotes(booking.crmNotes || ""); setErr(null); }}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-stone-600 hover:bg-stone-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={() => save(booking.crmStatus, draftNotes.trim() || null)}
                  disabled={saving}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50 cursor-pointer"
                >
                  {saving ? "Saving…" : "Save note"}
                </button>
              </div>
            </>
          ) : (
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm text-stone-700 whitespace-pre-wrap flex-1">{booking.crmNotes}</p>
              <button
                onClick={() => setEditing(true)}
                className="text-xs text-teal-600 font-medium hover:underline shrink-0 cursor-pointer"
              >
                Edit
              </button>
            </div>
          )}
        </div>
      )}
      {!booking.crmNotes && !editing && (
        <button
          onClick={() => setEditing(true)}
          className="mt-2 text-xs text-stone-500 hover:text-teal-600 cursor-pointer"
        >
          + Add follow-up note
        </button>
      )}

      {booking.crmUpdatedBy && booking.crmUpdatedAt && (
        <p className="mt-2 text-[10px] text-stone-400">
          Last update by {booking.crmUpdatedBy.name} · {fmtDateTime(booking.crmUpdatedAt)}
        </p>
      )}
      {err && <p className="mt-2 text-xs text-red-600">{err}</p>}
    </Card>
  );
}

// ── Messages tab (drnakhodas.com contact-form submissions) ───────

function MessagesTab({ onCount }: { onCount: (n: number) => void }) {
  const [rows, setRows] = useState<WebsiteMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch("/api/admin/website-messages", { credentials: "include" })
      .then((r) => r.json())
      .then((d: { success: boolean; data?: WebsiteMessage[]; error?: string }) => {
        if (cancelled) return;
        if (!d.success) { setError(d.error || "Failed to load"); return; }
        const list = d.data || [];
        setRows(list);
        onCount(list.length);
      })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : "Failed"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [onCount]);

  const updateRow = useCallback((upstreamId: number, patch: Partial<WebsiteMessage>) => {
    setRows((cur) => cur.map((r) => (r.id === upstreamId ? { ...r, ...patch } : r)));
  }, []);

  if (loading) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 text-teal-600 animate-spin" /></div>;
  }
  if (error) {
    return <Card padding="md" className="border-l-4 border-l-red-400 bg-red-50 text-red-800 text-sm">{error}</Card>;
  }
  if (rows.length === 0) {
    return (
      <Card padding="md" className="text-center py-10">
        <p className="text-sm text-stone-500">No contact-form messages from the website yet.</p>
        <p className="text-xs text-stone-400 mt-1">Source: drnakhodas.com /api/messages</p>
      </Card>
    );
  }
  return (
    <div className="space-y-3">
      {rows.map((m) => (
        <MessageCard key={m.id} message={m} onUpdate={updateRow} />
      ))}
    </div>
  );
}

function MessageCard({
  message,
  onUpdate,
}: {
  message: WebsiteMessage;
  onUpdate: (upstreamId: number, patch: Partial<WebsiteMessage>) => void;
}) {
  const [converting, setConverting] = useState(false);
  const [optimisticLeadId, setOptimisticLeadId] = useState<string | null>(null);
  const convertedLeadId = optimisticLeadId ?? message.crmConvertedLeadId;
  const [err, setErr] = useState<string | null>(null);

  async function convertToLead() {
    if (converting || convertedLeadId) return;
    setConverting(true);
    setErr(null);
    try {
      const r = await fetch(`/api/admin/website-messages/${message.id}/convert`, {
        method: "POST",
        credentials: "include",
      });
      const d = await r.json();
      if (!d.success) {
        setErr(d.error || "Convert failed");
        return;
      }
      setOptimisticLeadId(d.data.leadId);
      onUpdate(message.id, { crmConvertedLeadId: d.data.leadId });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Convert failed");
    } finally {
      setConverting(false);
    }
  }

  return (
    <Card padding="md">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <p className="text-base font-semibold text-stone-900">{message.full_name}</p>
        </div>
        <div className="shrink-0 flex flex-col items-end gap-1.5">
          <span className="text-xs text-stone-400">{fmtDateTime(message.created_at)}</span>
          {convertedLeadId ? (
            <Link
              href="/call-center"
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 hover:underline"
            >
              ✓ View lead in pipeline →
            </Link>
          ) : (
            <button
              onClick={convertToLead}
              disabled={converting}
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-teal-700 hover:text-teal-900 disabled:text-stone-300 disabled:cursor-not-allowed cursor-pointer"
              title="Promote this contact-form submission into the call-center pipeline"
            >
              {converting ? <Loader2 className="w-3 h-3 animate-spin" /> : <UserPlus className="w-3 h-3" />}
              {converting ? "Converting…" : "Convert to lead"}
            </button>
          )}
        </div>
      </div>
      <p className="mt-2 text-sm text-stone-700 leading-relaxed whitespace-pre-wrap">{message.message}</p>
      <div className="mt-3 pt-3 border-t border-stone-100 flex flex-wrap gap-x-4 gap-y-1 text-xs text-stone-500">
        {message.email && (
          <a href={`mailto:${message.email}`} className="inline-flex items-center gap-1 hover:text-teal-600">
            <Mail className="w-3 h-3" /> {message.email}
          </a>
        )}
        {message.phone && (
          <a href={`tel:${message.phone}`} className="inline-flex items-center gap-1 hover:text-teal-600 font-mono">
            <Phone className="w-3 h-3" /> {message.phone}
          </a>
        )}
      </div>
      {err && <p className="mt-2 text-xs text-red-600">{err}</p>}
    </Card>
  );
}
