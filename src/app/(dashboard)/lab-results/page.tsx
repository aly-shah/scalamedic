"use client";

/**
 * Lab Results
 * ───────────
 * Same problem the Follow-Ups page had: this view consumed
 * { patientName, doctorName } as flat strings but the API returns nested
 * patient + doctor + appointment objects, so the patient row rendered
 * "undefined" everywhere. The Request / View / Download buttons were
 * also pure decoration — none had handlers, and no PUT endpoint existed
 * for status transitions.
 *
 * Rewrite:
 *   - Real types matching the LabTest + nested patient/doctor shape.
 *   - Hero header + clickable status stat cards that double as filters.
 *   - Stage pipeline: Requested → Sample Collected → Processing →
 *     Completed (+ Cancelled rollup). Each stage gets its own section
 *     with the right accent colour so the lab tech can see queues at a
 *     glance.
 *   - Request panel: patient typeahead, doctor select, test name +
 *     optional code, priority, notes. Patches into the existing POST.
 *   - Details panel: full record + an "Advance status" stepper, an
 *     "Enter results" textarea, and per-stage timestamps. Hits the new
 *     PUT route.
 */

import { useMemo, useState } from "react";
import {
  FlaskConical,
  Plus,
  ChevronRight,
  Calendar,
  Stethoscope,
  Search as SearchIcon,
  X,
  Phone,
  Activity,
  AlertCircle,
  CheckCircle2,
  Clock,
  Beaker,
  CircleDashed,
  XCircle,
  Loader2,
  FileText,
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
import { SlidePanel } from "@/components/ui/slide-panel";
import { LoadingSpinner } from "@/components/ui/loading";
import { formatDate } from "@/lib/utils";
import { useModuleAccess } from "@/modules/core/hooks";
import {
  useLabTests,
  useCreateLabTest,
  useUpdateLabTest,
  usePatients,
  useStaff,
} from "@/hooks/use-queries";

// ─── Types ──────────────────────────────────────────────────────────

type LabStatus = "REQUESTED" | "SAMPLE_COLLECTED" | "PROCESSING" | "COMPLETED" | "CANCELLED";
type Priority = "NORMAL" | "URGENT" | "EMERGENCY";

interface LabTest {
  id: string;
  testName: string;
  testCode?: string | null;
  status: LabStatus;
  priority: Priority;
  technician?: string | null;
  notes?: string | null;
  results?: unknown;
  collectedAt?: string | null;
  completedAt?: string | null;
  createdAt: string;
  patient?: {
    id: string;
    firstName: string;
    lastName: string;
    patientCode: string;
    phone?: string | null;
  } | null;
  doctor?: { id: string; name: string; speciality?: string | null } | null;
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

// ─── Status metadata ────────────────────────────────────────────────

const STATUS_META: Record<
  LabStatus,
  {
    label: string;
    badge: "warning" | "info" | "success" | "danger" | "default";
    accent: string;
    icon: typeof Clock;
    next: LabStatus | null;
    nextLabel: string | null;
  }
> = {
  REQUESTED: {
    label: "Requested",
    badge: "warning",
    accent: "bg-amber-50 text-amber-700 ring-amber-200",
    icon: CircleDashed,
    next: "SAMPLE_COLLECTED",
    nextLabel: "Mark sample collected",
  },
  SAMPLE_COLLECTED: {
    label: "Sample Collected",
    badge: "info",
    accent: "bg-sky-50 text-sky-700 ring-sky-200",
    icon: Beaker,
    next: "PROCESSING",
    nextLabel: "Move to processing",
  },
  PROCESSING: {
    label: "Processing",
    badge: "info",
    accent: "bg-violet-50 text-violet-700 ring-violet-200",
    icon: Activity,
    next: "COMPLETED",
    nextLabel: "Mark completed",
  },
  COMPLETED: {
    label: "Completed",
    badge: "success",
    accent: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    icon: CheckCircle2,
    next: null,
    nextLabel: null,
  },
  CANCELLED: {
    label: "Cancelled",
    badge: "default",
    accent: "bg-stone-100 text-stone-600 ring-stone-200",
    icon: XCircle,
    next: null,
    nextLabel: null,
  },
};

const PRIORITY_BADGE: Record<Priority, "default" | "warning" | "danger"> = {
  NORMAL: "default",
  URGENT: "warning",
  EMERGENCY: "danger",
};

const PIPELINE: LabStatus[] = ["REQUESTED", "SAMPLE_COLLECTED", "PROCESSING", "COMPLETED"];

// ─── Helpers ────────────────────────────────────────────────────────

function fullName(p: LabTest["patient"]): string {
  if (!p) return "Unknown patient";
  return `${p.firstName} ${p.lastName}`.trim();
}
function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).map((n) => n[0]?.toUpperCase() ?? "").slice(0, 2).join("");
}
function fmtDateTime(d?: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-PK", {
    timeZone: "Asia/Karachi",
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: true,
  });
}

/** Render results JSON as a list for the details panel. Falls back to
 *  raw string output if it isn't a plain object. */
function renderResults(results: unknown): { label: string; value: string }[] | string | null {
  if (results == null) return null;
  if (typeof results === "string") return results;
  if (typeof results === "object") {
    try {
      const obj = results as Record<string, unknown>;
      const entries = Object.entries(obj);
      if (entries.length === 0) return null;
      return entries.map(([k, v]) => ({
        label: k,
        value: typeof v === "object" ? JSON.stringify(v) : String(v ?? ""),
      }));
    } catch {
      return JSON.stringify(results);
    }
  }
  return String(results);
}

// ═══════════════════════════════════════════════════════════════════════
// Page
// ═══════════════════════════════════════════════════════════════════════

export default function LabResultsPage() {
  const access = useModuleAccess("MOD-CONSULTATION");

  const { data: labTestsResponse, isLoading } = useLabTests();
  const labTests = (labTestsResponse?.data || []) as LabTest[];
  const createLabTest = useCreateLabTest();
  const updateLabTest = useUpdateLabTest();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | LabStatus>("ALL");
  const [requestOpen, setRequestOpen] = useState(false);
  const [detailTarget, setDetailTarget] = useState<LabTest | null>(null);

  const counts = useMemo(() => {
    const c: Record<LabStatus, number> = {
      REQUESTED: 0, SAMPLE_COLLECTED: 0, PROCESSING: 0, COMPLETED: 0, CANCELLED: 0,
    };
    for (const t of labTests) c[t.status]++;
    return c;
  }, [labTests]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return labTests.filter((t) => {
      if (q) {
        const name = fullName(t.patient).toLowerCase();
        const code = (t.patient?.patientCode || "").toLowerCase();
        const test = (t.testName || "").toLowerCase();
        const tcode = (t.testCode || "").toLowerCase();
        const doc = (t.doctor?.name || "").toLowerCase();
        if (
          !name.includes(q) &&
          !code.includes(q) &&
          !test.includes(q) &&
          !tcode.includes(q) &&
          !doc.includes(q)
        ) {
          return false;
        }
      }
      if (statusFilter !== "ALL" && t.status !== statusFilter) return false;
      return true;
    });
  }, [labTests, search, statusFilter]);

  // Group by status when "ALL" filter is active (the pipeline view).
  const grouped = useMemo(() => {
    if (statusFilter !== "ALL") return null;
    const groups: Record<LabStatus, LabTest[]> = {
      REQUESTED: [], SAMPLE_COLLECTED: [], PROCESSING: [], COMPLETED: [], CANCELLED: [],
    };
    for (const t of filtered) groups[t.status].push(t);
    (Object.keys(groups) as LabStatus[]).forEach((k) =>
      groups[k].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    );
    return groups;
  }, [filtered, statusFilter]);

  const advance = (t: LabTest, next: LabStatus) => {
    updateLabTest.mutate({ id: t.id, data: { status: next } });
  };

  if (isLoading) {
    return <div className="flex items-center justify-center py-20"><LoadingSpinner size="lg" /></div>;
  }
  if (!access.canView) {
    return (
      <div className="flex items-center justify-center py-20 text-stone-500 text-sm">
        You don&apos;t have access to this module.
      </div>
    );
  }

  return (
    <div data-id="PATIENT-TAB-LABS" className="animate-fade-in space-y-5 sm:space-y-6">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl border border-stone-100 bg-gradient-to-br from-teal-500 via-cyan-500 to-sky-500 px-5 py-5 sm:px-7 sm:py-6 text-white">
        <div className="absolute inset-0 opacity-25 [background:radial-gradient(circle_at_70%_30%,#fff_0,transparent_45%)]" />
        <div className="relative flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <FlaskConical className="w-4 h-4" />
              <span className="text-[11px] uppercase tracking-wider font-semibold opacity-90">Lab Results</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-semibold leading-tight">From request to result, one queue.</h1>
            <p className="text-sm opacity-90 mt-1 max-w-xl">
              Track every test through Requested → Sample Collected → Processing → Completed.
            </p>
          </div>
          <Button
            onClick={() => setRequestOpen(true)}
            iconLeft={<Plus className="w-4 h-4" />}
            className="!bg-white !text-teal-700 hover:!bg-stone-50"
          >
            Request test
          </Button>
        </div>
      </div>

      {/* Stat cards as filters */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatFilterCard
          label="Requested"
          value={counts.REQUESTED}
          icon={<CircleDashed className="w-5 h-5" />}
          color="warning"
          active={statusFilter === "REQUESTED"}
          onClick={() => setStatusFilter(statusFilter === "REQUESTED" ? "ALL" : "REQUESTED")}
        />
        <StatFilterCard
          label="Sample Collected"
          value={counts.SAMPLE_COLLECTED}
          icon={<Beaker className="w-5 h-5" />}
          color="info"
          active={statusFilter === "SAMPLE_COLLECTED"}
          onClick={() => setStatusFilter(statusFilter === "SAMPLE_COLLECTED" ? "ALL" : "SAMPLE_COLLECTED")}
        />
        <StatFilterCard
          label="Processing"
          value={counts.PROCESSING}
          icon={<Activity className="w-5 h-5" />}
          color="info"
          active={statusFilter === "PROCESSING"}
          onClick={() => setStatusFilter(statusFilter === "PROCESSING" ? "ALL" : "PROCESSING")}
        />
        <StatFilterCard
          label="Completed"
          value={counts.COMPLETED}
          icon={<CheckCircle2 className="w-5 h-5" />}
          color="success"
          active={statusFilter === "COMPLETED"}
          onClick={() => setStatusFilter(statusFilter === "COMPLETED" ? "ALL" : "COMPLETED")}
        />
      </div>

      {/* Search + chips */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-3">
        <SearchInput
          placeholder="Search test name / code, patient, doctor..."
          value={search}
          onChange={setSearch}
          className="w-full sm:max-w-sm"
        />
        <div className="flex flex-wrap gap-2">
          {(["ALL", ...PIPELINE, "CANCELLED"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setStatusFilter(f as "ALL" | LabStatus)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-all cursor-pointer ${
                statusFilter === f
                  ? "bg-stone-900 text-white shadow-sm"
                  : "bg-stone-100 text-stone-500 hover:bg-stone-200"
              }`}
            >
              {f === "ALL" ? "All" : STATUS_META[f as LabStatus].label}
            </button>
          ))}
          {(search || statusFilter !== "ALL") && (
            <button
              onClick={() => { setSearch(""); setStatusFilter("ALL"); }}
              className="px-3 py-1.5 rounded-full text-xs font-medium text-stone-500 hover:text-stone-700 cursor-pointer flex items-center gap-1"
            >
              <X className="w-3 h-3" /> Clear
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      {filtered.length === 0 ? (
        <EmptyState onCreate={() => setRequestOpen(true)} />
      ) : grouped ? (
        <div className="space-y-7">
          {PIPELINE.map((s) =>
            grouped[s].length > 0 ? (
              <PipelineSection
                key={s}
                status={s}
                items={grouped[s]}
                onAdvance={advance}
                onOpen={setDetailTarget}
                busyId={updateLabTest.isPending ? "?" : null}
              />
            ) : null
          )}
          {grouped.CANCELLED.length > 0 && (
            <PipelineSection
              status="CANCELLED"
              items={grouped.CANCELLED.slice(0, 9)}
              onAdvance={advance}
              onOpen={setDetailTarget}
              busyId={null}
              footer={
                grouped.CANCELLED.length > 9
                  ? `Showing 9 of ${grouped.CANCELLED.length}. Use the "Cancelled" filter for the rest.`
                  : undefined
              }
            />
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
          {filtered.map((t) => (
            <LabCard key={t.id} test={t} onAdvance={advance} onOpen={setDetailTarget} busy={false} />
          ))}
        </div>
      )}

      <RequestTestPanel
        open={requestOpen}
        onClose={() => setRequestOpen(false)}
        onCreate={(data) => {
          createLabTest.mutate(data, { onSuccess: () => setRequestOpen(false) });
        }}
        submitting={createLabTest.isPending}
      />

      <DetailsPanel
        target={detailTarget}
        onClose={() => setDetailTarget(null)}
        onUpdate={(id, data, opts) => {
          updateLabTest.mutate(
            { id, data },
            {
              onSuccess: () => {
                if (opts?.closeAfter) setDetailTarget(null);
              },
            }
          );
        }}
        submitting={updateLabTest.isPending}
      />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Pieces
// ═══════════════════════════════════════════════════════════════════════

function StatFilterCard({
  label, value, icon, color, active, onClick,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  color: "warning" | "info" | "success" | "danger";
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

function PipelineSection({
  status, items, onAdvance, onOpen, busyId, footer,
}: {
  status: LabStatus;
  items: LabTest[];
  onAdvance: (t: LabTest, next: LabStatus) => void;
  onOpen: (t: LabTest) => void;
  busyId: string | null;
  footer?: string;
}) {
  const meta = STATUS_META[status];
  const Icon = meta.icon;
  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ring-1 ${meta.accent}`}>
          <Icon className="w-3.5 h-3.5" />
          {meta.label}
        </span>
        <span className="text-xs text-stone-400">{items.length}</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
        {items.map((t) => (
          <LabCard
            key={t.id}
            test={t}
            onAdvance={onAdvance}
            onOpen={onOpen}
            busy={busyId === t.id}
          />
        ))}
      </div>
      {footer && <p className="text-xs text-stone-400 mt-2">{footer}</p>}
    </section>
  );
}

function LabCard({
  test, onAdvance, onOpen, busy,
}: {
  test: LabTest;
  onAdvance: (t: LabTest, next: LabStatus) => void;
  onOpen: (t: LabTest) => void;
  busy: boolean;
}) {
  const meta = STATUS_META[test.status];
  const Icon = meta.icon;
  const name = fullName(test.patient);

  return (
    <Card
      padding="lg"
      className={`bg-white rounded-2xl border border-stone-100 shadow-sm animate-fade-in ${
        busy ? "opacity-60 pointer-events-none" : ""
      }`}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-teal-50 flex items-center justify-center flex-shrink-0">
            <FlaskConical className="w-5 h-5 text-teal-600" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-stone-900 truncate">{test.testName}</p>
            <p className="text-[11px] text-stone-500 font-mono">
              {test.testCode || `LAB-${test.id.slice(0, 6).toUpperCase()}`}
            </p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <Badge variant={meta.badge} dot>
            <Icon className="w-3 h-3 mr-1" />
            {meta.label}
          </Badge>
          {test.priority !== "NORMAL" && (
            <Badge variant={PRIORITY_BADGE[test.priority]}>{test.priority}</Badge>
          )}
        </div>
      </div>

      <div className="space-y-1.5 mb-3 text-xs">
        <div className="flex items-center gap-2 text-stone-700">
          <div className="w-7 h-7 rounded-full bg-stone-100 flex items-center justify-center text-[10px] font-semibold text-stone-600">
            {initials(name)}
          </div>
          <div className="min-w-0">
            <p className="font-medium truncate">{name}</p>
            <p className="text-[10px] text-stone-500 font-mono">{test.patient?.patientCode || "—"}</p>
          </div>
        </div>
        {test.doctor?.name && (
          <div className="flex items-center gap-1.5 text-stone-500">
            <Stethoscope className="w-3 h-3" />
            <span className="truncate">{test.doctor.name}</span>
          </div>
        )}
        <div className="flex items-center gap-1.5 text-stone-500">
          <Calendar className="w-3 h-3" />
          <span>Ordered {formatDate(test.createdAt)}</span>
        </div>
      </div>

      <div className="flex items-center gap-2 pt-3 border-t border-stone-100 flex-wrap">
        <Button
          size="sm"
          variant="outline"
          iconLeft={<FileText className="w-3.5 h-3.5" />}
          onClick={() => onOpen(test)}
        >
          Details
        </Button>
        {meta.next && (
          <Button
            size="sm"
            variant="success"
            iconLeft={<ChevronRight className="w-3.5 h-3.5" />}
            onClick={() => onAdvance(test, meta.next!)}
            className="ml-auto"
            title={meta.nextLabel ?? ""}
          >
            {meta.next === "COMPLETED" ? "Complete" : meta.next === "PROCESSING" ? "Process" : "Collect"}
          </Button>
        )}
      </div>
    </Card>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="rounded-2xl border-2 border-dashed border-stone-200 py-16 px-6 text-center">
      <div className="w-14 h-14 mx-auto rounded-full bg-teal-50 flex items-center justify-center mb-3">
        <FlaskConical className="w-7 h-7 text-teal-400" />
      </div>
      <p className="text-sm text-stone-700 font-medium mb-1">No lab tests match this filter.</p>
      <p className="text-xs text-stone-400 mb-4">Order a test to get started.</p>
      <Button onClick={onCreate} iconLeft={<Plus className="w-4 h-4" />}>Request test</Button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Request panel
// ═══════════════════════════════════════════════════════════════════════

const COMMON_TESTS = [
  "CBC (Complete Blood Count)",
  "Vitamin D, 25-Hydroxy",
  "Hormonal Panel",
  "Iron Studies",
  "Liver Function Test",
  "Thyroid Function (TSH)",
  "Skin Allergy Panel",
  "Random Blood Sugar",
];

function RequestTestPanel({
  open, onClose, onCreate, submitting,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (data: {
    patientId: string;
    doctorId: string;
    testName: string;
    testCode?: string;
    priority: Priority;
    notes?: string;
  }) => void;
  submitting: boolean;
}) {
  const [patientQuery, setPatientQuery] = useState("");
  const [patientId, setPatientId] = useState("");
  const [doctorId, setDoctorId] = useState("");
  const [testName, setTestName] = useState("");
  const [testCode, setTestCode] = useState("");
  const [priority, setPriority] = useState<Priority>("NORMAL");
  const [notes, setNotes] = useState("");

  const { data: patientsRes } = usePatients(
    patientQuery.length >= 2 ? { search: patientQuery } : undefined
  );
  const patients = ((patientsRes?.data || []) as PatientLite[]).slice(0, 6);
  const selectedPatient = patients.find((p) => p.id === patientId);

  const { data: staffRes } = useStaff();
  const doctors = (((staffRes as { data?: StaffLite[] })?.data || []) as StaffLite[]).filter(
    (u) => u.role === "DOCTOR"
  );

  const reset = () => {
    setPatientQuery(""); setPatientId(""); setDoctorId("");
    setTestName(""); setTestCode(""); setPriority("NORMAL"); setNotes("");
  };

  const submit = () => {
    if (!patientId || !doctorId || !testName.trim()) return;
    onCreate({
      patientId,
      doctorId,
      testName: testName.trim(),
      testCode: testCode.trim() || undefined,
      priority,
      notes: notes.trim() || undefined,
    });
  };

  return (
    <SlidePanel
      isOpen={open}
      onClose={() => { onClose(); reset(); }}
      title="Request lab test"
      subtitle="Send a new order to the lab queue."
      width="lg"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => { onClose(); reset(); }}>Cancel</Button>
          <Button
            onClick={submit}
            disabled={submitting || !patientId || !doctorId || !testName.trim()}
            iconLeft={submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          >
            {submitting ? "Saving..." : "Order test"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4 pt-1">
        <div>
          <label className="text-sm font-medium text-stone-700 mb-1.5 block">Patient</label>
          {selectedPatient ? (
            <div className="flex items-center justify-between rounded-xl border border-teal-200 bg-teal-50 px-3.5 py-2.5">
              <div>
                <p className="text-sm font-semibold text-stone-900">
                  {selectedPatient.firstName} {selectedPatient.lastName}
                </p>
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
                        {p.patientCode}{p.phone ? ` · ${p.phone}` : ""}
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
          label="Ordering doctor"
          value={doctorId}
          onChange={(e) => setDoctorId(e.target.value)}
          options={doctors.map((d) => ({
            value: d.id,
            label: d.name + (d.speciality ? ` · ${d.speciality}` : ""),
          }))}
          placeholder={doctors.length === 0 ? "No doctors available" : "Pick a doctor…"}
        />

        <div>
          <Input
            label="Test name"
            placeholder="e.g. Vitamin D, 25-Hydroxy"
            value={testName}
            onChange={(e) => setTestName(e.target.value)}
            required
          />
          <div className="flex flex-wrap gap-1.5 mt-2">
            {COMMON_TESTS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTestName(t)}
                className="text-[11px] px-2.5 py-1 rounded-full bg-stone-100 text-stone-600 hover:bg-teal-50 hover:text-teal-700 cursor-pointer"
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <Input
          label="Test code (optional)"
          placeholder="LAB-2026-0001"
          value={testCode}
          onChange={(e) => setTestCode(e.target.value)}
        />

        <Select
          label="Priority"
          value={priority}
          onChange={(e) => setPriority(e.target.value as Priority)}
          options={[
            { value: "NORMAL", label: "Normal" },
            { value: "URGENT", label: "Urgent" },
            { value: "EMERGENCY", label: "Emergency" },
          ]}
        />

        <Textarea
          label="Notes (optional)"
          placeholder="Special handling, fasting requirements, etc."
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>
    </SlidePanel>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Details panel — full record + advance + result entry
// ═══════════════════════════════════════════════════════════════════════

function DetailsPanel({
  target, onClose, onUpdate, submitting,
}: {
  target: LabTest | null;
  onClose: () => void;
  onUpdate: (id: string, data: Record<string, unknown>, opts?: { closeAfter?: boolean }) => void;
  submitting: boolean;
}) {
  // Reset local state when the target changes — derived-from-prop pattern.
  const [seenId, setSeenId] = useState("");
  const [resultsText, setResultsText] = useState("");
  const [technician, setTechnician] = useState("");
  const [extraNotes, setExtraNotes] = useState("");
  if (target && target.id !== seenId) {
    setSeenId(target.id);
    const existing = target.results;
    setResultsText(
      existing == null
        ? ""
        : typeof existing === "string"
          ? existing
          : JSON.stringify(existing, null, 2)
    );
    setTechnician(target.technician ?? "");
    setExtraNotes(target.notes ?? "");
  }

  if (!target) return null;

  const meta = STATUS_META[target.status];
  const Icon = meta.icon;
  const name = fullName(target.patient);
  const renderedResults = renderResults(target.results);

  const saveResults = () => {
    // Try to parse as JSON (key/value pairs); fall back to a single
    // "summary" string. Either way the lab page renders it correctly.
    let parsed: unknown = null;
    const text = resultsText.trim();
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = { summary: text };
      }
    }
    onUpdate(target.id, {
      results: parsed,
      technician: technician.trim(),
      notes: extraNotes.trim(),
    });
  };

  const advance = (next: LabStatus) => {
    onUpdate(target.id, { status: next });
  };

  return (
    <SlidePanel
      isOpen={!!target}
      onClose={onClose}
      title={target.testName}
      subtitle={`${name} · ${target.patient?.patientCode ?? ""}`}
      width="xl"
      footer={
        <div className="flex justify-between gap-2 w-full flex-wrap">
          <div className="flex gap-2">
            {target.status !== "CANCELLED" && target.status !== "COMPLETED" && (
              <Button
                variant="ghost"
                onClick={() => advance("CANCELLED")}
                iconLeft={<XCircle className="w-4 h-4" />}
              >
                Cancel test
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>Close</Button>
            {meta.next && (
              <Button
                onClick={() => advance(meta.next!)}
                disabled={submitting}
                iconLeft={<ChevronRight className="w-4 h-4" />}
              >
                {meta.nextLabel}
              </Button>
            )}
          </div>
        </div>
      }
    >
      <div className="space-y-5 pt-1">
        {/* Status timeline */}
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-400 mb-2">Status</p>
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            {PIPELINE.map((s, i) => {
              const reached = PIPELINE.indexOf(target.status) >= i;
              const isCurrent = target.status === s;
              const sm = STATUS_META[s];
              const SmIcon = sm.icon;
              return (
                <div key={s} className="flex items-center gap-1.5 flex-shrink-0">
                  <span
                    className={`inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-full ring-1 transition-all ${
                      isCurrent
                        ? sm.accent + " ring-2 scale-105"
                        : reached
                          ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                          : "bg-stone-50 text-stone-400 ring-stone-200"
                    }`}
                  >
                    <SmIcon className="w-3 h-3" />
                    {sm.label}
                  </span>
                  {i < PIPELINE.length - 1 && <ChevronRight className="w-3 h-3 text-stone-300" />}
                </div>
              );
            })}
            {target.status === "CANCELLED" && (
              <span className="ml-2 inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-full ring-1 bg-stone-100 text-stone-600 ring-stone-200">
                <Icon className="w-3 h-3" />
                Cancelled
              </span>
            )}
          </div>
        </div>

        {/* Meta grid */}
        <div className="grid grid-cols-2 gap-3 text-xs">
          <Field label="Patient" value={name} />
          <Field label="Patient code" value={target.patient?.patientCode ?? "—"} mono />
          <Field label="Doctor" value={target.doctor?.name ?? "—"} />
          <Field label="Test code" value={target.testCode || `LAB-${target.id.slice(0, 6).toUpperCase()}`} mono />
          <Field label="Priority" value={target.priority} />
          {target.appointment?.appointmentCode && (
            <Field label="Appointment" value={target.appointment.appointmentCode} mono />
          )}
          <Field label="Ordered" value={fmtDateTime(target.createdAt)} />
          <Field label="Sample collected" value={fmtDateTime(target.collectedAt)} />
          <Field label="Completed" value={fmtDateTime(target.completedAt)} />
          {target.patient?.phone && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-400 mb-0.5">Phone</p>
              <a href={`tel:${target.patient.phone}`} className="inline-flex items-center gap-1 text-sm text-teal-600 hover:underline">
                <Phone className="w-3.5 h-3.5" />
                {target.patient.phone}
              </a>
            </div>
          )}
        </div>

        {/* Existing results read-only */}
        {renderedResults && (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-400 mb-1.5">Results on file</p>
            <div className="rounded-xl bg-stone-50 border border-stone-100 px-3.5 py-3 text-sm text-stone-800 leading-relaxed">
              {Array.isArray(renderedResults) ? (
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5">
                  {renderedResults.map((r) => (
                    <div key={r.label} className="flex justify-between gap-3">
                      <dt className="text-xs text-stone-500 truncate">{r.label}</dt>
                      <dd className="text-sm font-medium text-stone-900 text-right break-words">{r.value}</dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="whitespace-pre-wrap">{renderedResults}</p>
              )}
            </div>
          </div>
        )}

        {/* Result + tech + notes editors */}
        {target.status !== "CANCELLED" && (
          <>
            <Input
              label="Technician (optional)"
              placeholder="Name of the lab technician who ran the test"
              value={technician}
              onChange={(e) => setTechnician(e.target.value)}
            />

            <Textarea
              label={target.status === "COMPLETED" ? "Update results" : "Enter results"}
              placeholder={
                'Free text — or JSON for structured fields, e.g.\n{\n  "Hemoglobin": "14.2 g/dL",\n  "WBC": "7800 /µL"\n}'
              }
              rows={6}
              value={resultsText}
              onChange={(e) => setResultsText(e.target.value)}
            />

            <Textarea
              label="Notes"
              placeholder="Any additional commentary"
              rows={2}
              value={extraNotes}
              onChange={(e) => setExtraNotes(e.target.value)}
            />

            <div className="flex justify-end">
              <Button
                onClick={saveResults}
                disabled={submitting}
                variant="outline"
                iconLeft={submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              >
                {submitting ? "Saving..." : "Save results & notes"}
              </Button>
            </div>
          </>
        )}

        {/* Helpful hint when transitioning */}
        {target.status === "PROCESSING" && (
          <div className="flex items-start gap-2 rounded-xl border border-amber-100 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-800">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>
              When you mark this complete, save the results above first — then click <strong>{meta.nextLabel}</strong> in the footer.
            </span>
          </div>
        )}
      </div>
    </SlidePanel>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-400 mb-0.5">{label}</p>
      <p className={`text-sm text-stone-900 ${mono ? "font-mono" : ""}`}>{value}</p>
    </div>
  );
}
