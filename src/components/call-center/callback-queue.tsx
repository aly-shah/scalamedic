"use client";

import { useMemo, useState } from "react";
import {
  CalendarClock, Phone, MessageSquare, Clock, AlertCircle, CalendarPlus,
  Check, ChevronDown, ChevronRight,
} from "lucide-react";
import { Card, Badge, Button, Avatar } from "@/components/ui";
import { CLINIC_TZ } from "@/lib/utils";
import { useLeads, useUpdateLead } from "@/hooks/use-queries";
import { LeadStatus } from "@/types";

interface LeadRow {
  id: string;
  name: string;
  phone: string;
  email?: string | null;
  status: string;
  interest?: string | null;
  notes?: string | null;
  callbackDate?: string | null;
}

type Bucket = "overdue" | "today" | "week" | "later";

const BUCKET_CONFIG: Record<Bucket, { label: string; color: string; icon: typeof AlertCircle }> = {
  overdue: { label: "Overdue",     color: "text-red-700 bg-red-50 border-red-200",       icon: AlertCircle },
  today:   { label: "Today",       color: "text-amber-700 bg-amber-50 border-amber-200", icon: CalendarClock },
  week:    { label: "This week",   color: "text-teal-700 bg-teal-50 border-teal-200",    icon: Clock },
  later:   { label: "Later",       color: "text-stone-600 bg-stone-50 border-stone-200", icon: CalendarPlus },
};

// PKT day boundary of the callback date
function bucketFor(iso: string): Bucket {
  const due = new Date(iso).getTime();
  const now = Date.now();
  const pktToday = new Date().toLocaleDateString("en-CA", { timeZone: CLINIC_TZ });
  const pktDayStart = new Date(`${pktToday}T00:00:00+05:00`).getTime();
  const pktDayEnd = pktDayStart + 24 * 3600 * 1000;
  const pktWeekEnd = pktDayStart + 7 * 24 * 3600 * 1000;
  if (due < now && due < pktDayStart) return "overdue";
  if (due < pktDayEnd) return "today";
  if (due < pktWeekEnd) return "week";
  return "later";
}

function formatRelative(iso: string): string {
  const due = new Date(iso).getTime();
  const diff = due - Date.now();
  const absMin = Math.floor(Math.abs(diff) / 60000);
  const past = diff < 0;
  if (absMin < 60) return past ? `${absMin}m ago` : `in ${absMin}m`;
  const absH = Math.floor(absMin / 60);
  if (absH < 24) return past ? `${absH}h ago` : `in ${absH}h`;
  const absD = Math.floor(absH / 24);
  if (absD < 14) return past ? `${absD}d ago` : `in ${absD}d`;
  return new Date(iso).toLocaleDateString("en-PK", { timeZone: CLINIC_TZ, month: "short", day: "numeric" });
}

function formatAbsolute(iso: string): string {
  return new Date(iso).toLocaleString("en-PK", {
    timeZone: CLINIC_TZ,
    weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
}

// The "dead" statuses — leads that shouldn't be in the callback queue even if callbackDate is set.
const PARKED: string[] = [LeadStatus.BOOKED, LeadStatus.NOT_INTERESTED];

export function CallbackQueue() {
  const { data: leadsResponse } = useLeads();
  const updateLead = useUpdateLead();
  const [collapsed, setCollapsed] = useState<Record<Bucket, boolean>>({
    overdue: false, today: false, week: false, later: true,
  });

  const leads = useMemo(() => (leadsResponse?.data || []) as LeadRow[], [leadsResponse]);

  const buckets = useMemo(() => {
    const out: Record<Bucket, LeadRow[]> = { overdue: [], today: [], week: [], later: [] };
    for (const l of leads) {
      if (!l.callbackDate) continue;
      if (PARKED.includes(l.status)) continue;
      out[bucketFor(l.callbackDate)].push(l);
    }
    // sort each bucket by callbackDate ascending
    for (const k of Object.keys(out) as Bucket[]) {
      out[k].sort((a, b) => (a.callbackDate! < b.callbackDate! ? -1 : 1));
    }
    return out;
  }, [leads]);

  const total = buckets.overdue.length + buckets.today.length + buckets.week.length + buckets.later.length;

  if (total === 0) return null;

  const snooze = (lead: LeadRow, days: number) => {
    // Snooze from whichever is later: current callback or now.
    // eslint-disable-next-line react-hooks/purity -- Date.now in a click handler, not during render
    const now = Date.now();
    const existing = lead.callbackDate ? new Date(lead.callbackDate) : null;
    const base = existing && existing.getTime() > now ? existing : new Date(now);
    base.setDate(base.getDate() + days);
    updateLead.mutate({ id: lead.id, data: { callbackDate: base.toISOString() } });
  };

  const markContacted = (lead: LeadRow) => {
    updateLead.mutate({ id: lead.id, data: { status: LeadStatus.CONTACTED, callbackDate: null } });
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-lg font-semibold text-stone-700 flex items-center gap-2">
          <CalendarClock className="w-5 h-5 text-teal-600" />
          Callback Queue
          <span className="text-sm font-normal text-stone-500">({total})</span>
        </p>
      </div>

      <div className="space-y-4">
        {(["overdue", "today", "week", "later"] as Bucket[]).map((b) => {
          const items = buckets[b];
          if (items.length === 0) return null;
          const cfg = BUCKET_CONFIG[b];
          const Icon = cfg.icon;
          const isCollapsed = collapsed[b];
          return (
            <Card key={b} padding="md" className={`border-l-4 ${cfg.color}`}>
              <button
                onClick={() => setCollapsed((c) => ({ ...c, [b]: !c[b] }))}
                className="w-full flex items-center justify-between cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <Icon className="w-4 h-4" />
                  <span className="text-sm font-semibold">{cfg.label}</span>
                  <Badge variant="default">{items.length}</Badge>
                </div>
                {isCollapsed ? <ChevronRight className="w-4 h-4 text-stone-400" /> : <ChevronDown className="w-4 h-4 text-stone-400" />}
              </button>

              {!isCollapsed && (
                <div className="mt-3 space-y-2">
                  {items.map((lead) => (
                    <CallbackCard
                      key={lead.id}
                      lead={lead}
                      bucket={b}
                      onCall={() => { /* tel: link in UI */ }}
                      onSnooze={(days) => snooze(lead, days)}
                      onMarkContacted={() => markContacted(lead)}
                      disabled={updateLead.isPending}
                    />
                  ))}
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// ---- Card ----
function CallbackCard({
  lead, bucket, onCall, onSnooze, onMarkContacted, disabled,
}: {
  lead: LeadRow;
  bucket: Bucket;
  onCall: () => void;
  onSnooze: (days: number) => void;
  onMarkContacted: () => void;
  disabled: boolean;
}) {
  const [showSnooze, setShowSnooze] = useState(false);
  const due = lead.callbackDate!;
  const phoneDigits = lead.phone.replace(/[^0-9]/g, "");

  return (
    <div className="bg-white rounded-xl border border-stone-100 p-3 flex items-start gap-3">
      <Avatar name={lead.name} size="sm" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-semibold text-stone-900 truncate">{lead.name}</p>
          <span className="text-xs text-stone-500 font-mono">{lead.phone}</span>
        </div>
        {lead.interest && (
          <p className="text-xs text-stone-500 mt-0.5 truncate">{lead.interest}</p>
        )}
        <div className="flex items-center gap-2 mt-1 text-[11px] text-stone-500">
          <CalendarClock className="w-3 h-3" />
          <span className={bucket === "overdue" ? "text-red-700 font-semibold" : ""}>
            {formatRelative(due)}
          </span>
          <span className="text-stone-400">· {formatAbsolute(due)}</span>
        </div>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        <a
          href={`tel:${lead.phone}`}
          onClick={onCall}
          className="w-8 h-8 rounded-lg bg-teal-50 text-teal-600 flex items-center justify-center hover:bg-teal-100"
          title="Call"
        >
          <Phone className="w-3.5 h-3.5" />
        </a>
        <a
          href={`https://wa.me/${phoneDigits}`}
          target="_blank"
          rel="noopener noreferrer"
          className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center hover:bg-emerald-100"
          title="WhatsApp"
        >
          <MessageSquare className="w-3.5 h-3.5" />
        </a>
        <div className="relative">
          <button
            onClick={() => setShowSnooze((s) => !s)}
            disabled={disabled}
            className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center hover:bg-amber-100 disabled:opacity-50"
            title="Snooze"
          >
            <Clock className="w-3.5 h-3.5" />
          </button>
          {showSnooze && (
            <div className="absolute right-0 top-full mt-1 bg-white border border-stone-200 rounded-xl shadow-lg z-10 overflow-hidden min-w-[110px]">
              {[
                { label: "+1 day", days: 1 },
                { label: "+3 days", days: 3 },
                { label: "+1 week", days: 7 },
              ].map((opt) => (
                <button
                  key={opt.days}
                  onClick={() => { onSnooze(opt.days); setShowSnooze(false); }}
                  className="w-full px-3 py-2 text-xs text-left hover:bg-stone-50"
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <Button
          size="sm"
          variant="outline"
          iconLeft={<Check className="w-3 h-3" />}
          onClick={onMarkContacted}
          disabled={disabled}
        >
          Done
        </Button>
      </div>
    </div>
  );
}
