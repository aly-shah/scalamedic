"use client";

/**
 * Follow-Ups
 * ──────────
 * The previous version of this page consumed a flat shape
 * ({ patientName, doctorName, ... }) but the API actually returns nested
 * patient + doctor + appointment objects. Avatars rendered "undefined
 * undefined" initials, doctor labels were blank, and the Schedule /
 * Reschedule actions submitted patientName as patientId — they 500'd on
 * every click. This rewrite uses the real shape, replaces the
 * window.prompt() reschedule with a slide panel + date picker, adds a
 * proper "New follow-up" creation flow, and groups pending items by
 * urgency (Overdue / Today / This Week / Later) instead of one flat grid.
 */

import { useMemo, useState } from "react";
import {
  CalendarClock,
  AlertTriangle,
  Clock,
  CalendarDays,
  CheckCircle,
  Phone,
  Check,
  Stethoscope,
  Plus,
  Search as SearchIcon,
  X,
  RefreshCw,
  CalendarOff,
} from "lucide-react";
import {
  Button,
  Card,
  Badge,
  StatCard,
  SearchInput,
  Select,
  Textarea,
  Input,
} from "@/components/ui";
import { DatePicker } from "@/components/ui/date-picker";
import { SlidePanel } from "@/components/ui/slide-panel";
import { LoadingSpinner } from "@/components/ui/loading";
import { toClinicDay } from "@/lib/utils";
import { useModuleAccess, useModuleEmit } from "@/modules/core/hooks";
import { SystemEvents } from "@/modules/core/events";
import {
  useFollowUps,
  useUpdateFollowUp,
  useCreateFollowUp,
  usePatients,
  useStaff,
} from "@/hooks/use-queries";

// ─── Types matching the real API response ───────────────────────────

type FollowUpStatus = "PENDING" | "COMPLETED" | "MISSED" | "CANCELLED";

interface FollowUp {
  id: string;
  reason: string;
  dueDate: string;
  status: FollowUpStatus;
  notes?: string | null;
  completedAt?: string | null;
  createdAt: string;
  patient?: {
    id: string;
    firstName: string;
    lastName: string;
    patientCode: string;
    phone?: string | null;
  } | null;
  doctor?: { id: string; name: string } | null;
  appointment?: { id: string; appointmentCode: string; date: string } | null;
}

interface PatientLite {
  id: string;
  firstName: string;
  lastName: string;
  patientCode: string;
  phone?: string | null;
}
interface StaffLite {
  id: string;
  name: string;
  role?: string;
  speciality?: string | null;
}

const STATUS_BADGE: Record<FollowUpStatus, "success" | "warning" | "danger" | "default"> = {
  PENDING: "warning",
  COMPLETED: "success",
  MISSED: "danger",
  CANCELLED: "default",
};

// ─── Utilities ──────────────────────────────────────────────────────

function fullName(p: FollowUp["patient"]) {
  if (!p) return "Unknown patient";
  return `${p.firstName} ${p.lastName}`.trim();
}
function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((n) => n[0]?.toUpperCase() ?? "")
    .slice(0, 2)
    .join("");
}

/** Days between today (clinic TZ) and dueDate. Negative = overdue, 0 = today. */
function daysUntilDue(dueDate: string): number {
  const today = toClinicDay(new Date());
  const a = new Date(today + "T00:00:00");
  const b = new Date(dueDate.slice(0, 10) + "T00:00:00");
  const ms = b.getTime() - a.getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

function relativeDue(dueDate: string, status: FollowUpStatus): string {
  if (status === "COMPLETED") return "Completed";
  if (status === "CANCELLED") return "Cancelled";
  const d = daysUntilDue(dueDate);
  if (status === "MISSED") return d === 0 ? "Missed today" : `Missed ${Math.abs(d)} day${Math.abs(d) === 1 ? "" : "s"} ago`;
  if (d < 0) return `Overdue ${Math.abs(d)} day${Math.abs(d) === 1 ? "" : "s"}`;
  if (d === 0) return "Due today";
  if (d === 1) return "Due tomorrow";
  if (d <= 7) return `Due in ${d} days`;
  return `Due in ${d} days`;
}

type UrgencyBucket = "overdue" | "today" | "week" | "later";

function bucketOf(dueDate: string): UrgencyBucket {
  const d = daysUntilDue(dueDate);
  if (d < 0) return "overdue";
  if (d === 0) return "today";
  if (d <= 7) return "week";
  return "later";
}

// ═══════════════════════════════════════════════════════════════════════
// Page
// ═══════════════════════════════════════════════════════════════════════

export default function FollowUpsPage() {
  const access = useModuleAccess("MOD-FOLLOWUP");
  const emit = useModuleEmit("MOD-FOLLOWUP");

  const { data: followUpsResponse, isLoading } = useFollowUps();
  const updateFollowUp = useUpdateFollowUp();
  const createFollowUp = useCreateFollowUp();
  const followUps = (followUpsResponse?.data || []) as FollowUp[];

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | FollowUpStatus | "OVERDUE" | "TODAY" | "WEEK">("ALL");
  const [createOpen, setCreateOpen] = useState(false);
  const [reschedTarget, setReschedTarget] = useState<FollowUp | null>(null);

  // Counts derived once. The same search applies to the visible cards
  // below; counts are unfiltered so the user always sees the global totals.
  const counts = useMemo(() => {
    let overdue = 0,
      today = 0,
      week = 0,
      done = 0,
      missed = 0;
    for (const f of followUps) {
      if (f.status === "COMPLETED") {
        done++;
        continue;
      }
      if (f.status === "MISSED") {
        missed++;
        continue;
      }
      if (f.status !== "PENDING") continue;
      const b = bucketOf(f.dueDate);
      if (b === "overdue") overdue++;
      else if (b === "today") today++;
      else if (b === "week") week++;
    }
    return { overdue, today, week, done, missed };
  }, [followUps]);

  // ─── Filter pipeline ────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return followUps.filter((f) => {
      if (q) {
        const name = fullName(f.patient).toLowerCase();
        const code = (f.patient?.patientCode || "").toLowerCase();
        const doc = (f.doctor?.name || "").toLowerCase();
        const reason = (f.reason || "").toLowerCase();
        if (!name.includes(q) && !code.includes(q) && !doc.includes(q) && !reason.includes(q)) {
          return false;
        }
      }
      switch (statusFilter) {
        case "ALL":
          return true;
        case "OVERDUE":
          return f.status === "PENDING" && bucketOf(f.dueDate) === "overdue";
        case "TODAY":
          return f.status === "PENDING" && bucketOf(f.dueDate) === "today";
        case "WEEK":
          return f.status === "PENDING" && bucketOf(f.dueDate) === "week";
        default:
          return f.status === statusFilter;
      }
    });
  }, [followUps, search, statusFilter]);

  // ─── Bucketing for "ALL" or "PENDING" filters ──────────────────
  const bucketed = useMemo(() => {
    const groups: Record<UrgencyBucket | "later" | "done", FollowUp[]> = {
      overdue: [],
      today: [],
      week: [],
      later: [],
      done: [],
    };
    const showBuckets = statusFilter === "ALL" || statusFilter === "PENDING";
    if (!showBuckets) return null;
    for (const f of filtered) {
      if (f.status === "PENDING") {
        groups[bucketOf(f.dueDate)].push(f);
      } else if (f.status === "COMPLETED") {
        groups.done.push(f);
      }
    }
    // Sort each bucket by due date asc
    (Object.keys(groups) as (keyof typeof groups)[]).forEach((k) =>
      groups[k].sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1))
    );
    return groups;
  }, [filtered, statusFilter]);

  // ─── Actions ────────────────────────────────────────────────────
  const markCompleted = (f: FollowUp) => {
    updateFollowUp.mutate(
      { id: f.id, data: { status: "COMPLETED" } },
      { onSuccess: () => emit(SystemEvents.FOLLOWUP_COMPLETED, { id: f.id, patientName: fullName(f.patient) }) }
    );
  };
  const markMissed = (f: FollowUp) => {
    updateFollowUp.mutate({ id: f.id, data: { status: "MISSED" } });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <LoadingSpinner size="lg" />
      </div>
    );
  }
  if (!access.canView) {
    return (
      <div className="flex items-center justify-center py-20 text-stone-500 text-sm">
        You don&apos;t have access to this module.
      </div>
    );
  }

  return (
    <div data-id="PATIENT-TAB-FOLLOWUPS" className="animate-fade-in space-y-5 sm:space-y-6">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl border border-stone-100 bg-gradient-to-br from-amber-500 via-orange-500 to-rose-500 px-5 py-5 sm:px-7 sm:py-6 text-white">
        <div className="absolute inset-0 opacity-25 [background:radial-gradient(circle_at_70%_30%,#fff_0,transparent_45%)]" />
        <div className="relative flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <CalendarClock className="w-4 h-4" />
              <span className="text-[11px] uppercase tracking-wider font-semibold opacity-90">Follow-Ups</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-semibold leading-tight">Stay on top of post-visit care.</h1>
            <p className="text-sm opacity-90 mt-1 max-w-xl">
              Overdue items first, then today, then the week ahead. Click a stat card to filter.
            </p>
          </div>
          <Button
            onClick={() => setCreateOpen(true)}
            iconLeft={<Plus className="w-4 h-4" />}
            className="!bg-white !text-orange-600 hover:!bg-stone-50"
          >
            New follow-up
          </Button>
        </div>
      </div>

      {/* Stat cards as filters */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatFilterCard
          label="Overdue"
          value={counts.overdue}
          icon={<AlertTriangle className="w-5 h-5" />}
          color="danger"
          active={statusFilter === "OVERDUE"}
          onClick={() => setStatusFilter(statusFilter === "OVERDUE" ? "ALL" : "OVERDUE")}
        />
        <StatFilterCard
          label="Due Today"
          value={counts.today}
          icon={<Clock className="w-5 h-5" />}
          color="warning"
          active={statusFilter === "TODAY"}
          onClick={() => setStatusFilter(statusFilter === "TODAY" ? "ALL" : "TODAY")}
        />
        <StatFilterCard
          label="This Week"
          value={counts.week}
          icon={<CalendarDays className="w-5 h-5" />}
          color="info"
          active={statusFilter === "WEEK"}
          onClick={() => setStatusFilter(statusFilter === "WEEK" ? "ALL" : "WEEK")}
        />
        <StatFilterCard
          label="Completed"
          value={counts.done}
          icon={<CheckCircle className="w-5 h-5" />}
          color="success"
          active={statusFilter === "COMPLETED"}
          onClick={() => setStatusFilter(statusFilter === "COMPLETED" ? "ALL" : "COMPLETED")}
        />
      </div>

      {/* Search + filter chips */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-3">
        <SearchInput
          placeholder="Search patients, codes, doctors, or reasons..."
          value={search}
          onChange={setSearch}
          className="w-full sm:max-w-sm"
        />
        <div className="flex flex-wrap gap-2">
          {([
            { key: "ALL", label: "All" },
            { key: "PENDING", label: "Pending" },
            { key: "COMPLETED", label: "Completed" },
            { key: "MISSED", label: "Missed" },
            { key: "CANCELLED", label: "Cancelled" },
          ] as const).map((f) => (
            <button
              key={f.key}
              onClick={() => setStatusFilter(f.key)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-all cursor-pointer ${
                statusFilter === f.key
                  ? "bg-stone-900 text-white shadow-sm"
                  : "bg-stone-100 text-stone-500 hover:bg-stone-200"
              }`}
            >
              {f.label}
            </button>
          ))}
          {(search || statusFilter !== "ALL") && (
            <button
              onClick={() => {
                setSearch("");
                setStatusFilter("ALL");
              }}
              className="px-3 py-1.5 rounded-full text-xs font-medium text-stone-500 hover:text-stone-700 cursor-pointer flex items-center gap-1"
            >
              <X className="w-3 h-3" /> Clear
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      {filtered.length === 0 ? (
        <EmptyState onCreate={() => setCreateOpen(true)} />
      ) : bucketed ? (
        <div className="space-y-7">
          {bucketed.overdue.length > 0 && (
            <BucketSection
              title="Overdue"
              count={bucketed.overdue.length}
              accent="bg-red-50 text-red-700 ring-red-200"
              cards={bucketed.overdue}
              onComplete={markCompleted}
              onMiss={markMissed}
              onReschedule={setReschedTarget}
              busyId={updateFollowUp.isPending ? "?" : null}
            />
          )}
          {bucketed.today.length > 0 && (
            <BucketSection
              title="Due Today"
              count={bucketed.today.length}
              accent="bg-amber-50 text-amber-700 ring-amber-200"
              cards={bucketed.today}
              onComplete={markCompleted}
              onMiss={markMissed}
              onReschedule={setReschedTarget}
              busyId={null}
            />
          )}
          {bucketed.week.length > 0 && (
            <BucketSection
              title="This Week"
              count={bucketed.week.length}
              accent="bg-teal-50 text-teal-700 ring-teal-200"
              cards={bucketed.week}
              onComplete={markCompleted}
              onMiss={markMissed}
              onReschedule={setReschedTarget}
              busyId={null}
            />
          )}
          {bucketed.later.length > 0 && (
            <BucketSection
              title="Later"
              count={bucketed.later.length}
              accent="bg-stone-50 text-stone-700 ring-stone-200"
              cards={bucketed.later}
              onComplete={markCompleted}
              onMiss={markMissed}
              onReschedule={setReschedTarget}
              busyId={null}
            />
          )}
          {statusFilter === "ALL" && bucketed.done.length > 0 && (
            <BucketSection
              title="Completed"
              count={bucketed.done.length}
              accent="bg-emerald-50 text-emerald-700 ring-emerald-200"
              cards={bucketed.done.slice(0, 12)}
              footer={
                bucketed.done.length > 12
                  ? `Showing 12 of ${bucketed.done.length}. Use the "Completed" filter to see all.`
                  : undefined
              }
              onComplete={markCompleted}
              onMiss={markMissed}
              onReschedule={setReschedTarget}
              busyId={null}
            />
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
          {filtered.map((f) => (
            <FollowUpCard
              key={f.id}
              followUp={f}
              onComplete={markCompleted}
              onMiss={markMissed}
              onReschedule={setReschedTarget}
              busy={false}
            />
          ))}
        </div>
      )}

      {/* Create panel */}
      <CreateFollowUpPanel
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreate={(data) => {
          createFollowUp.mutate(data, {
            onSuccess: () => {
              setCreateOpen(false);
              emit(SystemEvents.FOLLOWUP_SCHEDULED, {
                patientId: data.patientId,
                dueDate: data.dueDate,
              });
            },
          });
        }}
        submitting={createFollowUp.isPending}
      />

      {/* Reschedule panel */}
      <ReschedulePanel
        target={reschedTarget}
        onClose={() => setReschedTarget(null)}
        onSave={(id, dueDate) => {
          updateFollowUp.mutate(
            { id, data: { dueDate, status: "PENDING" } },
            {
              onSuccess: () => {
                setReschedTarget(null);
                emit(SystemEvents.FOLLOWUP_SCHEDULED, { id, dueDate });
              },
            }
          );
        }}
        submitting={updateFollowUp.isPending}
      />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Pieces
// ═══════════════════════════════════════════════════════════════════════

function StatFilterCard({
  label,
  value,
  icon,
  color,
  active,
  onClick,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  color: "danger" | "warning" | "info" | "success";
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`text-left w-full transition-all rounded-2xl ${
        active ? "ring-2 ring-stone-900 ring-offset-2 ring-offset-white" : "hover:scale-[1.01]"
      }`}
    >
      <StatCard label={label} value={value} icon={icon} color={color} />
    </button>
  );
}

function BucketSection({
  title,
  count,
  accent,
  cards,
  onComplete,
  onMiss,
  onReschedule,
  busyId,
  footer,
}: {
  title: string;
  count: number;
  accent: string;
  cards: FollowUp[];
  onComplete: (f: FollowUp) => void;
  onMiss: (f: FollowUp) => void;
  onReschedule: (f: FollowUp) => void;
  busyId: string | null;
  footer?: string;
}) {
  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ring-1 ${accent}`}>
          {title}
        </span>
        <span className="text-xs text-stone-400">{count}</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
        {cards.map((f) => (
          <FollowUpCard
            key={f.id}
            followUp={f}
            onComplete={onComplete}
            onMiss={onMiss}
            onReschedule={onReschedule}
            busy={busyId === f.id}
          />
        ))}
      </div>
      {footer && <p className="text-xs text-stone-400 mt-2">{footer}</p>}
    </section>
  );
}

function FollowUpCard({
  followUp,
  onComplete,
  onMiss,
  onReschedule,
  busy,
}: {
  followUp: FollowUp;
  onComplete: (f: FollowUp) => void;
  onMiss: (f: FollowUp) => void;
  onReschedule: (f: FollowUp) => void;
  busy: boolean;
}) {
  const name = fullName(followUp.patient);
  const days = daysUntilDue(followUp.dueDate);
  const isPending = followUp.status === "PENDING";
  const isOverdue = isPending && days < 0;
  const isToday = isPending && days === 0;
  const phone = followUp.patient?.phone;

  const borderClass = isOverdue
    ? "border-2 border-red-200"
    : isToday
      ? "border-2 border-amber-200"
      : "border border-stone-100";
  const avatarClass = isOverdue
    ? "bg-red-50 text-red-700"
    : isToday
      ? "bg-amber-50 text-amber-700"
      : "bg-teal-50 text-teal-700";

  return (
    <Card
      padding="lg"
      className={`bg-white rounded-2xl shadow-sm animate-fade-in ${borderClass} ${
        busy ? "opacity-60 pointer-events-none" : ""
      }`}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0 ${avatarClass}`}>
            {initials(name)}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-stone-900 truncate">{name}</p>
            <div className="flex items-center gap-2 text-[11px] text-stone-500">
              {followUp.patient?.patientCode && <span className="font-mono">{followUp.patient.patientCode}</span>}
              {followUp.doctor?.name && (
                <span className="flex items-center gap-1 truncate">
                  <Stethoscope className="w-3 h-3" />
                  {followUp.doctor.name}
                </span>
              )}
            </div>
          </div>
        </div>
        <Badge variant={STATUS_BADGE[followUp.status]} dot>
          {followUp.status}
        </Badge>
      </div>

      <p className="text-sm text-stone-700 mb-3 line-clamp-2 leading-relaxed">
        {followUp.reason || <span className="italic text-stone-400">No reason recorded</span>}
      </p>

      <div className="flex items-center justify-between text-xs text-stone-500 mb-3">
        <span className="flex items-center gap-1.5">
          <CalendarClock className="w-3.5 h-3.5" />
          {relativeDue(followUp.dueDate, followUp.status)}
        </span>
        {followUp.appointment?.appointmentCode && (
          <span className="font-mono text-[10px] text-stone-400">{followUp.appointment.appointmentCode}</span>
        )}
      </div>

      {/* Actions row varies by status */}
      <div className="flex items-center gap-2 pt-3 border-t border-stone-100 flex-wrap">
        {phone && (
          <a
            href={`tel:${phone}`}
            className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-stone-100 text-stone-700 hover:bg-stone-200 transition-colors"
            title={phone}
          >
            <Phone className="w-3.5 h-3.5" />
            Call
          </a>
        )}
        {(followUp.status === "PENDING" || followUp.status === "MISSED") && (
          <Button
            size="sm"
            variant="outline"
            iconLeft={<RefreshCw className="w-3.5 h-3.5" />}
            onClick={() => onReschedule(followUp)}
          >
            Reschedule
          </Button>
        )}
        {followUp.status === "PENDING" && (
          <>
            <Button
              size="sm"
              variant="outline"
              iconLeft={<CalendarOff className="w-3.5 h-3.5" />}
              onClick={() => onMiss(followUp)}
              title="Mark as missed"
            >
              Miss
            </Button>
            <Button
              size="sm"
              variant="success"
              iconLeft={<Check className="w-3.5 h-3.5" />}
              onClick={() => onComplete(followUp)}
              className="ml-auto"
            >
              Complete
            </Button>
          </>
        )}
      </div>
    </Card>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="rounded-2xl border-2 border-dashed border-stone-200 py-16 px-6 text-center">
      <div className="w-14 h-14 mx-auto rounded-full bg-amber-50 flex items-center justify-center mb-3">
        <CalendarClock className="w-7 h-7 text-amber-400" />
      </div>
      <p className="text-sm text-stone-700 font-medium mb-1">No follow-ups match this filter.</p>
      <p className="text-xs text-stone-400 mb-4">Schedule one to keep a patient on track.</p>
      <Button onClick={onCreate} iconLeft={<Plus className="w-4 h-4" />}>
        New follow-up
      </Button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Create panel — patient typeahead + doctor select + date + reason
// ═══════════════════════════════════════════════════════════════════════

function CreateFollowUpPanel({
  open,
  onClose,
  onCreate,
  submitting,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (data: { patientId: string; doctorId: string; dueDate: string; reason: string; notes?: string }) => void;
  submitting: boolean;
}) {
  const [patientQuery, setPatientQuery] = useState("");
  const [patientId, setPatientId] = useState("");
  const [doctorId, setDoctorId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");

  // Patient typeahead — same pattern as the dispense panel.
  const { data: patientsRes } = usePatients(patientQuery.length >= 2 ? { search: patientQuery } : undefined);
  const patients = ((patientsRes?.data || []) as PatientLite[]).slice(0, 6);
  const selectedPatient = patients.find((p) => p.id === patientId);

  const { data: staffRes } = useStaff();
  const doctors = (((staffRes as { data?: StaffLite[] })?.data || []) as StaffLite[]).filter(
    (u) => u.role === "DOCTOR"
  );

  const reset = () => {
    setPatientQuery("");
    setPatientId("");
    setDoctorId("");
    setDueDate("");
    setReason("");
    setNotes("");
  };

  const submit = () => {
    if (!patientId || !doctorId || !dueDate || !reason.trim()) return;
    onCreate({ patientId, doctorId, dueDate, reason: reason.trim(), notes: notes.trim() || undefined });
  };

  return (
    <SlidePanel
      isOpen={open}
      onClose={() => {
        onClose();
        reset();
      }}
      title="New follow-up"
      subtitle="Schedule a post-visit check-in for a patient."
      width="lg"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => { onClose(); reset(); }}>Cancel</Button>
          <Button
            onClick={submit}
            disabled={submitting || !patientId || !doctorId || !dueDate || !reason.trim()}
            iconLeft={<Plus className="w-4 h-4" />}
          >
            {submitting ? "Saving..." : "Schedule"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4 pt-1">
        {/* Patient typeahead */}
        <div>
          <label className="text-sm font-medium text-stone-700 mb-1.5 block">Patient</label>
          {selectedPatient ? (
            <div className="flex items-center justify-between rounded-xl border border-teal-200 bg-teal-50 px-3.5 py-2.5">
              <div>
                <p className="text-sm font-semibold text-stone-900">{selectedPatient.firstName} {selectedPatient.lastName}</p>
                <p className="text-[11px] text-stone-500 font-mono">
                  {selectedPatient.patientCode}
                  {selectedPatient.phone ? ` · ${selectedPatient.phone}` : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={() => { setPatientId(""); setPatientQuery(""); }}
                className="text-stone-500 hover:text-stone-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <>
              <Input
                placeholder="Search by name, phone, or code (min 2 chars)…"
                value={patientQuery}
                onChange={(e) => setPatientQuery(e.target.value)}
                iconLeft={<SearchIcon className="w-4 h-4" />}
              />
              {patientQuery.length >= 2 && patients.length > 0 && (
                <div className="mt-2 rounded-xl border border-stone-200 bg-white shadow-sm divide-y divide-stone-100 max-h-[220px] overflow-y-auto">
                  {patients.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => { setPatientId(p.id); setPatientQuery(`${p.firstName} ${p.lastName}`); }}
                      className="w-full text-left px-3.5 py-2.5 hover:bg-stone-50 cursor-pointer"
                    >
                      <p className="text-sm font-medium text-stone-900">{p.firstName} {p.lastName}</p>
                      <p className="text-[11px] text-stone-500 font-mono">
                        {p.patientCode}
                        {p.phone ? ` · ${p.phone}` : ""}
                      </p>
                    </button>
                  ))}
                </div>
              )}
              {patientQuery.length >= 2 && patients.length === 0 && (
                <p className="mt-1.5 text-xs text-stone-400">No patients match.</p>
              )}
            </>
          )}
        </div>

        <Select
          label="Doctor"
          value={doctorId}
          onChange={(e) => setDoctorId(e.target.value)}
          options={doctors.map((d) => ({ value: d.id, label: d.name + (d.speciality ? ` · ${d.speciality}` : "") }))}
          placeholder={doctors.length === 0 ? "No doctors available" : "Pick a doctor…"}
        />

        <DatePicker
          label="Due date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          placeholder="Pick a date"
        />

        <Textarea
          label="Reason"
          placeholder="e.g. Review post-laser pigmentation"
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          required
        />

        <Textarea
          label="Notes (optional)"
          placeholder="Anything the doctor should know going in…"
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>
    </SlidePanel>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Reschedule panel — DatePicker only
// ═══════════════════════════════════════════════════════════════════════

function ReschedulePanel({
  target,
  onClose,
  onSave,
  submitting,
}: {
  target: FollowUp | null;
  onClose: () => void;
  onSave: (id: string, dueDate: string) => void;
  submitting: boolean;
}) {
  const [dueDate, setDueDate] = useState("");

  // Reset the picker when a different target is selected.
  // We avoid useEffect-on-prop by computing once per render.
  const targetId = target?.id ?? "";
  const [seenId, setSeenId] = useState("");
  if (targetId !== seenId) {
    setSeenId(targetId);
    setDueDate(target?.dueDate?.slice(0, 10) ?? "");
  }

  return (
    <SlidePanel
      isOpen={!!target}
      onClose={onClose}
      title="Reschedule follow-up"
      subtitle={target ? `${fullName(target.patient)} · currently ${relativeDue(target.dueDate, target.status).toLowerCase()}` : ""}
      width="md"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => target && onSave(target.id, dueDate)}
            disabled={submitting || !dueDate || !target}
            iconLeft={<RefreshCw className="w-4 h-4" />}
          >
            {submitting ? "Saving..." : "Save new date"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4 pt-1">
        {target && (
          <div className="rounded-xl bg-stone-50 px-3.5 py-3 text-xs text-stone-600 leading-relaxed">
            <p className="font-medium text-stone-900 mb-0.5">{target.reason || "No reason recorded"}</p>
            {target.doctor?.name && (
              <p>
                Originally scheduled with {target.doctor.name} for{" "}
                <span className="font-mono">{target.dueDate?.slice(0, 10)}</span>.
              </p>
            )}
          </div>
        )}

        <DatePicker
          label="New due date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          placeholder="Pick a date"
        />

        {target?.status === "MISSED" && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
            This follow-up was marked missed — saving will move it back to <strong>Pending</strong> on the new date.
          </p>
        )}
      </div>
    </SlidePanel>
  );
}
