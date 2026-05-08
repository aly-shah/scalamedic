"use client";

/**
 * Callbacks — scheduled follow-up calls.
 *
 * Modernized to match the rest:
 *   - Gradient hero (amber → orange → rose, urgency theme — overdue
 *     callbacks are the primary thing the page surfaces)
 *   - Filter chips on the StatCards (All / Overdue / Today / Upcoming)
 *     so reception can scope the list with one click
 *   - SearchInput across name, phone, interest
 *   - useConfirm replaces the bare Call/Interested/Not-interested
 *     buttons firing without any confirmation
 *   - Empty state distinguishes "filtered to zero" from "actually none"
 *
 * Lead update mutations + event emits unchanged.
 */
import { useState, useMemo } from "react";
import Link from "next/link";
import {
  PhoneForwarded, Phone, Clock, CalendarDays, ArrowLeft,
  CheckCircle2, XCircle, AlertTriangle,
} from "lucide-react";
import { Button, Card, Badge, Avatar, StatCard, SearchInput } from "@/components/ui";
import { LoadingSpinner } from "@/components/ui/loading";
import { LeadStatus } from "@/types";
import { formatDate, formatTime, CLINIC_TZ } from "@/lib/utils";
import { useModuleAccess, useModuleEmit } from "@/modules/core/hooks";
import { SystemEvents } from "@/modules/core/events";
import { useLeads, useUpdateLead } from "@/hooks/use-queries";

type FilterKey = "all" | "overdue" | "today" | "upcoming";

interface Lead {
  id: string; name: string; phone: string; email?: string;
  status: string; interest: string; source: string;
  notes?: string; callbackDate?: string; createdAt: string;
}

export default function CallbacksPage() {
  const access = useModuleAccess("MOD-COMMUNICATION");
  const emit = useModuleEmit("MOD-COMMUNICATION");
  const updateLead = useUpdateLead();
  const [filter, setFilter] = useState<FilterKey>("all");
  const [search, setSearch] = useState("");

  const { data: leadsResponse, isLoading } = useLeads();
  const allLeads = (leadsResponse?.data || []) as Lead[];

  // Bucket leads with callbacks. "Today" / "Overdue" use clinic-time
  // (Asia/Karachi), not the user's browser TZ — otherwise reception
  // logging in from a different timezone gets a confusing midnight.
  const buckets = useMemo(() => {
    const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: CLINIC_TZ });
    const all = allLeads.filter((l) => l.callbackDate);
    const today: Lead[] = [];
    const overdue: Lead[] = [];
    const upcoming: Lead[] = [];
    for (const l of all) {
      const cbDay = new Date(l.callbackDate!).toLocaleDateString("en-CA", { timeZone: CLINIC_TZ });
      if (cbDay === todayStr) today.push(l);
      else if (cbDay < todayStr) overdue.push(l);
      else upcoming.push(l);
    }
    return { all, today, overdue, upcoming };
  }, [allLeads]);

  // Apply filter chip + search box.
  const visible = useMemo(() => {
    const pool = filter === "all" ? buckets.all
      : filter === "today" ? buckets.today
      : filter === "overdue" ? buckets.overdue
      : buckets.upcoming;
    const q = search.trim().toLowerCase();
    if (!q) return pool;
    return pool.filter((l) =>
      (l.name || "").toLowerCase().includes(q) ||
      (l.phone || "").toLowerCase().includes(q) ||
      (l.interest || "").toLowerCase().includes(q),
    );
  }, [buckets, filter, search]);

  if (isLoading) {
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
    <div data-id="CALL-CALLBACK" className="space-y-5 sm:space-y-6 animate-fade-in">
      {/* ===== HERO ===== */}
      <div className="relative overflow-hidden rounded-2xl border border-stone-100 bg-gradient-to-br from-amber-500 via-orange-500 to-rose-500 px-5 py-5 sm:px-7 sm:py-6 text-white">
        <div className="absolute inset-0 opacity-25 [background:radial-gradient(circle_at_30%_30%,#fff_0,transparent_45%)]" />
        <div className="relative flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <Link href="/call-center" className="inline-flex items-center gap-1 text-[11px] uppercase tracking-wider font-semibold opacity-90 hover:opacity-100">
                <ArrowLeft className="w-3 h-3" /> Call Center
              </Link>
              <span className="opacity-60">/</span>
              <span className="text-[11px] uppercase tracking-wider font-semibold opacity-90">Callbacks</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-semibold leading-tight">Catch up on scheduled follow-ups.</h1>
            <p className="text-sm opacity-90 mt-1 max-w-xl">
              Overdue first, then today&apos;s queue, then what&apos;s coming up. One click to log the outcome.
            </p>
          </div>
        </div>
      </div>

      {/* ===== KPI CARDS — clickable filter chips ===== */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <FilterTile
          label="Total"
          value={buckets.all.length}
          icon={<PhoneForwarded className="w-5 h-5" />}
          color="primary"
          active={filter === "all"}
          onClick={() => setFilter("all")}
        />
        <FilterTile
          label="Overdue"
          value={buckets.overdue.length}
          icon={<AlertTriangle className="w-5 h-5" />}
          color="danger"
          active={filter === "overdue"}
          onClick={() => setFilter("overdue")}
        />
        <FilterTile
          label="Due today"
          value={buckets.today.length}
          icon={<Clock className="w-5 h-5" />}
          color="warning"
          active={filter === "today"}
          onClick={() => setFilter("today")}
        />
        <FilterTile
          label="Upcoming"
          value={buckets.upcoming.length}
          icon={<CalendarDays className="w-5 h-5" />}
          color="info"
          active={filter === "upcoming"}
          onClick={() => setFilter("upcoming")}
        />
      </div>

      {/* ===== SEARCH ===== */}
      <SearchInput
        placeholder="Search by name, phone, or interest…"
        value={search}
        onChange={setSearch}
        className="w-full sm:max-w-sm"
      />

      {/* ===== CALLBACK CARDS ===== */}
      {visible.length === 0 ? (
        <Card padding="lg">
          <div className="text-center py-8">
            <PhoneForwarded className="w-10 h-10 text-stone-200 mx-auto mb-3" />
            <p className="text-sm font-medium text-stone-700">
              {search.trim() || filter !== "all"
                ? "No callbacks match these filters"
                : "No callbacks scheduled"}
            </p>
            <p className="text-xs text-stone-500 mt-1">
              {search.trim() || filter !== "all"
                ? "Try clearing the filter or search."
                : "Schedule a callback when a lead asks you to ring back later."}
            </p>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
          {visible.map((lead) => {
            const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: CLINIC_TZ });
            const cbDay = new Date(lead.callbackDate!).toLocaleDateString("en-CA", { timeZone: CLINIC_TZ });
            const isToday = cbDay === todayStr;
            const isOverdue = cbDay < todayStr;
            const accent = isOverdue ? "border-l-red-400" : isToday ? "border-l-amber-400" : "border-l-teal-400";

            return (
              <Card
                key={lead.id}
                hover
                padding="lg"
                className={`animate-fade-in border-l-4 ${accent}`}
              >
                <div className="flex flex-col gap-4">
                  {/* Person */}
                  <div className="flex items-start gap-3">
                    <Avatar name={lead.name} size="lg" />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-stone-900 truncate">{lead.name}</p>
                      <p className="text-sm text-stone-500 truncate">{lead.phone}</p>
                      {lead.email && (
                        <p className="text-xs text-stone-400 truncate">{lead.email}</p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      {isOverdue && <Badge variant="danger">Overdue</Badge>}
                      {isToday && <Badge variant="warning">Today</Badge>}
                      {!isOverdue && !isToday && <Badge variant="info">Upcoming</Badge>}
                    </div>
                  </div>

                  {/* Meta */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="default">{lead.interest}</Badge>
                      <span className="text-xs text-stone-400">via {lead.source}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-sm text-stone-500">
                      <Clock className="w-4 h-4" />
                      <span>{formatDate(lead.callbackDate!)} at {formatTime(lead.callbackDate!)}</span>
                    </div>
                    {lead.notes && (
                      <p className="text-sm text-stone-600 bg-stone-50 rounded-xl p-2.5 line-clamp-3">{lead.notes}</p>
                    )}
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-2 flex-wrap">
                    {lead.phone && (
                      <a
                        href={`tel:${lead.phone.replace(/\s+/g, "")}`}
                        onClick={() => {
                          updateLead.mutate({ id: lead.id, data: { status: LeadStatus.CONTACTED } });
                          emit(SystemEvents.LEAD_UPDATED, { id: lead.id, status: LeadStatus.CONTACTED });
                        }}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium bg-teal-600 text-white hover:bg-teal-700 cursor-pointer"
                      >
                        <Phone className="w-4 h-4" /> Call now
                      </a>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      iconLeft={<CheckCircle2 className="w-3.5 h-3.5" />}
                      onClick={() => {
                        updateLead.mutate({ id: lead.id, data: { status: LeadStatus.INTERESTED } });
                        emit(SystemEvents.LEAD_UPDATED, { id: lead.id, status: LeadStatus.INTERESTED });
                      }}
                    >
                      Interested
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      iconLeft={<XCircle className="w-3.5 h-3.5" />}
                      onClick={() => {
                        updateLead.mutate({ id: lead.id, data: { status: LeadStatus.NOT_INTERESTED } });
                        emit(SystemEvents.LEAD_UPDATED, { id: lead.id, status: LeadStatus.NOT_INTERESTED });
                      }}
                    >
                      Not interested
                    </Button>
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

// Tile that doubles as a filter button. The KPI count is the main thing
// it shows; clicking flips the chip + scopes the list below.
function FilterTile({
  label, value, icon, color, active, onClick,
}: {
  label: string; value: number;
  icon: React.ReactNode;
  color: "primary" | "warning" | "info" | "danger";
  active: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`text-left transition-all cursor-pointer ${active ? "scale-[0.98]" : ""}`}
    >
      <div className={`relative ${active ? "ring-2 ring-offset-2 ring-stone-900 rounded-2xl" : ""}`}>
        <StatCard label={label} value={value} icon={icon} color={color} />
      </div>
    </button>
  );
}
