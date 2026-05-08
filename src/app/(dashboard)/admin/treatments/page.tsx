"use client";

/**
 * Treatments catalog
 * ──────────────────
 * Same shape of bug the other admin pages had: the "Add Treatment"
 * button rendered with no onClick, there was no /api/treatments/[id]
 * route, and the local Treatment type omitted half the schema fields
 * (code, preInstructions, postInstructions, contraindications). The
 * search filter also crashed on any treatment with a null description
 * because it called .toLowerCase() unguarded.
 *
 * Rewrite (matching the Follow-Ups / Lab Results template):
 *   - Hero header + working "Add treatment" CTA
 *   - Stat tiles per category, clickable to filter
 *   - Catalog cards show price, duration, code, popularity (procedure
 *     count from _count) and an Active/Inactive dot
 *   - Details slide-panel with full record + Edit + Deactivate actions
 *   - Add / Edit slide-panel with the full editable field set
 *   - Deactivate is soft (isActive=false). Hard delete is intentionally
 *     not exposed because invoice_items.treatmentId is Restrict (v11)
 *     and historical receipts must remain reproducible.
 */

import { useMemo, useState } from "react";
import {
  Plus,
  Clock,
  Sparkles,
  Pencil,
  Trash2,
  X,
  Loader2,
  CheckCircle2,
  Search as SearchIcon,
  Tag,
  Activity,
  TrendingUp,
} from "lucide-react";
import {
  Button,
  Card,
  Badge,
  SearchInput,
  Input,
  Select,
  Textarea,
  StatCard,
} from "@/components/ui";
import { SlidePanel } from "@/components/ui/slide-panel";
import { LoadingSpinner } from "@/components/ui/loading";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { TreatmentCategory, TaxCategory, type Treatment } from "@/types";
import { TAX_CATEGORY_LABELS } from "@/lib/tax-rates";
import { formatCurrency } from "@/lib/utils";
import { useModuleAccess } from "@/modules/core/hooks";
import {
  useTreatments,
  useCreateTreatment,
  useUpdateTreatment,
  useDeleteTreatment,
  useBranches,
} from "@/hooks/use-queries";
import type { Branch } from "@/types";

// ─── Category metadata ──────────────────────────────────────────────

type Cat = `${TreatmentCategory}`;
const CATEGORIES: Cat[] = [
  TreatmentCategory.LASER,
  TreatmentCategory.CHEMICAL_PEEL,
  TreatmentCategory.FACIAL,
  TreatmentCategory.INJECTABLE,
  TreatmentCategory.SURGICAL,
  TreatmentCategory.OTHER,
];

const CAT_META: Record<
  Cat,
  { label: string; badge: "info" | "warning" | "success" | "purple" | "danger" | "default"; tile: string }
> = {
  [TreatmentCategory.LASER]:         { label: "Laser",      badge: "info",    tile: "from-sky-500 to-blue-500" },
  [TreatmentCategory.CHEMICAL_PEEL]: { label: "Peel",       badge: "warning", tile: "from-amber-500 to-orange-500" },
  [TreatmentCategory.FACIAL]:        { label: "Facial",     badge: "success", tile: "from-emerald-500 to-teal-500" },
  [TreatmentCategory.INJECTABLE]:    { label: "Injectable", badge: "purple",  tile: "from-violet-500 to-fuchsia-500" },
  [TreatmentCategory.SURGICAL]:      { label: "Surgical",   badge: "danger",  tile: "from-rose-500 to-pink-500" },
  [TreatmentCategory.OTHER]:         { label: "Other",      badge: "default", tile: "from-stone-400 to-stone-500" },
};

// ─── Helpers ────────────────────────────────────────────────────────

function priceNumber(p: Treatment["basePrice"]): number {
  if (typeof p === "number") return Number.isFinite(p) ? p : 0;
  if (typeof p === "string") {
    const n = parseFloat(p);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}
function fmtDuration(mins: number) {
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

// ═══════════════════════════════════════════════════════════════════════
// Page
// ═══════════════════════════════════════════════════════════════════════

export default function TreatmentsPage() {
  const access = useModuleAccess("MOD-PROCEDURE");
  const { data: response, isLoading } = useTreatments();
  const treatments = (response?.data || []) as Treatment[];
  // Branches are needed at the page level so we can render branch chips on
  // the details panel without re-fetching per-row.
  const { data: branchesRes } = useBranches();
  const branches = ((branchesRes?.data || []) as Branch[]).filter((b) => b.isActive);

  const create = useCreateTreatment();
  const update = useUpdateTreatment();
  const remove = useDeleteTreatment();
  const { confirm } = useConfirm();

  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState<"ALL" | Cat>("ALL");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ACTIVE" | "INACTIVE">("ACTIVE");

  const [formMode, setFormMode] = useState<"closed" | "create" | "edit">("closed");
  const [formTarget, setFormTarget] = useState<Treatment | null>(null);
  const [detailTarget, setDetailTarget] = useState<Treatment | null>(null);

  // ─── Counts (unfiltered totals, displayed on filter tiles) ────────
  const counts = useMemo(() => {
    const byCat: Record<Cat, number> = Object.fromEntries(CATEGORIES.map((c) => [c, 0])) as Record<Cat, number>;
    let activeTotal = 0;
    let inactiveTotal = 0;
    for (const t of treatments) {
      byCat[t.category as Cat] = (byCat[t.category as Cat] || 0) + 1;
      if (t.isActive) activeTotal++;
      else inactiveTotal++;
    }
    return { byCat, activeTotal, inactiveTotal };
  }, [treatments]);

  // ─── Headline metrics — driven off the visible filter so the figures
  // change to match what's on screen.
  const headlineSets = useMemo(() => {
    const visible = treatments.filter((t) => {
      if (statusFilter === "ACTIVE" && !t.isActive) return false;
      if (statusFilter === "INACTIVE" && t.isActive) return false;
      if (catFilter !== "ALL" && t.category !== catFilter) return false;
      return true;
    });
    const total = visible.length;
    const avgPrice = total ? Math.round(visible.reduce((s, t) => s + priceNumber(t.basePrice), 0) / total) : 0;
    const totalProcedures = visible.reduce((s, t) => s + (t._count?.procedures ?? 0), 0);
    const mostBooked = visible.reduce<Treatment | null>((best, t) => {
      const cur = t._count?.procedures ?? 0;
      const prev = best?._count?.procedures ?? 0;
      return cur > prev ? t : best;
    }, null);
    return { total, avgPrice, totalProcedures, mostBooked };
  }, [treatments, statusFilter, catFilter]);

  // ─── Filter pipeline ──────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return treatments.filter((t) => {
      if (statusFilter === "ACTIVE" && !t.isActive) return false;
      if (statusFilter === "INACTIVE" && t.isActive) return false;
      if (catFilter !== "ALL" && t.category !== catFilter) return false;
      if (q) {
        const desc = (t.description || "").toLowerCase();
        const code = (t.code || "").toLowerCase();
        if (!t.name.toLowerCase().includes(q) && !desc.includes(q) && !code.includes(q)) {
          return false;
        }
      }
      return true;
    });
  }, [treatments, search, statusFilter, catFilter]);

  // ─── Mutations ────────────────────────────────────────────────────
  const submitForm = (data: TreatmentFormData) => {
    const payload = data as unknown as Record<string, unknown>;
    if (formMode === "edit" && formTarget) {
      update.mutate(
        { id: formTarget.id, data: payload },
        {
          onSuccess: () => {
            setFormMode("closed");
            setFormTarget(null);
            // Keep the details panel target up to date so the new values are visible.
            setDetailTarget((prev) => (prev?.id === formTarget.id ? ({ ...prev, ...data } as Treatment) : prev));
          },
        }
      );
    } else {
      create.mutate(payload, {
        onSuccess: () => {
          setFormMode("closed");
          setFormTarget(null);
        },
      });
    }
  };

  const handleDeactivate = async (t: Treatment) => {
    const usageCount = (t._count?.procedures ?? 0) + (t._count?.invoiceItems ?? 0);
    const ok = await confirm({
      title: `Deactivate ${t.name}?`,
      message:
        usageCount > 0
          ? `This treatment has been used ${usageCount} time(s). It will be hidden from the catalog but kept in historical records.`
          : "This will hide the treatment from the catalog. It can be re-activated later by editing.",
      confirmLabel: "Deactivate",
      variant: "warning",
    });
    if (!ok) return;
    remove.mutate(t.id, {
      onSuccess: () => setDetailTarget(null),
    });
  };

  if (!access.canView) {
    return (
      <div className="flex items-center justify-center py-20 text-stone-500 text-sm">
        You don&apos;t have access to this module.
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div data-id="ADMIN-TREATMENTS" className="animate-fade-in space-y-5 sm:space-y-6">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl border border-stone-100 bg-gradient-to-br from-teal-500 via-emerald-500 to-lime-500 px-5 py-5 sm:px-7 sm:py-6 text-white">
        <div className="absolute inset-0 opacity-25 [background:radial-gradient(circle_at_30%_30%,#fff_0,transparent_45%)]" />
        <div className="relative flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <Sparkles className="w-4 h-4" />
              <span className="text-[11px] uppercase tracking-wider font-semibold opacity-90">Treatments</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-semibold leading-tight">Your service catalog.</h1>
            <p className="text-sm opacity-90 mt-1 max-w-xl">
              Treatments here drive booking, billing, and packages. Keep prices and durations accurate.
            </p>
          </div>
          <Button
            onClick={() => { setFormTarget(null); setFormMode("create"); }}
            iconLeft={<Plus className="w-4 h-4" />}
            className="!bg-white !text-emerald-700 hover:!bg-stone-50"
          >
            Add treatment
          </Button>
        </div>
      </div>

      {/* Headline metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard
          label="In catalog"
          value={headlineSets.total}
          icon={<Tag className="w-5 h-5" />}
          color="info"
        />
        <StatCard
          label="Avg. price"
          value={formatCurrency(headlineSets.avgPrice)}
          icon={<TrendingUp className="w-5 h-5" />}
          color="success"
        />
        <StatCard
          label="Procedures performed"
          value={headlineSets.totalProcedures}
          icon={<Activity className="w-5 h-5" />}
          color="warning"
        />
        <StatCard
          label="Most booked"
          value={headlineSets.mostBooked?.name ?? "—"}
          icon={<Sparkles className="w-5 h-5" />}
          color="purple"
        />
      </div>

      {/* Category filter tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-2 sm:gap-3">
        <CategoryTile
          label="All"
          count={treatments.length}
          gradient="from-stone-700 to-stone-800"
          active={catFilter === "ALL"}
          onClick={() => setCatFilter("ALL")}
        />
        {CATEGORIES.map((c) => (
          <CategoryTile
            key={c}
            label={CAT_META[c].label}
            count={counts.byCat[c] ?? 0}
            gradient={CAT_META[c].tile}
            active={catFilter === c}
            onClick={() => setCatFilter(catFilter === c ? "ALL" : c)}
          />
        ))}
      </div>

      {/* Search + status chips */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-3">
        <SearchInput
          placeholder="Search by name, code, or description..."
          value={search}
          onChange={setSearch}
          className="w-full sm:max-w-sm"
        />
        <div className="flex flex-wrap gap-2">
          {([
            { key: "ACTIVE", label: `Active (${counts.activeTotal})` },
            { key: "ALL", label: `All (${treatments.length})` },
            { key: "INACTIVE", label: `Inactive (${counts.inactiveTotal})` },
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
          {(search || catFilter !== "ALL" || statusFilter !== "ACTIVE") && (
            <button
              onClick={() => { setSearch(""); setCatFilter("ALL"); setStatusFilter("ACTIVE"); }}
              className="px-3 py-1.5 rounded-full text-xs font-medium text-stone-500 hover:text-stone-700 cursor-pointer flex items-center gap-1"
            >
              <X className="w-3 h-3" /> Clear
            </button>
          )}
        </div>
      </div>

      {/* Cards */}
      {filtered.length === 0 ? (
        <EmptyState onCreate={() => { setFormTarget(null); setFormMode("create"); }} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
          {filtered.map((t) => (
            <TreatmentCard
              key={t.id}
              treatment={t}
              onOpen={() => setDetailTarget(t)}
              onEdit={() => { setFormTarget(t); setFormMode("edit"); }}
            />
          ))}
        </div>
      )}

      {/* Form (create or edit) */}
      <TreatmentFormPanel
        mode={formMode === "edit" ? "edit" : "create"}
        open={formMode !== "closed"}
        target={formTarget}
        onClose={() => { setFormMode("closed"); setFormTarget(null); }}
        onSubmit={submitForm}
        submitting={create.isPending || update.isPending}
      />

      {/* Details */}
      <DetailsPanel
        target={detailTarget}
        branches={branches}
        onClose={() => setDetailTarget(null)}
        onEdit={(t) => { setFormTarget(t); setFormMode("edit"); setDetailTarget(null); }}
        onDeactivate={handleDeactivate}
        onActivate={(t) =>
          update.mutate(
            { id: t.id, data: { isActive: true } },
            { onSuccess: () => setDetailTarget((p) => (p ? { ...p, isActive: true } : p)) }
          )
        }
        deactivating={remove.isPending}
        toggling={update.isPending}
      />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Pieces
// ═══════════════════════════════════════════════════════════════════════

function CategoryTile({
  label, count, gradient, active, onClick,
}: {
  label: string;
  count: number;
  gradient: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`relative overflow-hidden rounded-2xl px-3 py-3 text-left transition-all bg-gradient-to-br ${gradient} ${
        active ? "ring-2 ring-stone-900 ring-offset-2 ring-offset-white scale-[1.02]" : "hover:scale-[1.02] opacity-90 hover:opacity-100"
      }`}
    >
      <div className="absolute inset-0 opacity-25 [background:radial-gradient(circle_at_70%_30%,#fff_0,transparent_60%)]" />
      <div className="relative">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-white/85">{label}</p>
        <p className="text-xl sm:text-2xl font-bold text-white leading-none mt-1">{count}</p>
      </div>
    </button>
  );
}

function TreatmentCard({
  treatment, onOpen, onEdit,
}: {
  treatment: Treatment;
  onOpen: () => void;
  onEdit: () => void;
}) {
  const meta = CAT_META[treatment.category as Cat];
  const procedures = treatment._count?.procedures ?? 0;

  return (
    <Card
      hover
      padding="lg"
      onClick={onOpen}
      className={`bg-white rounded-2xl border border-stone-100 shadow-sm animate-fade-in cursor-pointer transition-shadow hover:shadow-md ${
        !treatment.isActive ? "opacity-60" : ""
      }`}
    >
      <div className="flex flex-col gap-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-teal-50 flex items-center justify-center flex-shrink-0">
              <Sparkles className="w-5 h-5 text-teal-600" />
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-stone-900 truncate">{treatment.name}</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <Badge variant={meta.badge}>{meta.label}</Badge>
                {treatment.code && (
                  <span className="text-[10px] text-stone-400 font-mono truncate">{treatment.code}</span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={(e) => { e.stopPropagation(); onEdit(); }}
              className="text-stone-400 hover:text-teal-600 transition-colors p-1 cursor-pointer"
              aria-label="Edit"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <span
              className={`w-2 h-2 rounded-full ${treatment.isActive ? "bg-emerald-400" : "bg-stone-300"}`}
              title={treatment.isActive ? "Active" : "Inactive"}
            />
          </div>
        </div>

        {treatment.description ? (
          <p className="text-sm text-stone-500 line-clamp-2 leading-relaxed">{treatment.description}</p>
        ) : (
          <p className="text-sm text-stone-300 italic">No description</p>
        )}

        <div className="flex items-center justify-between pt-3 border-t border-stone-100">
          <div className="flex items-center gap-1.5 text-xs text-stone-500">
            <Clock className="w-3.5 h-3.5" />
            {fmtDuration(treatment.duration)}
          </div>
          <div className="text-sm font-semibold text-stone-900">
            {formatCurrency(priceNumber(treatment.basePrice))}
          </div>
        </div>

        {procedures > 0 && (
          <p className="text-[10px] text-stone-400 -mt-1 flex items-center gap-1">
            <Activity className="w-3 h-3" />
            {procedures} performed
          </p>
        )}
      </div>
    </Card>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="rounded-2xl border-2 border-dashed border-stone-200 py-16 px-6 text-center">
      <div className="w-14 h-14 mx-auto rounded-full bg-emerald-50 flex items-center justify-center mb-3">
        <Sparkles className="w-7 h-7 text-emerald-400" />
      </div>
      <p className="text-sm text-stone-700 font-medium mb-1">No treatments match this filter.</p>
      <p className="text-xs text-stone-400 mb-4">Add one to grow the catalog.</p>
      <Button onClick={onCreate} iconLeft={<Plus className="w-4 h-4" />}>Add treatment</Button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Form panel (create + edit share the same panel in two modes)
// ═══════════════════════════════════════════════════════════════════════

interface TreatmentFormData {
  name: string;
  code?: string;
  category: TreatmentCategory;
  taxCategory: TaxCategory;
  description?: string;
  duration: number;
  basePrice: number;
  preInstructions?: string;
  postInstructions?: string;
  contraindications?: string;
  branchIds: string[];
  isActive?: boolean;
}

function TreatmentFormPanel({
  mode, open, target, onClose, onSubmit, submitting,
}: {
  mode: "create" | "edit";
  open: boolean;
  target: Treatment | null;
  onClose: () => void;
  onSubmit: (data: TreatmentFormData) => void;
  submitting: boolean;
}) {
  // Active branches for the multi-select.
  const { data: branchesRes } = useBranches();
  const branches = (((branchesRes?.data || []) as Branch[]).filter((b) => b.isActive));

  // Reset whenever we re-open or switch target.
  const [seenKey, setSeenKey] = useState<string>("");
  const key = `${open}::${target?.id ?? ""}::${mode}`;

  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [category, setCategory] = useState<TreatmentCategory>(TreatmentCategory.LASER);
  const [taxCategory, setTaxCategory] = useState<TaxCategory>(TaxCategory.MEDICAL);
  const [description, setDescription] = useState("");
  // AI draft helper — fills description / pre / post / contraindications
  // off the entered name + category. Server-side, see
  // /api/admin/ai/treatment-fields.
  const [aiBusy, setAiBusy] = useState(false);
  const [aiHint, setAiHint] = useState<string | null>(null);
  // Per-field "fix this text" busy state. Keyed by field name so two
  // fixes on different fields don't trample each other.
  const [fixBusy, setFixBusy] = useState<Record<string, boolean>>({});
  const [duration, setDuration] = useState<number>(30);
  const [basePrice, setBasePrice] = useState<number>(0);
  const [preInstructions, setPreInstructions] = useState("");
  const [postInstructions, setPostInstructions] = useState("");
  const [contraindications, setContraindications] = useState("");
  const [branchIds, setBranchIds] = useState<string[]>([]);
  const [isActive, setIsActive] = useState(true);

  if (key !== seenKey) {
    setSeenKey(key);
    if (mode === "edit" && target) {
      setName(target.name ?? "");
      setCode(target.code ?? "");
      setCategory(target.category);
      setTaxCategory(target.taxCategory ?? TaxCategory.MEDICAL);
      setDescription(target.description ?? "");
      setDuration(target.duration ?? 30);
      setBasePrice(priceNumber(target.basePrice));
      setPreInstructions(target.preInstructions ?? "");
      setPostInstructions(target.postInstructions ?? "");
      setContraindications(target.contraindications ?? "");
      setBranchIds((target.branches ?? []).map((b) => b.branchId));
      setIsActive(target.isActive);
    } else if (open && mode === "create") {
      setName(""); setCode(""); setCategory(TreatmentCategory.LASER);
      setTaxCategory(TaxCategory.MEDICAL);
      setDescription(""); setDuration(30); setBasePrice(0);
      setPreInstructions(""); setPostInstructions(""); setContraindications("");
      // Default to "all branches selected" for new treatments — mirrors the
      // v24 backfill semantics so the receptionist still sees the treatment
      // wherever they're booking unless an admin narrows it.
      setBranchIds(branches.map((b) => b.id));
      setIsActive(true);
    }
  }

  const toggleBranch = (id: string) =>
    setBranchIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  // Ask the AI helper to draft the long-form fields off the
  // (name, category) tuple. Result is non-destructive — it only
  // overwrites a target field when the AI returned a non-empty
  // value, so an admin who has half-typed a description doesn't
  // lose it on click.
  const runAiFill = async () => {
    if (!name.trim() || !category || aiBusy) return;
    setAiBusy(true);
    setAiHint(null);
    try {
      const r = await fetch("/api/admin/ai/treatment-fields", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name: name.trim(), category, taxCategory }),
      });
      const d = await r.json();
      if (!d.success) {
        setAiHint(d.error || "AI fill failed");
        return;
      }
      if (d.data?.error) {
        setAiHint(d.data.error);
        return;
      }
      if (d.data.description)       setDescription(d.data.description);
      if (d.data.preInstructions)   setPreInstructions(d.data.preInstructions);
      if (d.data.postInstructions)  setPostInstructions(d.data.postInstructions);
      if (d.data.contraindications) setContraindications(d.data.contraindications);
      setAiHint(d.data.aiPowered === false
        ? "AI not configured. Empty fields untouched."
        : "Drafted by AI — please review and edit before saving.");
    } catch (e) {
      setAiHint(e instanceof Error ? e.message : "AI fill failed");
    } finally {
      setAiBusy(false);
    }
  };

  // Polish whatever's currently in one of the four free-text fields.
  // Server endpoint preserves meaning + tightens grammar/clarity.
  const runFix = async (
    field: "description" | "preInstructions" | "postInstructions" | "contraindications",
    current: string,
    setNext: (v: string) => void,
  ) => {
    if (!current.trim() || fixBusy[field]) return;
    setFixBusy((s) => ({ ...s, [field]: true }));
    setAiHint(null);
    try {
      const r = await fetch("/api/admin/ai/fix-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ field, text: current, name: name.trim(), category }),
      });
      const d = await r.json();
      if (!d.success) {
        setAiHint(d.error || "Polish failed");
        return;
      }
      if (d.data?.error) {
        setAiHint(d.data.error);
        return;
      }
      if (typeof d.data.text === "string" && d.data.text !== current) {
        setNext(d.data.text);
        setAiHint("Polished by AI — please review.");
      } else {
        setAiHint("Already clean.");
      }
    } catch (e) {
      setAiHint(e instanceof Error ? e.message : "Polish failed");
    } finally {
      setFixBusy((s) => ({ ...s, [field]: false }));
    }
  };

  const submit = () => {
    if (!name.trim() || !category || !duration || basePrice < 0) return;
    if (branchIds.length === 0) return; // form button is disabled in this case
    onSubmit({
      name: name.trim(),
      code: code.trim() || undefined,
      category,
      taxCategory,
      description: description.trim() || undefined,
      duration,
      basePrice,
      preInstructions: preInstructions.trim() || undefined,
      postInstructions: postInstructions.trim() || undefined,
      contraindications: contraindications.trim() || undefined,
      branchIds,
      ...(mode === "edit" && { isActive }),
    });
  };

  return (
    <SlidePanel
      isOpen={open}
      onClose={onClose}
      title={mode === "edit" ? "Edit treatment" : "Add treatment"}
      subtitle={
        mode === "edit"
          ? "Changes take effect immediately for new bookings and invoices."
          : "Adds a new entry to the catalog. Receptionists can pick it at booking."
      }
      width="lg"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            onClick={submit}
            disabled={submitting || !name.trim() || !duration || basePrice < 0 || branchIds.length === 0}
            iconLeft={
              submitting ? <Loader2 className="w-4 h-4 animate-spin" /> :
              mode === "edit" ? <CheckCircle2 className="w-4 h-4" /> : <Plus className="w-4 h-4" />
            }
          >
            {submitting ? "Saving..." : mode === "edit" ? "Save changes" : "Add to catalog"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4 pt-1">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="sm:col-span-2">
            <Input
              label="Name"
              placeholder="e.g. Q-Switched Laser, Forehead"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <Input
            label="Code (optional)"
            placeholder="TRT-001"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Select
            label="Category"
            value={category}
            onChange={(e) => setCategory(e.target.value as TreatmentCategory)}
            options={CATEGORIES.map((c) => ({ value: c, label: CAT_META[c].label }))}
          />
          {/* Tax bucket — drives the per-line tax rate when this treatment
              is billed. Defaults to Medical (3%); admin picks Cosmetic /
              Slimming (8%) for purely aesthetic / weight-management
              services per Pakistani tax brackets. */}
          <Select
            label="Tax category"
            value={taxCategory}
            onChange={(e) => setTaxCategory(e.target.value as TaxCategory)}
            options={(Object.keys(TAX_CATEGORY_LABELS) as TaxCategory[]).map((c) => ({
              value: c,
              label: TAX_CATEGORY_LABELS[c],
            }))}
          />
        </div>

        {/* Branch availability — most treatments are branch-specific so the
            admin should explicitly tick each one rather than rely on a
            "global" default. The form pre-selects all active branches for
            new entries to match the v24 backfill behaviour. */}
        <div>
          <label className="text-sm font-medium text-stone-700 mb-1.5 block">
            Available at branches
            <span className="ml-1 text-stone-400 font-normal">({branchIds.length} of {branches.length} selected)</span>
          </label>
          {branches.length === 0 ? (
            <p className="text-xs text-stone-400">No active branches yet. Add a branch first.</p>
          ) : (
            <div className="space-y-1.5">
              <div className="flex flex-wrap gap-1.5">
                {branches.map((b) => {
                  const checked = branchIds.includes(b.id);
                  return (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => toggleBranch(b.id)}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all cursor-pointer border ${
                        checked
                          ? "bg-teal-600 text-white border-teal-600"
                          : "bg-white text-stone-600 border-stone-200 hover:border-stone-300"
                      }`}
                    >
                      <span className={`w-3.5 h-3.5 rounded-full inline-flex items-center justify-center text-[9px] ${checked ? "bg-white/20" : "border border-stone-300"}`}>
                        {checked ? "✓" : ""}
                      </span>
                      {b.name}
                      {b.code && <span className="opacity-70 text-[10px] font-mono">{b.code}</span>}
                    </button>
                  );
                })}
              </div>
              <div className="flex gap-2 text-[11px]">
                <button
                  type="button"
                  onClick={() => setBranchIds(branches.map((b) => b.id))}
                  className="text-teal-600 hover:underline cursor-pointer"
                >
                  Select all
                </button>
                <span className="text-stone-300">·</span>
                <button
                  type="button"
                  onClick={() => setBranchIds([])}
                  className="text-stone-500 hover:text-stone-700 cursor-pointer"
                >
                  Clear
                </button>
              </div>
              {branchIds.length === 0 && (
                <p className="text-[11px] text-amber-600">Select at least one branch — treatments must be available somewhere.</p>
              )}
            </div>
          )}
        </div>

        {/* AI fill — shown once the admin has typed a name + picked a
            category (the two fields the AI needs as input). Click to
            auto-draft description, pre-care, post-care, and
            contraindications. The admin reviews and edits before
            saving. Disabled state explains why. */}
        <div className="rounded-xl border border-dashed border-violet-300 bg-violet-50/60 p-3">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center shrink-0 shadow-sm">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-violet-900">Let AI fill the rest</p>
              <p className="text-xs text-violet-700/80 mt-0.5 leading-snug">
                Drafts the description, pre-/post-care, and contraindications off the name and category. You can edit before saving.
              </p>
              {aiHint && (
                <p className={`mt-1.5 text-[11px] ${aiHint.startsWith("Drafted") ? "text-emerald-700" : "text-amber-700"}`}>
                  {aiHint}
                </p>
              )}
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={runAiFill}
              disabled={!name.trim() || !category || aiBusy}
              iconLeft={aiBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            >
              {aiBusy ? "Drafting…" : "AI fill"}
            </Button>
          </div>
        </div>

        <div>
          <Textarea
            label="Description"
            placeholder="Brief description shown on the catalog card and at booking time."
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <FixWithAi
            disabled={!description.trim()}
            busy={!!fixBusy.description}
            onClick={() => runFix("description", description, setDescription)}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Duration (minutes)"
            type="number"
            min={5}
            max={480}
            value={duration}
            onChange={(e) => setDuration(Math.max(5, Number(e.target.value) || 0))}
          />
          <Input
            label="Base price (PKR)"
            type="number"
            min={0}
            step={100}
            value={basePrice}
            onChange={(e) => setBasePrice(Math.max(0, Number(e.target.value) || 0))}
          />
        </div>

        <div>
          <Textarea
            label="Pre-treatment instructions (optional)"
            placeholder="e.g. No retinoids 5 days prior."
            rows={2}
            value={preInstructions}
            onChange={(e) => setPreInstructions(e.target.value)}
          />
          <FixWithAi
            disabled={!preInstructions.trim()}
            busy={!!fixBusy.preInstructions}
            onClick={() => runFix("preInstructions", preInstructions, setPreInstructions)}
          />
        </div>

        <div>
          <Textarea
            label="Post-treatment instructions (optional)"
            placeholder="e.g. SPF 50 daily for 2 weeks. Avoid hot showers 24h."
            rows={2}
            value={postInstructions}
            onChange={(e) => setPostInstructions(e.target.value)}
          />
          <FixWithAi
            disabled={!postInstructions.trim()}
            busy={!!fixBusy.postInstructions}
            onClick={() => runFix("postInstructions", postInstructions, setPostInstructions)}
          />
        </div>

        <div>
          <Textarea
            label="Contraindications (optional)"
            placeholder="e.g. Pregnancy, active acne, isotretinoin within 6 months."
            rows={2}
            value={contraindications}
            onChange={(e) => setContraindications(e.target.value)}
          />
          <FixWithAi
            disabled={!contraindications.trim()}
            busy={!!fixBusy.contraindications}
            onClick={() => runFix("contraindications", contraindications, setContraindications)}
          />
        </div>

        {mode === "edit" && (
          <label className="flex items-center gap-2 text-sm text-stone-700 cursor-pointer">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="w-4 h-4 rounded border-stone-300 text-teal-600 focus:ring-teal-500"
            />
            Active in catalog
          </label>
        )}
      </div>
    </SlidePanel>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Details panel
// ═══════════════════════════════════════════════════════════════════════

function DetailsPanel({
  target, onClose, onEdit, onDeactivate, onActivate, deactivating, toggling, branches,
}: {
  target: Treatment | null;
  onClose: () => void;
  onEdit: (t: Treatment) => void;
  onDeactivate: (t: Treatment) => void;
  onActivate: (t: Treatment) => void;
  deactivating: boolean;
  toggling: boolean;
  branches: Branch[];
}) {
  if (!target) return null;
  const meta = CAT_META[target.category as Cat];
  const branchById = new Map(branches.map((b) => [b.id, b]));
  const linkedBranches = (target.branches ?? [])
    .map((tb) => branchById.get(tb.branchId))
    .filter((b): b is Branch => !!b);

  return (
    <SlidePanel
      isOpen={!!target}
      onClose={onClose}
      title={target.name}
      subtitle={`${meta.label} · ${fmtDuration(target.duration)} · ${formatCurrency(priceNumber(target.basePrice))}`}
      width="lg"
      footer={
        <div className="flex justify-between gap-2 w-full flex-wrap">
          {target.isActive ? (
            <Button
              variant="ghost"
              onClick={() => onDeactivate(target)}
              iconLeft={<Trash2 className="w-4 h-4" />}
              disabled={deactivating}
            >
              {deactivating ? "Deactivating..." : "Deactivate"}
            </Button>
          ) : (
            <Button
              variant="outline"
              onClick={() => onActivate(target)}
              iconLeft={<CheckCircle2 className="w-4 h-4" />}
              disabled={toggling}
            >
              {toggling ? "Activating..." : "Re-activate"}
            </Button>
          )}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>Close</Button>
            <Button onClick={() => onEdit(target)} iconLeft={<Pencil className="w-4 h-4" />}>
              Edit
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-5 pt-1">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant={meta.badge}>{meta.label}</Badge>
          {target.code && (
            <span className="text-xs px-2 py-0.5 bg-stone-100 text-stone-600 font-mono rounded-full">{target.code}</span>
          )}
          <span
            className={`text-xs px-2 py-0.5 rounded-full ${
              target.isActive ? "bg-emerald-50 text-emerald-700" : "bg-stone-100 text-stone-500"
            }`}
          >
            {target.isActive ? "Active" : "Inactive"}
          </span>
        </div>

        {target.description ? (
          <p className="text-sm text-stone-700 leading-relaxed">{target.description}</p>
        ) : (
          <p className="text-sm text-stone-400 italic">No description on file.</p>
        )}

        {/* Branch availability */}
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-400 mb-1.5">
            Available at
          </p>
          {linkedBranches.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {linkedBranches.map((b) => (
                <span
                  key={b.id}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] bg-teal-50 text-teal-700 border border-teal-100"
                >
                  {b.name}
                  {b.code && <span className="text-[9px] font-mono opacity-70">{b.code}</span>}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-xs text-amber-600">Not offered at any branch — receptionists won&apos;t see this in booking flows.</p>
          )}
        </div>

        {/* Usage stats */}
        {target._count && (
          <div className="grid grid-cols-2 gap-2">
            <UsagePill icon={<Activity className="w-3.5 h-3.5" />} label="Procedures" value={target._count.procedures ?? 0} />
            <UsagePill icon={<Tag className="w-3.5 h-3.5" />} label="Invoice items" value={target._count.invoiceItems ?? 0} />
            <UsagePill icon={<Sparkles className="w-3.5 h-3.5" />} label="In packages" value={target._count.packageTreatments ?? 0} />
            <UsagePill icon={<Clock className="w-3.5 h-3.5" />} label="Booked appts." value={target._count.appointments ?? 0} />
          </div>
        )}

        {target.preInstructions && (
          <Block label="Pre-treatment" body={target.preInstructions} />
        )}
        {target.postInstructions && (
          <Block label="Post-treatment" body={target.postInstructions} />
        )}
        {target.contraindications && (
          <Block label="Contraindications" body={target.contraindications} accent />
        )}

        {!target.isActive && (
          <div className="rounded-xl bg-amber-50 border border-amber-100 px-3.5 py-2.5 text-xs text-amber-800">
            This treatment is inactive — it won&apos;t appear in booking pickers or new invoices, but historical records still reference it.
          </div>
        )}
      </div>
    </SlidePanel>
  );
}

function UsagePill({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="rounded-xl bg-stone-50 border border-stone-100 px-3 py-2 flex items-center justify-between text-xs">
      <span className="flex items-center gap-1.5 text-stone-500">
        {icon}
        {label}
      </span>
      <span className="font-semibold text-stone-900">{value}</span>
    </div>
  );
}

function Block({ label, body, accent }: { label: string; body: string; accent?: boolean }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-400 mb-1">{label}</p>
      <div
        className={`rounded-xl px-3.5 py-3 text-sm whitespace-pre-wrap leading-relaxed ${
          accent ? "bg-rose-50 border border-rose-100 text-rose-900" : "bg-stone-50 border border-stone-100 text-stone-800"
        }`}
      >
        {body}
      </div>
    </div>
  );
}

// Small inline action shown beneath each polish-able Textarea. Tiny
// footprint so it doesn't dominate the field; right-aligned so the
// eye lands on the textarea content first. Disabled when the field
// is empty (nothing to polish).
function FixWithAi({
  disabled,
  busy,
  onClick,
}: {
  disabled: boolean;
  busy: boolean;
  onClick: () => void;
}) {
  return (
    <div className="flex justify-end mt-1">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled || busy}
        className="inline-flex items-center gap-1 text-[11px] font-medium text-violet-600 hover:text-violet-800 disabled:text-stone-300 disabled:cursor-not-allowed cursor-pointer"
        title={disabled ? "Type something first" : "Polish grammar + clarity (keeps your meaning)"}
      >
        {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
        {busy ? "Polishing…" : "Fix with AI"}
      </button>
    </div>
  );
}
