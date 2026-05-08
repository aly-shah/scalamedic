"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  PhoneIncoming, PhoneOutgoing, PhoneOff, PhoneCall, CheckCircle, AlertTriangle, User, Tag,
  Loader2, UserPlus, CalendarPlus, Stethoscope, Mail, History,
} from "lucide-react";
import { api } from "@/lib/api";
import { Card, Badge, Button, Avatar } from "@/components/ui";
import { timeAgo } from "@/lib/utils";
import { AddPatientModal } from "@/components/patients/add-patient-modal";

// ---- Types ----
interface MatchedPatient {
  id: string; patientCode: string; firstName: string; lastName: string;
  phone?: string | null; email?: string | null; gender?: string; dateOfBirth?: string;
  assignedDoctor?: { id: string; name: string } | null;
  branch?: { id: string; name: string } | null;
  allergies?: { allergen: string }[];
  tags?: { tag: string }[];
}

interface MatchedLead {
  id: string; name: string; phone: string; email?: string | null;
  status: string; interest?: string | null;
}

interface RecentAppt {
  id: string; date: string; startTime: string; type: string; status: string;
  doctor?: { name: string };
}

interface RecentCall {
  id: string; type: string; outcome: string; notes?: string | null;
  duration?: number | null; createdAt: string;
}

interface MatchResult {
  matchType: "patient" | "lead" | "none";
  phone: string;
  patient?: MatchedPatient | null;
  otherPatients?: MatchedPatient[];
  lead?: MatchedLead | null;
  otherLeads?: MatchedLead[];
  recentAppointments?: RecentAppt[];
  recentCalls?: RecentCall[];
}

interface LiveCall {
  phone: string;
  agentId: string;
  state: "ringing" | "answered" | "ended" | "missed";
  timestamp: number;
  matchResult?: MatchResult;
  contactName?: string | null;
  direction?: "INBOUND" | "OUTBOUND";
}

type CallOutcome = "BOOKED" | "CALLBACK" | "NOT_INTERESTED" | "NO_ANSWER" | "INFO_PROVIDED";

const OUTCOME_OPTIONS: Array<{ value: CallOutcome; label: string; color: string }> = [
  { value: "INFO_PROVIDED", label: "Info provided", color: "bg-stone-100 text-stone-700" },
  { value: "BOOKED", label: "Booked appointment", color: "bg-emerald-100 text-emerald-700" },
  { value: "CALLBACK", label: "Callback requested", color: "bg-amber-100 text-amber-700" },
  { value: "NOT_INTERESTED", label: "Not interested", color: "bg-red-100 text-red-700" },
  { value: "NO_ANSWER", label: "No answer", color: "bg-stone-100 text-stone-500" },
];

// ---- Hooks ----
function useCurrentUser() {
  const [user, setUser] = useState<{ id: string; name: string; role: string } | null>(null);
  useEffect(() => {
    // /api/auth/me returns { user, tenant } since v36.
    fetch("/api/auth/me", { credentials: "include" })
      .then(r => r.json())
      .then(d => { if (d.success && d.data?.user?.id) setUser(d.data.user); })
      .catch(() => {});
  }, []);
  return user;
}

function useLiveCall(agentId: string | undefined) {
  const [call, setCall] = useState<LiveCall | null>(null);
  const cancelled = useRef(false);

  const poll = useCallback(async () => {
    if (!agentId) return;
    try {
      const r = await fetch(`/api/calls/incoming?agentId=${agentId}`, { credentials: "include" });
      const d = await r.json();
      if (!cancelled.current && d.success) setCall(d.data);
    } catch { /* silent — next tick will retry */ }
  }, [agentId]);

  useEffect(() => {
    if (!agentId) return;
    cancelled.current = false;
    // Fire initial poll + every 2s; the state update happens async inside poll's
    // promise chain, not synchronously in the effect body.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    poll();
    const t = setInterval(poll, 2000);
    return () => { cancelled.current = true; clearInterval(t); };
  }, [agentId, poll]);

  return { call, refetch: poll, clear: () => setCall(null) };
}

/**
 * Recent activity feed for the dashboard "Recent calls" widget.
 *
 * Sources from /api/calls/activity (per-agent in-memory ring buffer in
 * /api/calls/incoming) instead of /api/calls/recent (CallLog table).
 * Why: CallLog only persists ended/missed PHONE calls — WhatsApp
 * messages, ringing-only events, and unmatched-caller activity were
 * invisible. The activity feed captures every successful POST, so the
 * widget reflects what actually happened. Trade-off: feed resets on pm2
 * restart, but durable per-call history still lives in CallLog and is
 * surfaced via /admin/reports.
 */
type ActivityEntry = {
  id: string;
  ts: number;
  channel: "phone" | "whatsapp";
  direction: "INBOUND" | "OUTBOUND";
  state: string | null;
  phone: string;
  contactName: string | null;
  patientId: string | null;
  patientFirstName: string | null;
  patientLastName: string | null;
  leadId: string | null;
  leadName: string | null;
};

function useRecentCalls(agentId: string | undefined, refreshToken: number) {
  const [items, setItems] = useState<ActivityEntry[]>([]);
  useEffect(() => {
    if (!agentId) return;
    const load = () => {
      fetch(`/api/calls/activity?agentId=${agentId}&limit=15`, { credentials: "include" })
        .then((r) => r.json())
        .then((d) => { if (d.success) setItems((d.data || []) as ActivityEntry[]); })
        .catch(() => {});
    };
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [agentId, refreshToken]);
  return items;
}

// ---- Helpers ----
function ageFromDob(dob?: string): number | null {
  if (!dob) return null;
  const t = new Date(dob).getTime();
  if (isNaN(t)) return null;
  return Math.floor((Date.now() - t) / (365.25 * 24 * 3600 * 1000));
}
function fmtDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}
function outcomeLabel(o: string): string {
  return OUTCOME_OPTIONS.find(x => x.value === o)?.label || o;
}
function outcomeColor(o: string): string {
  return OUTCOME_OPTIONS.find(x => x.value === o)?.color || "bg-stone-100 text-stone-700";
}

// ============================================================
// Audible chime + browser notification on new call
// ============================================================
// One AudioContext per session, lazily created on first user gesture.
let _audioCtx: AudioContext | null = null;
function getAudio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  type Win = Window & { webkitAudioContext?: typeof AudioContext };
  const Ctor = window.AudioContext || (window as Win).webkitAudioContext;
  if (!Ctor) return null;
  if (!_audioCtx) _audioCtx = new Ctor();
  return _audioCtx;
}
function playChime() {
  const ctx = getAudio();
  if (!ctx) return;
  // Two short beeps, 880Hz then 1100Hz — telephone-ish
  const beep = (when: number, freq: number) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(0.18, when + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.18);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(when);
    osc.stop(when + 0.2);
  };
  const t = ctx.currentTime;
  beep(t, 880);
  beep(t + 0.22, 1100);
}

function showBrowserNotification(title: string, body: string) {
  if (typeof window === "undefined") return;
  if (!("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  try {
    const n = new Notification(title, { body, icon: "/favicon.ico", tag: "medicore-call" });
    setTimeout(() => n.close(), 12000);
  } catch { /* some browsers throw if not in user gesture; ignore */ }
}

// ============================================================
// MAIN
// ============================================================
export function LiveCallPanel() {
  const user = useCurrentUser();
  const { call, refetch, clear } = useLiveCall(user?.id);

  const [outcome, setOutcome] = useState<CallOutcome>("INFO_PROVIDED");
  const [notes, setNotes] = useState("");
  const [logging, setLogging] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [refreshRecent, setRefreshRecent] = useState(0);
  const lastAlertedKey = useRef<string | null>(null);
  const [notifPerm, setNotifPerm] = useState<NotificationPermission | "unsupported">(
    typeof window !== "undefined" && "Notification" in window ? Notification.permission : "unsupported"
  );

  const recentCalls = useRecentCalls(user?.id, refreshRecent);
  const router = useRouter();
  // When the receptionist clicks an unmatched recent caller, open
  // AddPatientModal pre-filled with phone + best-guess name (split from
  // the device contactName / WhatsApp profile name). Same UX the
  // calendar QuickBookPanel already uses.
  const [addPrefill, setAddPrefill] = useState<{ firstName?: string; lastName?: string; phone?: string } | null>(null);

  // Alert (chime + browser notification + title flash) when a new ringing
  // call lands. Keyed on phone+timestamp so we don't re-alert on every poll.
  useEffect(() => {
    if (!call || call.state !== "ringing") return;
    const key = `${call.phone}|${call.timestamp}`;
    if (lastAlertedKey.current === key) return;
    lastAlertedKey.current = key;
    playChime();
    const who = call.contactName || call.phone;
    const dir = call.direction === "OUTBOUND" ? "Outbound call" : "Incoming call";
    showBrowserNotification(`📞 ${dir}`, who);
    // Flash document title for 6s
    const orig = document.title;
    let tick = 0;
    const t = setInterval(() => {
      document.title = tick++ % 2 === 0 ? `📞 ${who}` : orig;
    }, 700);
    setTimeout(() => { clearInterval(t); document.title = orig; }, 6000);
    return () => { clearInterval(t); document.title = orig; };
  }, [call]);

  async function enableNotifications() {
    if (!("Notification" in window)) return;
    const p = await Notification.requestPermission();
    setNotifPerm(p);
  }

  // Send Answer / Hang up to the agent's companion phone. The phone's
  // CallControlPoller picks it up within ~3 seconds and dispatches to
  // TelecomManager. We don't await UI feedback beyond enabling/disabling
  // the button — the live-call state will update via the existing 2s
  // poll once the phone changes state.
  const [controlling, setControlling] = useState<"answer" | "hangup" | null>(null);
  async function controlPhone(action: "answer" | "hangup") {
    if (!user) return;
    setControlling(action);
    try { await api.calls.control(user.id, action); }
    catch { /* button latency is enough feedback */ }
    finally { setControlling(null); }
  }

  // Timer for elapsed call time
  useEffect(() => {
    if (!call || call.state === "ended" || call.state === "missed") {
      setElapsed(0);
      return;
    }
    const tick = () => setElapsed(Math.floor((Date.now() - call.timestamp) / 1000));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [call]);

  const logCall = async () => {
    if (!call || !user) return;
    setLogging(true);
    try {
      const res = await fetch("/api/calls/incoming", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: call.phone,
          agentId: user.id,
          state: "ended",
          outcome,
          notes: notes.trim() || undefined,
          duration: elapsed || Math.max(1, Math.floor((Date.now() - call.timestamp) / 1000)),
        }),
      });
      const d = await res.json();
      if (d.success) {
        clear();
        setNotes("");
        setOutcome("INFO_PROVIDED");
        setRefreshRecent(k => k + 1);
      }
    } finally {
      setLogging(false);
    }
  };

  const markMissed = async () => {
    if (!call || !user) return;
    setLogging(true);
    try {
      await fetch("/api/calls/incoming", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: call.phone,
          agentId: user.id,
          state: "missed",
        }),
      });
      clear();
      setRefreshRecent(k => k + 1);
    } finally {
      setLogging(false);
    }
  };

  const isActive = !!call && (call.state === "ringing" || call.state === "answered");
  const match = call?.matchResult;
  const matchedPatient = match?.patient;
  const matchedLead = match?.lead;

  return (
    <div className="space-y-4">
      {/* Enable browser notifications nudge — only shown if not granted */}
      {notifPerm === "default" && (
        <div className="bg-amber-50 border border-amber-100 rounded-xl px-3 py-2 text-xs text-amber-800 flex items-center gap-2">
          <span className="flex-1">
            Enable call alerts to get a sound + desktop notification when calls come in.
          </span>
          <button
            onClick={enableNotifications}
            className="px-3 py-1 rounded-lg bg-amber-600 text-white text-xs font-medium hover:bg-amber-700"
          >
            Enable
          </button>
        </div>
      )}

      {/* Live Call */}
      {isActive && call ? (() => {
        const isOutbound = call.direction === "OUTBOUND";
        const HeadIcon = isOutbound ? PhoneOutgoing : PhoneIncoming;
        const borderClass = isOutbound ? "border-l-indigo-500 shadow-indigo-500/5" : "border-l-red-500 shadow-red-500/5";
        const iconBg = isOutbound ? "bg-indigo-50 text-indigo-600" : "bg-red-50 text-red-600";
        const label = isOutbound
          ? (call.state === "ringing" ? "Calling" : "In call (outbound)")
          : (call.state === "ringing" ? "Ringing" : "In call");
        return (
        <Card padding="lg" className={`border-l-4 shadow-lg ${borderClass}`}>
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center animate-pulse ${iconBg}`}>
                <HeadIcon className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <Badge variant={isOutbound ? "info" : "danger"} dot>{label}</Badge>
                  <span className="text-xs text-stone-500 font-mono">{fmtDuration(elapsed)}</span>
                </div>
                {call.contactName && (
                  <p className="text-lg font-bold text-stone-900 mt-0.5">{call.contactName}</p>
                )}
                <p className={
                  call.contactName
                    ? "text-sm text-stone-600 font-mono"
                    : "text-lg font-bold text-stone-900 mt-0.5 font-mono"
                }>{call.phone}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* Inbound + ringing → big green Answer that tells the
                  receptionist's phone to acceptRingingCall(). Both states
                  show the red Hang up that calls TelecomManager.endCall(). */}
              {!isOutbound && call.state === "ringing" && (
                <button
                  onClick={() => controlPhone("answer")}
                  disabled={controlling !== null}
                  title="Answer on phone"
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 text-white text-sm font-medium shadow-sm shadow-emerald-200 hover:bg-emerald-700 disabled:opacity-50 cursor-pointer"
                >
                  {controlling === "answer" ? <Loader2 className="w-4 h-4 animate-spin" /> : <PhoneCall className="w-4 h-4" />}
                  Answer
                </button>
              )}
              <button
                onClick={() => controlPhone("hangup")}
                disabled={controlling !== null}
                title="Hang up on phone"
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-600 text-white text-sm font-medium shadow-sm shadow-red-200 hover:bg-red-700 disabled:opacity-50 cursor-pointer"
              >
                {controlling === "hangup" ? <Loader2 className="w-4 h-4 animate-spin" /> : <PhoneOff className="w-4 h-4" />}
                Hang up
              </button>
              <button
                onClick={markMissed}
                disabled={logging}
                title="Log as missed (no phone action)"
                className="p-2 rounded-xl text-stone-400 hover:bg-stone-50 hover:text-stone-600 disabled:opacity-50"
              >
                <CheckCircle className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Match result */}
          {match && match.matchType === "patient" && matchedPatient && (
            <MatchCard patient={matchedPatient} recentAppointments={match.recentAppointments} />
          )}
          {match && match.matchType === "lead" && matchedLead && (
            <LeadMatchCard lead={matchedLead} />
          )}
          {match && match.matchType === "none" && (
            <NoMatchCard phone={call.phone} contactName={call.contactName} />
          )}
          {!match && (
            <div className="flex items-center gap-2 text-xs text-stone-400 py-3">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Matching caller…
            </div>
          )}

          {/* Outcome + notes */}
          <div className="mt-5 pt-5 border-t border-stone-100 space-y-3">
            <div>
              <p className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-2">Outcome</p>
              <div className="flex flex-wrap gap-2">
                {OUTCOME_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setOutcome(opt.value)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                      outcome === opt.value
                        ? "ring-2 ring-teal-500 " + opt.color
                        : "bg-stone-50 text-stone-600 hover:bg-stone-100"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-2">Notes</p>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Reason for call, agreed actions, etc."
                rows={2}
                className="w-full px-3 py-2 text-sm bg-white border border-stone-200 rounded-xl outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 resize-none"
              />
            </div>
            <div className="flex items-center justify-end gap-2">
              <Button size="sm" variant="outline" onClick={markMissed} disabled={logging}>
                Mark missed
              </Button>
              <Button size="sm" onClick={logCall} disabled={logging} iconLeft={<CheckCircle className="w-3.5 h-3.5" />}>
                {logging ? "Logging…" : "Log call & end"}
              </Button>
            </div>
          </div>
        </Card>
        );
      })() : (
        <Card padding="md" className="border-l-4 border-l-stone-200">
          <div className="flex items-center gap-3 text-stone-400">
            <div className="w-10 h-10 rounded-full bg-stone-100 flex items-center justify-center">
              <PhoneIncoming className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-stone-500">Waiting for calls</p>
              <p className="text-xs text-stone-400">
                {user ? `Listening as ${user.name}. Live calls routed to you will appear here.` : "Connecting…"}
              </p>
            </div>
            <button onClick={refetch} className="text-xs text-teal-600 hover:underline">Refresh</button>
          </div>
        </Card>
      )}

      {/* Recent activity */}
      {recentCalls.length > 0 && (
        <Card padding="md">
          <div className="flex items-center gap-2 mb-3">
            <History className="w-4 h-4 text-stone-400" />
            <p className="text-sm font-semibold text-stone-700">Recent activity</p>
            <span className="text-xs text-stone-400">({recentCalls.length})</span>
          </div>
          <div className="divide-y divide-stone-100">
            {recentCalls.map(c => {
              const name = c.patientId
                ? `${c.patientFirstName || ""} ${c.patientLastName || ""}`.trim()
                : c.leadName || c.contactName || "Unknown caller";
              const phone = c.phone || "";
              const isInbound = c.direction === "INBOUND";
              const isWA = c.channel === "whatsapp";
              // WhatsApp event with state set ⇒ call notification, not a
              // text message. We tag those server-side from the listener
              // so they don't get rendered as "Message".
              const isWACall = isWA && !!c.state;
              const DirIcon = isInbound ? PhoneIncoming : PhoneOutgoing;
              const iconBg = isWACall
                ? "bg-emerald-100 text-emerald-700"
                : isWA
                ? "bg-emerald-50 text-emerald-600"
                : isInbound ? "bg-teal-50 text-teal-600" : "bg-indigo-50 text-indigo-600";
              const stateLabel = isWACall
                ? (c.state === "missed" ? "Missed call" : "WhatsApp call")
                : isWA
                ? "Message"
                : (c.state ? c.state.charAt(0).toUpperCase() + c.state.slice(1) : "Call");
              const isMatched = !!c.patientId;
              const onRowClick = () => {
                if (isMatched) {
                  router.push(`/patients/${c.patientId}`);
                  return;
                }
                // Unmatched: open New Patient with phone + name pre-filled.
                // Split the device-supplied contactName by first space — typical
                // Pakistani contact entries are "First Last" so this yields a
                // reasonable starting point the receptionist can fix in-place.
                const fullName = (c.contactName || c.leadName || "").trim();
                const sp = fullName.indexOf(" ");
                const firstName = sp > 0 ? fullName.slice(0, sp) : fullName;
                const lastName = sp > 0 ? fullName.slice(sp + 1) : "";
                setAddPrefill({ firstName, lastName, phone: phone || "" });
              };
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={onRowClick}
                  className="w-full flex items-center gap-3 py-2.5 text-left hover:bg-stone-50 -mx-2 px-2 rounded-lg cursor-pointer transition-colors"
                  title={isMatched ? "Open patient profile" : "Add as new patient"}
                >
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${iconBg}`}
                  >
                    {isWACall ? <span className="text-xs">📞</span> : isWA ? <span className="text-xs">💬</span> : <DirIcon className="w-3.5 h-3.5" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-stone-800 truncate">{name}</p>
                    <p className="text-[11px] text-stone-400 truncate">
                      {phone && <span className="font-mono">{phone}</span>}
                      {phone ? " · " : ""}
                      {timeAgo(new Date(c.ts).toISOString())}
                    </p>
                  </div>
                  {!isMatched && phone && (
                    <span className="text-[10px] text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full shrink-0 inline-flex items-center gap-1">
                      <UserPlus className="w-3 h-3" />
                      Add
                    </span>
                  )}
                  <span className="text-[10px] font-medium px-2 py-0.5 rounded-full shrink-0 bg-stone-100 text-stone-600">
                    {stateLabel}
                  </span>
                </button>
              );
            })}
          </div>
        </Card>
      )}

      {/* Mounted once for the whole panel — opens with phone + name pre-filled
          when an unmatched recent caller is clicked. On successful create
          we navigate to the patient's profile so the receptionist can
          finish details (DOB, allergies, etc.). */}
      <AddPatientModal
        isOpen={!!addPrefill}
        onClose={() => setAddPrefill(null)}
        prefill={addPrefill || undefined}
        onCreated={(newId) => {
          setAddPrefill(null);
          // Refresh the activity feed so the row now shows as matched.
          setRefreshRecent((n) => n + 1);
          if (newId) router.push(`/patients/${newId}`);
        }}
      />
    </div>
  );
}

// ---- Subcomponents ----
function MatchCard({ patient, recentAppointments }: { patient: MatchedPatient; recentAppointments?: RecentAppt[] }) {
  const age = ageFromDob(patient.dateOfBirth);
  const allergens = (patient.allergies || []).map(a => a.allergen);
  const tags = (patient.tags || []).map(t => t.tag);
  const lastAppt = recentAppointments?.[0];
  return (
    <div className="bg-emerald-50/50 border border-emerald-100 rounded-xl p-3">
      <div className="flex items-center gap-2 text-xs font-semibold text-emerald-700 mb-2">
        <CheckCircle className="w-3.5 h-3.5" />
        Matched patient
      </div>
      <div className="flex items-start gap-3">
        <Avatar name={`${patient.firstName} ${patient.lastName}`} size="md" />
        <div className="flex-1 min-w-0">
          <Link
            href={`/patients/${patient.id}`}
            className="text-sm font-semibold text-stone-900 hover:text-teal-600 truncate"
          >
            {patient.firstName} {patient.lastName}
          </Link>
          <div className="flex items-center gap-2 text-[11px] text-stone-500 mt-0.5 flex-wrap">
            <span className="font-mono">{patient.patientCode}</span>
            {age != null && <span>· {age}y</span>}
            {patient.gender && <span>· {patient.gender.charAt(0)}</span>}
            {patient.assignedDoctor?.name && (
              <span className="flex items-center gap-1"><Stethoscope className="w-3 h-3" />{patient.assignedDoctor.name}</span>
            )}
          </div>

          {allergens.length > 0 && (
            <div className="mt-2 flex items-center gap-1.5 text-[11px] bg-red-50 text-red-700 rounded-lg px-2 py-1">
              <AlertTriangle className="w-3 h-3 shrink-0" />
              <span className="font-semibold">Allergies:</span>
              <span className="truncate">{allergens.join(", ")}</span>
            </div>
          )}

          {tags.length > 0 && (
            <div className="mt-1.5 flex items-center gap-1 flex-wrap">
              <Tag className="w-3 h-3 text-stone-400" />
              {tags.slice(0, 4).map(t => (
                <Badge key={t} variant="default" className="text-[10px]">{t}</Badge>
              ))}
            </div>
          )}

          {lastAppt && (
            <p className="mt-2 text-[11px] text-stone-500">
              Last visit: {new Date(lastAppt.date).toLocaleDateString("en-PK", { timeZone: "Asia/Karachi", month: "short", day: "numeric", year: "numeric" })}
              {" · "}{lastAppt.type?.replace(/_/g, " ")}
              {" · "}{lastAppt.status?.replace(/_/g, " ")}
            </p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 mt-3">
        <Link href={`/patients/${patient.id}`} className="flex-1">
          <Button size="sm" variant="outline" className="w-full" iconLeft={<User className="w-3.5 h-3.5" />}>
            Open profile
          </Button>
        </Link>
        <Link href={`/calendar?patientId=${patient.id}`} className="flex-1">
          <Button size="sm" className="w-full" iconLeft={<CalendarPlus className="w-3.5 h-3.5" />}>
            Book appt
          </Button>
        </Link>
      </div>
    </div>
  );
}

function LeadMatchCard({ lead }: { lead: MatchedLead }) {
  return (
    <div className="bg-amber-50/50 border border-amber-100 rounded-xl p-3">
      <div className="flex items-center gap-2 text-xs font-semibold text-amber-700 mb-2">
        <UserPlus className="w-3.5 h-3.5" />
        Existing lead
      </div>
      <div className="flex items-start gap-3">
        <Avatar name={lead.name} size="md" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-stone-900 truncate">{lead.name}</p>
          <div className="flex items-center gap-2 text-[11px] text-stone-500 mt-0.5 flex-wrap">
            <span className="font-mono">{lead.phone}</span>
            {lead.email && <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{lead.email}</span>}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <Badge variant="warning" dot>{lead.status.replace(/_/g, " ")}</Badge>
            {lead.interest && <Badge variant="default">{lead.interest}</Badge>}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 mt-3">
        <Link href={`/call-center`} className="flex-1">
          <Button size="sm" variant="outline" className="w-full">View lead</Button>
        </Link>
        <Button size="sm" className="flex-1" iconLeft={<CalendarPlus className="w-3.5 h-3.5" />}>Convert & book</Button>
      </div>
    </div>
  );
}

function NoMatchCard({ phone, contactName }: { phone: string; contactName?: string | null }) {
  return (
    <div className="bg-stone-50 border border-stone-200 rounded-xl p-3">
      <div className="flex items-center gap-2 text-xs font-medium text-stone-500 mb-2">
        <User className="w-3.5 h-3.5" />
        Unknown caller
      </div>
      {contactName && (
        <p className="text-sm text-stone-700">
          Saved on device as <span className="font-medium">{contactName}</span>
        </p>
      )}
      <p className="text-sm text-stone-700">
        No patient or lead matches <span className="font-mono">{phone}</span>.
      </p>
      <div className="flex items-center gap-2 mt-3">
        <Button size="sm" className="flex-1" iconLeft={<UserPlus className="w-3.5 h-3.5" />}>
          Create new lead
        </Button>
        <Button size="sm" variant="outline" className="flex-1">
          Register as patient
        </Button>
      </div>
    </div>
  );
}
