/**
 * Per-agent ring buffer of recent contact events (phone + whatsapp).
 *
 * Lives in a lib file because Next.js route handlers (`route.ts`) are
 * restricted to a fixed set of named exports — the build refuses any
 * helper exports from those files. We populate this from
 * /api/calls/incoming (POST) and read it from /api/calls/activity (GET).
 *
 * In-memory by design: the durable history of phone calls is in CallLog
 * and matched-patient WhatsApp is in CommunicationLog. This is the
 * "what just happened, regardless of channel or match" feed for the
 * dashboard. Single-instance only; if we ever multi-instance MediCore,
 * port to Redis.
 */

export interface RecentActivity {
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
}

const RECENT_PER_AGENT = 30;
const DEDUP_WINDOW_MS = 5 * 60 * 1000;

// Module-level Map persists for the lifetime of the Node process — fine
// for our single-pm2-process deployment. Lost on pm2 restart by design.
const store: Map<string, RecentActivity[]> = new Map();

/** Last ten digits, ignoring spaces/dashes/+. Lets a "ringing" event with
 *  "03001234567" dedupe against an "ended" event with "+923001234567". */
function normalizePhone(s: string): string {
  return s.replace(/[^0-9]/g, "").slice(-10);
}

export function pushRecentActivity(agentId: string, entry: RecentActivity) {
  const cur = store.get(agentId) ?? [];
  // A single call typically fires two events: ringing (from
  // OutgoingCallReceiver / PhoneStateMonitor) then ended/missed (from
  // CallLogObserver, with duration). Without dedup the dashboard shows
  // both rows for one call. If the most recent entry for the same
  // phone/direction/channel is within DEDUP_WINDOW_MS and was in a
  // pre-completion state, REPLACE it with this newer event so each call
  // collapses to one row that always reflects the latest state.
  const newKey = normalizePhone(entry.phone);
  if (newKey.length >= 4) {
    const existingIdx = cur.findIndex((e) =>
      e.direction === entry.direction &&
      e.channel === entry.channel &&
      entry.ts - e.ts < DEDUP_WINDOW_MS &&
      (e.state === "ringing" || e.state === "answered" || e.state === null) &&
      normalizePhone(e.phone) === newKey,
    );
    if (existingIdx >= 0) {
      cur.splice(existingIdx, 1);
    }
  }
  cur.unshift(entry);
  if (cur.length > RECENT_PER_AGENT) cur.length = RECENT_PER_AGENT;
  store.set(agentId, cur);
}

export function getRecentActivity(agentId: string, limit = 15): RecentActivity[] {
  return (store.get(agentId) || []).slice(0, limit);
}
