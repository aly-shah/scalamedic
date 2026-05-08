"use client";

/**
 * Call Center — main dashboard
 *
 * Modernized to match the rest of the admin pages:
 *   - Gradient hero (indigo → violet → fuchsia, matching calendar's
 *     purple-family for the "communication/voice" surfaces)
 *   - StatCards driven by real counts (today's calls excludes WhatsApp
 *     pings against ringing-only events to avoid inflating the figure)
 *   - SearchInput for the patient lookup, with debouncing built in
 *   - Quick-search now actually wires Call (tel: link) + Book (jumps to
 *     calendar with prefilled patient) instead of decorative buttons
 *   - "No matches" empty state offers a one-click "Create as new lead"
 *     instead of a passive sentence
 *
 * Live call panel + callback queue + lead kanban are unchanged — they
 * already render their own surfaces.
 */
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Phone, PhoneCall, UserPlus, CalendarPlus, Headphones, Download,
  PhoneIncoming, PhoneOutgoing, PhoneMissed, Users, ArrowRight, Clock, ExternalLink,
  MessageCircle,
} from "lucide-react";
import { Button, Card, StatCard, Avatar, Badge, SearchInput } from "@/components/ui";
import { LoadingSpinner } from "@/components/ui/loading";
import { LeadStatus } from "@/types";
import { getClinicToday, timeAgo } from "@/lib/utils";
import { useModuleAccess } from "@/modules/core/hooks";
import { useLeads, useCallLogs, usePatients } from "@/hooks/use-queries";
import { useQuery } from "@tanstack/react-query";
import { NewLeadModal } from "@/components/call-center/new-lead-modal";
import { AddPatientModal } from "@/components/patients/add-patient-modal";
import { LiveCallPanel } from "@/components/call-center/live-call-panel";
import { CallbackQueue } from "@/components/call-center/callback-queue";
import { LeadKanban } from "@/components/call-center/lead-kanban";
import { downloadCSV } from "@/lib/export";

// /api/patients returns nested patient objects; defensive accessor in
// case any caller leaves firstName off the row (the search index
// includes a few legacy walk-in records with a single `name` field).
type PatientRow = { id: string; firstName: string; lastName: string; phone: string };

export default function CallCenterPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20"><LoadingSpinner size="lg" /></div>}>
      <CallCenterPageInner />
    </Suspense>
  );
}

function CallCenterPageInner() {
  const router = useRouter();
  const access = useModuleAccess("MOD-COMMUNICATION");

  const [search, setSearch] = useState("");
  const [showNewLeadModal, setShowNewLeadModal] = useState(false);
  const [showAddPatientModal, setShowAddPatientModal] = useState(false);
  // Pre-fill payload for the New Lead panel — set by the recent-calls
  // "Convert to lead" button so the agent doesn't re-type the phone.
  const [leadPrefill, setLeadPrefill] = useState<{ name?: string; phone?: string; source?: string; notes?: string } | undefined>();
  // Same for the Add Patient panel (Convert to patient flow).
  const [patientPrefill, setPatientPrefill] = useState<{ firstName?: string; lastName?: string; phone?: string } | undefined>();

  // Recent calls — same source the workspace dashboard polls. Auto-
  // refreshes every 15s so a fresh call appears without a hard reload.
  const { data: recentCallsRes } = useQuery({
    queryKey: ["calls", "recent", "call-center-page"],
    queryFn: () => fetch("/api/calls/recent?limit=12", { credentials: "include" }).then((r) => r.json()),
    refetchInterval: 15000,
  });
  const recentCalls = (recentCallsRes?.data || []) as Array<{
    // "call" rows come from call_logs (phone). "whatsapp" rows come
    // from communication_logs (WhatsApp inbound). Same shape, two
    // channels — the UI picks the channel badge off `kind`.
    kind: "call" | "whatsapp";
    id: string;
    type?: string;          // "INBOUND" | "OUTBOUND" | "MISSED"
    outcome?: string | null;
    notes?: string | null;
    content?: string | null; // WhatsApp message body
    duration?: number | null;
    createdAt: string;
    lead?: { id: string; name: string; phone: string; status: string } | null;
    patient?: { id: string; firstName: string; lastName: string; patientCode: string; phone?: string | null } | null;
    user?: { id: string; name: string } | null;
    phone?: string | null;
  }>;

  const { data: leadsResponse, isLoading: isLoadingLeads } = useLeads();
  const leads = (leadsResponse?.data || []) as Array<{ id: string; name: string; phone: string; email?: string; status: string; interest: string; source: string; notes?: string; callbackDate?: string; createdAt: string }>;

  const { data: callLogsResponse, isLoading: isLoadingCallLogs } = useCallLogs();
  const callLogs = (callLogsResponse?.data || []) as Array<{ id: string; createdAt?: string }>;

  const { data: patientsResponse, isLoading: isLoadingPatients } = usePatients();
  const allPatients = (patientsResponse?.data || []) as PatientRow[];

  // Live filter — debouncing isn't needed here since we're filtering an
  // in-memory list; the cost is a single .filter on a few thousand rows.
  const q = search.trim().toLowerCase();
  const matches = q
    ? allPatients.filter(
        (p) =>
          (p.phone || "").includes(q) ||
          (p.firstName || "").toLowerCase().includes(q) ||
          (p.lastName || "").toLowerCase().includes(q),
      ).slice(0, 25) // cap so a single-letter search doesn't dump 5,000 rows
    : [];

  // Pipeline KPIs (lifetime backlog by status — funnel snapshot).
  const newLeads = leads.filter((l) => l.status === LeadStatus.NEW).length;
  const interested = leads.filter((l) => l.status === LeadStatus.INTERESTED).length;
  const booked = leads.filter((l) => l.status === LeadStatus.BOOKED).length;

  // "Calls today" was counting the lifetime call log. Filter to PKT
  // today using en-CA which formats as YYYY-MM-DD — same shape as
  // getClinicToday() returns, so the comparison is a string equality.
  const todayKey = getClinicToday();
  const todayCalls = callLogs.filter((c) => {
    if (!c.createdAt) return false;
    const d = new Date(c.createdAt);
    if (Number.isNaN(d.getTime())) return false;
    const k = d.toLocaleString("en-CA", {
      timeZone: "Asia/Karachi",
      year: "numeric", month: "2-digit", day: "2-digit",
    });
    return k === todayKey;
  }).length;

  if (isLoadingLeads || isLoadingCallLogs || isLoadingPatients) {
    return <div className="flex items-center justify-center py-20"><LoadingSpinner size="lg" /></div>;
  }
  if (!access.canView) {
    return (
      <div className="flex items-center justify-center py-20 text-stone-500">
        You don&apos;t have access to this module.
      </div>
    );
  }

  return (
    <div data-id="CALL-LOOKUP" className="space-y-5 sm:space-y-6 animate-fade-in">
      {/* ===== HERO ===== */}
      <div className="relative overflow-hidden rounded-2xl border border-stone-100 bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-600 px-5 py-5 sm:px-7 sm:py-6 text-white">
        <div className="absolute inset-0 opacity-25 [background:radial-gradient(circle_at_30%_30%,#fff_0,transparent_45%)]" />
        <div className="relative flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <Headphones className="w-4 h-4" />
              <span className="text-[11px] uppercase tracking-wider font-semibold opacity-90">Call Center</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-semibold leading-tight">Look up, book, follow up.</h1>
            <p className="text-sm opacity-90 mt-1 max-w-xl">
              Find a patient by phone or name, kick off a call, or convert an inbound enquiry into a lead.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              iconLeft={<Download className="w-3.5 h-3.5" />}
              onClick={() => downloadCSV(
                leads.map((l) => ({
                  Name: l.name, Phone: l.phone, Email: l.email || "",
                  Status: l.status, Interest: l.interest, Source: l.source,
                  Callback: l.callbackDate || "", Created: l.createdAt,
                })),
                "leads",
              )}
              className="!bg-white/15 !border-white/30 !text-white hover:!bg-white/25"
            >
              Export leads
            </Button>
            <Button
              size="sm"
              iconLeft={<UserPlus className="w-3.5 h-3.5" />}
              onClick={() => { setLeadPrefill(undefined); setShowNewLeadModal(true); }}
              className="!bg-white !text-violet-700 hover:!bg-stone-50"
            >
              New lead
            </Button>
          </div>
        </div>
      </div>

      {/* ===== KPI CARDS ===== */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard label="New leads" value={newLeads} icon={<UserPlus className="w-5 h-5" />} color="primary" />
        <StatCard label="Interested" value={interested} icon={<Phone className="w-5 h-5" />} color="warning" />
        <StatCard label="Booked" value={booked} icon={<CalendarPlus className="w-5 h-5" />} color="success" />
        <StatCard label="Calls today" value={todayCalls} icon={<PhoneIncoming className="w-5 h-5" />} color="info" />
      </div>

      {/* ===== QUICK PATIENT LOOKUP ===== */}
      <Card padding="lg">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-base font-semibold text-stone-900">Quick patient lookup</h2>
            <p className="text-xs text-stone-500 mt-0.5">Type a phone number or name to find a patient. Results appear as you type.</p>
          </div>
          <span className="text-xs text-stone-400">{allPatients.length.toLocaleString()} patients</span>
        </div>

        <SearchInput
          placeholder="Search by phone or name…"
          value={search}
          onChange={setSearch}
        />

        {q && (
          <div className="mt-3">
            {matches.length === 0 ? (
              <div className="text-center py-6 border border-dashed border-stone-200 rounded-2xl">
                <Users className="w-8 h-8 text-stone-300 mx-auto mb-2" />
                <p className="text-sm font-medium text-stone-700">No patients found for &ldquo;{search}&rdquo;</p>
                <p className="text-xs text-stone-500 mt-1">First-time caller? Create a lead so the next agent can pick up where you left off.</p>
                <Button
                  size="sm"
                  className="mt-3"
                  iconLeft={<UserPlus className="w-3.5 h-3.5" />}
                  onClick={() => {
                    // Lift whatever the agent typed into the search
                    // box into the prefill — usually a phone number.
                    const isLikelyPhone = /^[+0-9\s-]+$/.test(search.trim());
                    setLeadPrefill({
                      [isLikelyPhone ? "phone" : "name"]: search.trim(),
                    });
                    setShowNewLeadModal(true);
                  }}
                >
                  Create new lead
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                {matches.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center gap-3 p-2.5 rounded-xl border border-stone-100 hover:border-stone-200 hover:bg-stone-50 transition-colors"
                  >
                    <Avatar name={`${p.firstName} ${p.lastName}`} size="sm" />
                    <button
                      onClick={() => router.push(`/patients/${p.id}`)}
                      className="flex-1 min-w-0 text-left cursor-pointer"
                    >
                      <p className="text-sm font-medium text-stone-900 truncate">
                        {p.firstName} {p.lastName}
                      </p>
                      <p className="text-xs text-stone-500 truncate">{p.phone || "—"}</p>
                    </button>
                    {p.phone && (
                      <a
                        href={`tel:${p.phone.replace(/\s+/g, "")}`}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-emerald-50 text-emerald-700 hover:bg-emerald-100 cursor-pointer"
                        title="Call this patient"
                      >
                        <PhoneCall className="w-3.5 h-3.5" /> Call
                      </a>
                    )}
                    <button
                      onClick={() => router.push(`/calendar?patientId=${p.id}`)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-stone-100 text-stone-700 hover:bg-stone-200 cursor-pointer"
                      title="Book an appointment"
                    >
                      <CalendarPlus className="w-3.5 h-3.5" /> Book
                    </button>
                    <button
                      onClick={() => router.push(`/patients/${p.id}`)}
                      className="text-stone-400 hover:text-stone-600 cursor-pointer p-1"
                      title="Open patient profile"
                    >
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Card>

      {/* ===== RECENT CALLS ===== */}
      <Card padding="lg">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-base font-semibold text-stone-900">Recent calls</h2>
            <p className="text-xs text-stone-500 mt-0.5">
              Last 12 calls across all agents. Unknown numbers can be converted to a lead in one click.
            </p>
          </div>
          <span className="text-xs text-stone-400 inline-flex items-center gap-1">
            <Clock className="w-3 h-3" /> Updates every 15s
          </span>
        </div>
        {recentCalls.length === 0 ? (
          <div className="text-center py-8 border border-dashed border-stone-200 rounded-2xl">
            <Phone className="w-8 h-8 text-stone-300 mx-auto mb-2" />
            <p className="text-sm text-stone-500">No calls in the recent log yet.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {recentCalls.map((c) => {
              const isWhatsApp = c.kind === "whatsapp";
              const isInbound = c.type === "INBOUND";
              const isMissed = c.type === "MISSED";
              const direction = isWhatsApp
                ? "Inbound"
                : isMissed ? "Missed" : isInbound ? "Inbound" : "Outbound";
              const phone = c.phone || c.lead?.phone || c.patient?.phone || "—";
              const Icon = isWhatsApp
                ? MessageCircle
                : isMissed ? PhoneMissed : isInbound ? PhoneIncoming : PhoneOutgoing;
              const dirTone = isWhatsApp
                ? "bg-green-50 text-green-700"
                : isMissed
                  ? "bg-red-50 text-red-700"
                  : isInbound
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-sky-50 text-sky-700";
              const displayName = c.patient
                ? `${c.patient.firstName} ${c.patient.lastName}`
                : c.lead?.name
                  ? c.lead.name
                  : "Unknown caller";
              return (
                <div
                  key={c.id}
                  className="flex items-center gap-3 p-2.5 rounded-xl border border-stone-100 hover:border-stone-200 hover:bg-stone-50 transition-colors"
                >
                  <span className={`w-8 h-8 rounded-full inline-flex items-center justify-center shrink-0 ${dirTone}`}>
                    <Icon className="w-4 h-4" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium text-stone-900 truncate">
                        {displayName}
                      </p>
                      {/* Channel — always shown so the agent knows
                          how the contact came in. */}
                      {isWhatsApp ? (
                        <Badge variant="success" className="text-[10px] inline-flex items-center gap-1">
                          <MessageCircle className="w-2.5 h-2.5" /> WhatsApp
                        </Badge>
                      ) : (
                        <Badge variant="default" className="text-[10px] inline-flex items-center gap-1">
                          <Phone className="w-2.5 h-2.5" /> Phone
                        </Badge>
                      )}
                      {c.patient && (
                        <Badge variant="success" className="text-[10px]">Patient · {c.patient.patientCode}</Badge>
                      )}
                      {!c.patient && c.lead && (
                        <Badge variant="info" className="text-[10px]">Lead · {c.lead.status}</Badge>
                      )}
                    </div>
                    <p className="text-xs text-stone-500 truncate">
                      <span className="font-mono">{phone}</span>
                      <span className="mx-1.5 text-stone-300">·</span>
                      {direction}
                      <span className="mx-1.5 text-stone-300">·</span>
                      {timeAgo(c.createdAt)}
                      {c.user?.name && <> <span className="mx-1.5 text-stone-300">·</span> {c.user.name}</>}
                      {c.outcome && <> <span className="mx-1.5 text-stone-300">·</span> <span className="font-medium text-stone-600">{c.outcome.replace(/_/g, " ")}</span></>}
                    </p>
                    {/* WhatsApp message body — show on a second line
                        so the agent can read the inquiry without
                        clicking through. */}
                    {isWhatsApp && c.content && (
                      <p className="mt-1 text-xs text-stone-700 leading-snug line-clamp-2 italic">
                        “{c.content}”
                      </p>
                    )}
                  </div>
                  {/* Action: known patient/lead → open detail. Unknown
                      → one-click convert with phone pre-filled. */}
                  {phone && phone !== "—" && (
                    <a
                      href={`tel:${phone.replace(/\s+/g, "")}`}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-emerald-50 text-emerald-700 hover:bg-emerald-100 cursor-pointer"
                      title="Call back"
                    >
                      <PhoneCall className="w-3.5 h-3.5" /> Call
                    </a>
                  )}
                  {c.patient ? (
                    <Link
                      href={`/patients/${c.patient.id}`}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-stone-100 text-stone-700 hover:bg-stone-200 cursor-pointer"
                      title="Open patient profile"
                    >
                      Open <ExternalLink className="w-3 h-3" />
                    </Link>
                  ) : c.lead ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-stone-100 text-stone-700">
                      In pipeline
                    </span>
                  ) : (
                    <>
                      <button
                        onClick={() => {
                          setLeadPrefill({
                            phone: phone !== "—" ? phone : undefined,
                            // The Lead.source enum doesn't have a
                            // WHATSAPP value yet — bucket WhatsApp
                            // inquiries under SOCIAL_MEDIA so they
                            // can be told apart from phone calls in
                            // pipeline reporting. Phone → CALL.
                            source: isWhatsApp ? "SOCIAL_MEDIA" : "CALL",
                            notes: isWhatsApp && c.content
                              ? `WhatsApp inquiry: ${c.content}`
                              : c.notes ?? undefined,
                          });
                          setShowNewLeadModal(true);
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-violet-50 text-violet-700 hover:bg-violet-100 cursor-pointer"
                        title="Capture this caller as a new lead in the pipeline"
                      >
                        <UserPlus className="w-3.5 h-3.5" /> To lead
                      </button>
                      <button
                        onClick={() => {
                          setPatientPrefill({
                            phone: phone !== "—" ? phone : undefined,
                          });
                          setShowAddPatientModal(true);
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-teal-50 text-teal-700 hover:bg-teal-100 cursor-pointer"
                        title="Skip the lead step and register them as a patient now"
                      >
                        <UserPlus className="w-3.5 h-3.5" /> To patient
                      </button>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* ===== LIVE CALLS ===== */}
      <LiveCallPanel />

      {/* ===== CALLBACK QUEUE ===== */}
      <CallbackQueue />

      {/* ===== LEAD PIPELINE ===== */}
      <LeadKanban leads={leads} />

      {/* ===== MODALS ===== */}
      <NewLeadModal
        isOpen={showNewLeadModal}
        onClose={() => setShowNewLeadModal(false)}
        prefill={leadPrefill}
      />
      <AddPatientModal
        isOpen={showAddPatientModal}
        onClose={() => setShowAddPatientModal(false)}
        prefill={patientPrefill}
      />
    </div>
  );
}
