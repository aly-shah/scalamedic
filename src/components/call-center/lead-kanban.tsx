"use client";

import { useMemo, useState, type DragEvent } from "react";
import {
  Phone, MessageSquare, Mail, CalendarClock, XCircle, ChevronDown, ChevronRight,
} from "lucide-react";
import { Card, Badge, Avatar } from "@/components/ui";
import { timeAgo, CLINIC_TZ } from "@/lib/utils";
import { useUpdateLead } from "@/hooks/use-queries";
import { LeadStatus } from "@/types";
import { useModuleEmit } from "@/modules/core/hooks";
import { SystemEvents } from "@/modules/core/events";

interface LeadRow {
  id: string;
  name: string;
  phone: string;
  email?: string | null;
  status: string;
  interest?: string | null;
  source: string;
  notes?: string | null;
  callbackDate?: string | null;
  createdAt: string;
}

const ACTIVE_COLUMNS: Array<{ status: string; label: string; color: string; accent: string }> = [
  { status: LeadStatus.NEW,        label: "New",        color: "bg-teal-50/70",     accent: "border-t-teal-500" },
  { status: LeadStatus.CONTACTED,  label: "Contacted",  color: "bg-sky-50/70",      accent: "border-t-sky-500" },
  { status: LeadStatus.INTERESTED, label: "Interested", color: "bg-amber-50/70",    accent: "border-t-amber-500" },
  { status: LeadStatus.FOLLOW_UP,  label: "Follow-up",  color: "bg-indigo-50/70",   accent: "border-t-indigo-500" },
  { status: LeadStatus.BOOKED,     label: "Booked",     color: "bg-emerald-50/70",  accent: "border-t-emerald-500" },
];

export function LeadKanban({ leads }: { leads: LeadRow[] }) {
  const updateLead = useUpdateLead();
  const emit = useModuleEmit("MOD-COMMUNICATION");
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [showLost, setShowLost] = useState(false);
  // Optimistic overrides: leadId → status that the UI should show before the
  // server confirms the mutation. Cleared as useLeads refetches.
  const [optimistic, setOptimistic] = useState<Record<string, string>>({});

  const displayStatus = (lead: LeadRow) => optimistic[lead.id] ?? lead.status;

  const byColumn = useMemo(() => {
    const groups: Record<string, LeadRow[]> = { [LeadStatus.NOT_INTERESTED]: [] };
    for (const col of ACTIVE_COLUMNS) groups[col.status] = [];
    for (const lead of leads) {
      const s = displayStatus(lead);
      if (!groups[s]) groups[s] = [];
      groups[s].push(lead);
    }
    // newest first in each column
    for (const s of Object.keys(groups)) {
      groups[s].sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1));
    }
    return groups;
    // displayStatus depends on optimistic; memo tracked via those two deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leads, optimistic]);

  const applyStatusChange = (leadId: string, newStatus: string, currentStatus: string) => {
    if (newStatus === currentStatus) return;
    // Optimistic
    setOptimistic((m) => ({ ...m, [leadId]: newStatus }));
    updateLead.mutate(
      { id: leadId, data: { status: newStatus } },
      {
        onSuccess: () => {
          emit(SystemEvents.LEAD_UPDATED, { id: leadId, status: newStatus });
          setOptimistic((m) => {
            const next = { ...m };
            delete next[leadId];
            return next;
          });
        },
        onError: () => {
          setOptimistic((m) => {
            const next = { ...m };
            delete next[leadId];
            return next;
          });
        },
      }
    );
  };

  // ---- DnD handlers ----
  const onDragStart = (e: DragEvent<HTMLDivElement>, leadId: string) => {
    setDragId(leadId);
    e.dataTransfer.setData("text/lead-id", leadId);
    e.dataTransfer.effectAllowed = "move";
  };
  const onDragEnd = () => {
    setDragId(null);
    setDropTarget(null);
  };
  const onDragOver = (e: DragEvent<HTMLDivElement>, status: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dropTarget !== status) setDropTarget(status);
  };
  const onDragLeave = (e: DragEvent<HTMLDivElement>) => {
    if (e.currentTarget === e.target) setDropTarget(null);
  };
  const onDrop = (e: DragEvent<HTMLDivElement>, status: string) => {
    e.preventDefault();
    const leadId = e.dataTransfer.getData("text/lead-id") || dragId;
    setDropTarget(null);
    setDragId(null);
    if (!leadId) return;
    const lead = leads.find((l) => l.id === leadId);
    if (!lead) return;
    applyStatusChange(leadId, status, displayStatus(lead));
  };

  const lostLeads = byColumn[LeadStatus.NOT_INTERESTED] || [];
  const lostIsTarget = dropTarget === LeadStatus.NOT_INTERESTED && dragId;

  return (
    <div>
      <p className="text-lg font-semibold text-stone-700 mb-3">Lead Pipeline</p>

      {/* Columns: flex-1 with min-w so 5 columns fill width on wide screens, stay 200px minimum + scroll on narrow */}
      <div className="overflow-x-auto -mx-2 px-2 pb-2">
        <div className="flex gap-2">
          {ACTIVE_COLUMNS.map((col) => {
            const leadsInCol = byColumn[col.status] || [];
            const isTarget = dropTarget === col.status && dragId;
            return (
              <div
                key={col.status}
                onDragOver={(e) => onDragOver(e, col.status)}
                onDragLeave={onDragLeave}
                onDrop={(e) => onDrop(e, col.status)}
                className={`flex-1 min-w-[200px] rounded-xl border-t-4 ${col.accent} ${col.color} transition-colors ${
                  isTarget ? "ring-2 ring-teal-400 bg-teal-100/50" : ""
                }`}
              >
                <div className="flex items-center justify-between px-2.5 py-2">
                  <span className="text-[11px] font-semibold text-stone-700 uppercase tracking-wider truncate">{col.label}</span>
                  <Badge variant="default">{leadsInCol.length}</Badge>
                </div>
                <div className="px-1.5 pb-1.5 space-y-1.5 min-h-[60px]">
                  {leadsInCol.map((lead) => (
                    <LeadCard
                      key={lead.id}
                      lead={lead}
                      isDragging={dragId === lead.id}
                      onDragStart={(e) => onDragStart(e, lead.id)}
                      onDragEnd={onDragEnd}
                      onMarkLost={() => applyStatusChange(lead.id, LeadStatus.NOT_INTERESTED, displayStatus(lead))}
                    />
                  ))}
                  {leadsInCol.length === 0 && (
                    <p className="text-[10px] text-stone-400 italic text-center py-3">Drop here</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Lost drop strip — always a drop target; expands to reveal cards */}
      <div
        onDragOver={(e) => onDragOver(e, LeadStatus.NOT_INTERESTED)}
        onDragLeave={onDragLeave}
        onDrop={(e) => onDrop(e, LeadStatus.NOT_INTERESTED)}
        className={`mt-3 rounded-xl bg-red-50/60 border border-red-100 transition-colors ${
          lostIsTarget ? "ring-2 ring-red-300 bg-red-100/70" : ""
        }`}
      >
        <button
          onClick={() => setShowLost((s) => !s)}
          className="w-full flex items-center justify-between px-3 py-2 cursor-pointer"
        >
          <div className="flex items-center gap-2">
            {showLost ? <ChevronDown className="w-3.5 h-3.5 text-red-400" /> : <ChevronRight className="w-3.5 h-3.5 text-red-400" />}
            <XCircle className="w-3.5 h-3.5 text-red-500" />
            <span className="text-[11px] font-semibold text-red-700 uppercase tracking-wider">Lost</span>
            <Badge variant="danger">{lostLeads.length}</Badge>
          </div>
          <span className="text-[10px] text-red-400">
            {dragId ? "Drop here to mark lost" : showLost ? "Hide" : "Show"}
          </span>
        </button>
        {showLost && lostLeads.length > 0 && (
          <div className="px-2 pb-2 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-1.5">
            {lostLeads.map((lead) => (
              <LeadCard
                key={lead.id}
                lead={lead}
                isDragging={dragId === lead.id}
                onDragStart={(e) => onDragStart(e, lead.id)}
                onDragEnd={onDragEnd}
                dimmed
              />
            ))}
          </div>
        )}
      </div>

      <p className="text-[11px] text-stone-400 mt-2">Drag cards between columns to update a lead&apos;s status. Changes save automatically.</p>
    </div>
  );
}

// ---- Card ----
function LeadCard({
  lead, isDragging, onDragStart, onDragEnd, onMarkLost, dimmed,
}: {
  lead: LeadRow;
  isDragging: boolean;
  onDragStart: (e: DragEvent<HTMLDivElement>) => void;
  onDragEnd: () => void;
  onMarkLost?: () => void;
  dimmed?: boolean;
}) {
  const phoneDigits = lead.phone.replace(/[^0-9]/g, "");
  const callbackDue = lead.callbackDate ? new Date(lead.callbackDate) : null;
  // Comparing to wall-clock time during render is fine here — the card
  // re-renders when React re-renders, and stale "overdue" for a few ms is harmless.
  // eslint-disable-next-line react-hooks/purity
  const overdue = callbackDue && callbackDue.getTime() < Date.now();

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={`group bg-white rounded-lg border border-stone-100 p-1.5 cursor-grab active:cursor-grabbing transition-all ${
        isDragging ? "opacity-40 scale-95" : "hover:shadow-sm hover:border-stone-200"
      } ${dimmed ? "opacity-70" : ""}`}
    >
      {/* Row 1: avatar, name/phone, hover-only X */}
      <div className="flex items-center gap-1.5">
        <Avatar name={lead.name} size="sm" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-stone-900 truncate leading-tight">{lead.name}</p>
          <p className="text-[10px] text-stone-500 font-mono truncate">{lead.phone}</p>
        </div>
        {onMarkLost && (
          <button
            onClick={onMarkLost}
            onPointerDown={(e) => e.stopPropagation()}
            className="p-0.5 rounded text-stone-300 hover:bg-red-50 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
            title="Mark lost"
          >
            <XCircle className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* Row 2: interest one-liner (only if present) */}
      {lead.interest && (
        <p className="text-[10px] text-stone-600 mt-1 line-clamp-1">{lead.interest}</p>
      )}

      {/* Row 3: meta chips + quick actions on one line */}
      <div className="flex items-center gap-1 mt-1.5">
        {callbackDue && (
          <span className={`inline-flex items-center gap-0.5 text-[9px] px-1 py-0.5 rounded font-medium shrink-0 ${
            overdue ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"
          }`}>
            <CalendarClock className="w-2 h-2" />
            {callbackDue.toLocaleDateString("en-PK", { timeZone: CLINIC_TZ, month: "short", day: "numeric" })}
          </span>
        )}
        <span className="text-[9px] text-stone-400 truncate flex-1">
          {lead.source.replace(/_/g, " ").toLowerCase()} · {timeAgo(lead.createdAt)}
        </span>
        <div className="flex items-center gap-0.5 shrink-0" onPointerDown={(e) => e.stopPropagation()}>
          <a href={`tel:${lead.phone}`} title="Call"
            className="w-5 h-5 rounded bg-teal-50 text-teal-600 flex items-center justify-center hover:bg-teal-100"
            onDragStart={(e) => e.preventDefault()}
          >
            <Phone className="w-2.5 h-2.5" />
          </a>
          <a href={`https://wa.me/${phoneDigits}`} target="_blank" rel="noopener noreferrer" title="WhatsApp"
            className="w-5 h-5 rounded bg-emerald-50 text-emerald-600 flex items-center justify-center hover:bg-emerald-100"
            onDragStart={(e) => e.preventDefault()}
          >
            <MessageSquare className="w-2.5 h-2.5" />
          </a>
          {lead.email && (
            <a href={`mailto:${lead.email}`} title="Email"
              className="w-5 h-5 rounded bg-blue-50 text-blue-600 flex items-center justify-center hover:bg-blue-100"
              onDragStart={(e) => e.preventDefault()}
            >
              <Mail className="w-2.5 h-2.5" />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

// Card = wrapper for consistency (unused but exported for future direct use)
export { Card };
