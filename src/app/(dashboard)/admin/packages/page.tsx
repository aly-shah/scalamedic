"use client";

/**
 * Packages catalog
 * ────────────────
 * The previous page was view-only theatre: "Add Package" had no
 * onClick, no /api/packages/[id] route existed, and the local Package
 * type had subscriberCount as a flat field — but the API returns
 * _count.patientPackages instead, so the "subscribers" stat always
 * read 0.
 *
 * Rewrite (matching the established admin-page template):
 *   - Hero header + working "Add package" CTA
 *   - Stat cards driven off real _count data + optional revenue
 *   - Search + active/inactive chips
 *   - Catalog cards show price, validity, treatment summary, real
 *     subscriber count, and an active dot
 *   - Add / Edit slide panel with a treatment line-item editor (pick
 *     from the catalog + sessions count + add/remove rows)
 *   - Details slide panel with full info, usage pills, and Edit /
 *     Deactivate / Re-activate actions
 *   - Deactivate is soft (isActive=false). Hard delete is intentionally
 *     not exposed — invoice_items.packageId and patient_packages.packageId
 *     are both Restrict (v11), so historical receipts and active
 *     subscribers must keep the row reachable.
 */

import { useMemo, useState } from "react";
import {
  Package as PackageIcon,
  Plus,
  Clock,
  Users,
  Sparkles,
  Pencil,
  Trash2,
  X,
  Loader2,
  CheckCircle2,
  Tag,
  Wallet,
  TrendingUp,
  Search as SearchIcon,
} from "lucide-react";
import {
  Button,
  Card,
  Badge,
  StatCard,
  SearchInput,
  Input,
  Select,
  Textarea,
} from "@/components/ui";
import { SlidePanel } from "@/components/ui/slide-panel";
import { LoadingSpinner } from "@/components/ui/loading";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { formatCurrency } from "@/lib/utils";
import { useModuleAccess } from "@/modules/core/hooks";
import {
  usePackages,
  useCreatePackage,
  useUpdatePackage,
  useDeletePackage,
  useTreatments,
  useBranches,
} from "@/hooks/use-queries";
import type { Package, PackageTreatment, Treatment, Branch } from "@/types";

// ─── Helpers ────────────────────────────────────────────────────────

function priceNumber(p: Package["price"]): number {
  if (typeof p === "number") return Number.isFinite(p) ? p : 0;
  if (typeof p === "string") {
    const n = parseFloat(p);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}
function subCount(p: Package): number {
  return p._count?.patientPackages ?? p.subscriberCount ?? 0;
}
function totalSessions(p: Package): number {
  return (p.treatments || []).reduce((s, t) => s + (Number(t.sessions) || 0), 0);
}

// ═══════════════════════════════════════════════════════════════════════
// Page
// ═══════════════════════════════════════════════════════════════════════

export default function PackagesPage() {
  const access = useModuleAccess("MOD-BILLING");
  const { data: packagesResponse, isLoading } = usePackages();
  const packages = (packagesResponse?.data || []) as Package[];
  const { data: branchesRes } = useBranches();
  const branches = ((branchesRes?.data || []) as Branch[]).filter((b) => b.isActive);

  const create = useCreatePackage();
  const update = useUpdatePackage();
  const remove = useDeletePackage();
  const { confirm } = useConfirm();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ACTIVE" | "ALL" | "INACTIVE">("ACTIVE");

  const [formMode, setFormMode] = useState<"closed" | "create" | "edit">("closed");
  const [formTarget, setFormTarget] = useState<Package | null>(null);
  const [detailTarget, setDetailTarget] = useState<Package | null>(null);

  // ─── Headline metrics — driven off the visible filter ─────────────
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return packages.filter((p) => {
      if (statusFilter === "ACTIVE" && !p.isActive) return false;
      if (statusFilter === "INACTIVE" && p.isActive) return false;
      if (q) {
        const desc = (p.description || "").toLowerCase();
        const name = p.name.toLowerCase();
        if (!name.includes(q) && !desc.includes(q)) return false;
      }
      return true;
    });
  }, [packages, search, statusFilter]);

  const counts = useMemo(() => {
    const activeTotal = packages.filter((p) => p.isActive).length;
    const inactiveTotal = packages.length - activeTotal;
    return { activeTotal, inactiveTotal, total: packages.length };
  }, [packages]);

  const headline = useMemo(() => {
    const total = visible.length;
    const totalSubs = visible.reduce((s, p) => s + subCount(p), 0);
    const lifetimeRevenue = visible.reduce((s, p) => s + priceNumber(p.price) * subCount(p), 0);
    const avgPrice = total ? Math.round(visible.reduce((s, p) => s + priceNumber(p.price), 0) / total) : 0;
    return { total, totalSubs, lifetimeRevenue, avgPrice };
  }, [visible]);

  // ─── Mutations ────────────────────────────────────────────────────
  const submitForm = (data: PackageFormData) => {
    const payload = data as unknown as Record<string, unknown>;
    if (formMode === "edit" && formTarget) {
      update.mutate(
        { id: formTarget.id, data: payload },
        {
          onSuccess: (res) => {
            setFormMode("closed"); setFormTarget(null);
            // If the details panel was open, refresh its target with the new fields.
            const fresh = (res as { data?: Package })?.data;
            if (fresh) setDetailTarget((prev) => (prev?.id === fresh.id ? fresh : prev));
          },
        }
      );
    } else {
      create.mutate(payload, {
        onSuccess: () => { setFormMode("closed"); setFormTarget(null); },
      });
    }
  };

  const handleDeactivate = async (p: Package) => {
    const subs = subCount(p);
    const ok = await confirm({
      title: `Deactivate ${p.name}?`,
      message:
        subs > 0
          ? `This package has ${subs} active subscriber(s). It will be hidden from the catalog and from new sales, but existing subscriptions stay active until they expire.`
          : "This will hide the package from the catalog. It can be re-activated later by editing.",
      confirmLabel: "Deactivate",
      variant: "warning",
    });
    if (!ok) return;
    remove.mutate(p.id, { onSuccess: () => setDetailTarget(null) });
  };

  if (!access.canView) {
    return (
      <div className="flex items-center justify-center py-20 text-stone-500 text-sm">
        You don&apos;t have access to this module.
      </div>
    );
  }
  if (isLoading) {
    return <div className="flex items-center justify-center py-20"><LoadingSpinner size="lg" /></div>;
  }

  return (
    <div data-id="ADMIN-PACKAGES" className="animate-fade-in space-y-5 sm:space-y-6">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl border border-stone-100 bg-gradient-to-br from-violet-500 via-purple-500 to-fuchsia-500 px-5 py-5 sm:px-7 sm:py-6 text-white">
        <div className="absolute inset-0 opacity-25 [background:radial-gradient(circle_at_30%_30%,#fff_0,transparent_45%)]" />
        <div className="relative flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <PackageIcon className="w-4 h-4" />
              <span className="text-[11px] uppercase tracking-wider font-semibold opacity-90">Packages</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-semibold leading-tight">Bundle treatments, lock in loyalty.</h1>
            <p className="text-sm opacity-90 mt-1 max-w-xl">
              Curated treatment plans patients can buy once and redeem over time.
            </p>
          </div>
          <Button
            onClick={() => { setFormTarget(null); setFormMode("create"); }}
            iconLeft={<Plus className="w-4 h-4" />}
            className="!bg-white !text-purple-700 hover:!bg-stone-50"
          >
            Add package
          </Button>
        </div>
      </div>

      {/* Headline metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard label="In catalog" value={headline.total} icon={<Tag className="w-5 h-5" />} color="info" />
        <StatCard label="Active subscribers" value={headline.totalSubs} icon={<Users className="w-5 h-5" />} color="success" />
        <StatCard label="Lifetime revenue" value={formatCurrency(headline.lifetimeRevenue)} icon={<Wallet className="w-5 h-5" />} color="warning" />
        <StatCard label="Avg. price" value={formatCurrency(headline.avgPrice)} icon={<TrendingUp className="w-5 h-5" />} color="primary" />
      </div>

      {/* Search + status chips */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-3">
        <SearchInput
          placeholder="Search packages by name or description..."
          value={search}
          onChange={setSearch}
          className="w-full sm:max-w-sm"
        />
        <div className="flex flex-wrap gap-2">
          {([
            { key: "ACTIVE", label: `Active (${counts.activeTotal})` },
            { key: "ALL", label: `All (${counts.total})` },
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
          {(search || statusFilter !== "ACTIVE") && (
            <button
              onClick={() => { setSearch(""); setStatusFilter("ACTIVE"); }}
              className="px-3 py-1.5 rounded-full text-xs font-medium text-stone-500 hover:text-stone-700 cursor-pointer flex items-center gap-1"
            >
              <X className="w-3 h-3" /> Clear
            </button>
          )}
        </div>
      </div>

      {/* Cards */}
      {visible.length === 0 ? (
        <EmptyState onCreate={() => { setFormTarget(null); setFormMode("create"); }} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
          {visible.map((pkg) => (
            <PackageCard
              key={pkg.id}
              pkg={pkg}
              onOpen={() => setDetailTarget(pkg)}
              onEdit={() => { setFormTarget(pkg); setFormMode("edit"); }}
            />
          ))}
        </div>
      )}

      {/* Form */}
      <PackageFormPanel
        mode={formMode === "edit" ? "edit" : "create"}
        open={formMode !== "closed"}
        target={formTarget}
        branches={branches}
        onClose={() => { setFormMode("closed"); setFormTarget(null); }}
        onSubmit={submitForm}
        submitting={create.isPending || update.isPending}
      />

      {/* Details */}
      <DetailsPanel
        target={detailTarget}
        branches={branches}
        onClose={() => setDetailTarget(null)}
        onEdit={(p) => { setFormTarget(p); setFormMode("edit"); setDetailTarget(null); }}
        onDeactivate={handleDeactivate}
        onActivate={(p) =>
          update.mutate(
            { id: p.id, data: { isActive: true } },
            { onSuccess: (res) => {
                const fresh = (res as { data?: Package })?.data;
                if (fresh) setDetailTarget(fresh);
              } }
          )
        }
        deactivating={remove.isPending}
        toggling={update.isPending}
      />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Catalog card
// ═══════════════════════════════════════════════════════════════════════

function PackageCard({
  pkg, onOpen, onEdit,
}: {
  pkg: Package;
  onOpen: () => void;
  onEdit: () => void;
}) {
  const sessions = totalSessions(pkg);
  const subs = subCount(pkg);

  return (
    <Card
      hover
      padding="lg"
      onClick={onOpen}
      className={`bg-white rounded-2xl border border-stone-100 shadow-sm animate-fade-in cursor-pointer transition-shadow hover:shadow-md ${
        !pkg.isActive ? "opacity-60" : ""
      }`}
    >
      <div className="flex flex-col gap-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-semibold text-stone-900 truncate">{pkg.name}</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <Badge variant={pkg.isActive ? "success" : "default"} dot>
                {pkg.isActive ? "Active" : "Inactive"}
              </Badge>
              {sessions > 0 && (
                <span className="text-[10px] text-stone-500">{sessions} sessions</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={(e) => { e.stopPropagation(); onEdit(); }}
              className="text-stone-400 hover:text-purple-600 transition-colors p-1 cursor-pointer"
              aria-label="Edit"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <p className="text-base font-bold text-stone-900">{formatCurrency(priceNumber(pkg.price))}</p>
          </div>
        </div>

        {pkg.description ? (
          <p className="text-sm text-stone-500 line-clamp-2 leading-relaxed">{pkg.description}</p>
        ) : (
          <p className="text-sm text-stone-300 italic">No description</p>
        )}

        {/* Treatments summary */}
        {pkg.treatments && pkg.treatments.length > 0 && (
          <div className="space-y-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-400">Includes</p>
            <div className="flex flex-wrap gap-1">
              {pkg.treatments.slice(0, 3).map((t, i) => (
                <span
                  key={t.id ?? `${i}-${t.name}`}
                  className="text-[11px] px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 truncate max-w-full"
                >
                  {t.name} × {t.sessions}
                </span>
              ))}
              {pkg.treatments.length > 3 && (
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-stone-100 text-stone-500">
                  +{pkg.treatments.length - 3} more
                </span>
              )}
            </div>
          </div>
        )}

        <div className="flex items-center justify-between pt-3 border-t border-stone-100 text-xs text-stone-500">
          <span className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" />
            {pkg.validityDays} day validity
          </span>
          <span className="flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5" />
            {subs} subscriber{subs === 1 ? "" : "s"}
          </span>
        </div>
      </div>
    </Card>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="rounded-2xl border-2 border-dashed border-stone-200 py-16 px-6 text-center">
      <div className="w-14 h-14 mx-auto rounded-full bg-purple-50 flex items-center justify-center mb-3">
        <PackageIcon className="w-7 h-7 text-purple-400" />
      </div>
      <p className="text-sm text-stone-700 font-medium mb-1">No packages match this filter.</p>
      <p className="text-xs text-stone-400 mb-4">Bundle a few treatments and offer it as a package.</p>
      <Button onClick={onCreate} iconLeft={<Plus className="w-4 h-4" />}>Add package</Button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Form panel — create + edit share the same panel in two modes
// ═══════════════════════════════════════════════════════════════════════

interface PackageFormData {
  name: string;
  description?: string;
  price: number;
  validityDays: number;
  maxRedemptions?: number | null;
  treatments: Array<{ name: string; sessions: number; treatmentId?: string | null }>;
  branchIds: string[];
  isActive?: boolean;
}

interface FormItem {
  name: string;
  sessions: number;
  treatmentId: string;
}

function PackageFormPanel({
  mode, open, target, onClose, onSubmit, submitting, branches,
}: {
  mode: "create" | "edit";
  open: boolean;
  target: Package | null;
  onClose: () => void;
  onSubmit: (data: PackageFormData) => void;
  submitting: boolean;
  branches: Branch[];
}) {
  const { data: treatmentsRes } = useTreatments({ active: "true" });
  const treatments = ((treatmentsRes?.data || []) as Treatment[])
    .filter((t) => t.isActive)
    .sort((a, b) => a.name.localeCompare(b.name));
  const treatmentMap = useMemo(() => {
    const m = new Map<string, Treatment>();
    for (const t of treatments) m.set(t.id, t);
    return m;
  }, [treatments]);

  // Reset whenever we re-open or switch target — derived-from-prop pattern.
  const [seenKey, setSeenKey] = useState("");
  const key = `${open}::${target?.id ?? ""}::${mode}`;

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState<number>(0);
  const [validityDays, setValidityDays] = useState<number>(180);
  const [maxRedemptions, setMaxRedemptions] = useState<string>("");
  const [items, setItems] = useState<FormItem[]>([{ name: "", sessions: 1, treatmentId: "" }]);
  const [branchIds, setBranchIds] = useState<string[]>([]);
  const [isActive, setIsActive] = useState(true);

  if (key !== seenKey) {
    setSeenKey(key);
    if (mode === "edit" && target) {
      setName(target.name ?? "");
      setDescription(target.description ?? "");
      setPrice(priceNumber(target.price));
      setValidityDays(target.validityDays ?? 180);
      setMaxRedemptions(target.maxRedemptions == null ? "" : String(target.maxRedemptions));
      setItems(
        (target.treatments || []).map((t) => ({
          name: t.name,
          sessions: t.sessions,
          treatmentId: t.treatmentId ?? "",
        }))
      );
      setBranchIds((target.branches ?? []).map((b) => b.branchId));
      setIsActive(target.isActive);
    } else if (open && mode === "create") {
      setName(""); setDescription(""); setPrice(0); setValidityDays(180);
      setMaxRedemptions(""); setIsActive(true);
      setItems([{ name: "", sessions: 1, treatmentId: "" }]);
      // Default to all-branches for new packages — same semantics as treatments.
      setBranchIds(branches.map((b) => b.id));
    }
  }

  const toggleBranch = (id: string) =>
    setBranchIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const setItem = (idx: number, patch: Partial<FormItem>) => {
    setItems((rows) => rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };
  const addItem = () => setItems((rows) => [...rows, { name: "", sessions: 1, treatmentId: "" }]);
  const removeItem = (idx: number) => setItems((rows) => rows.filter((_, i) => i !== idx));

  // When picking a treatment from the catalog, auto-fill the snapshot name.
  const onPickTreatment = (idx: number, treatmentId: string) => {
    const t = treatmentMap.get(treatmentId);
    setItem(idx, {
      treatmentId,
      name: t ? t.name : items[idx].name,
    });
  };

  const validItems = items.filter((it) => it.name.trim() && it.sessions > 0);

  const submit = () => {
    if (!name.trim() || price < 0 || validityDays <= 0 || validItems.length === 0) return;
    if (branchIds.length === 0) return;
    onSubmit({
      name: name.trim(),
      description: description.trim() || undefined,
      price,
      validityDays,
      maxRedemptions: maxRedemptions.trim() ? Math.max(1, Number(maxRedemptions)) : null,
      treatments: validItems.map((it) => ({
        name: it.name.trim(),
        sessions: Math.max(1, Number(it.sessions) || 1),
        treatmentId: it.treatmentId || null,
      })),
      branchIds,
      ...(mode === "edit" && { isActive }),
    });
  };

  return (
    <SlidePanel
      isOpen={open}
      onClose={onClose}
      title={mode === "edit" ? "Edit package" : "Add package"}
      subtitle={
        mode === "edit"
          ? "Edits apply to new sales only. Existing subscribers keep their original entitlements."
          : "Bundle catalog treatments into a single package the receptionist can sell at billing."
      }
      width="xl"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            onClick={submit}
            disabled={
              submitting || !name.trim() || price < 0 || validityDays <= 0 || validItems.length === 0 || branchIds.length === 0
            }
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
        <Input
          label="Name"
          placeholder="e.g. Glow Up Package"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />

        <Textarea
          label="Description (optional)"
          placeholder="Brief description shown on the catalog card and at billing time."
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Input
            label="Price (PKR)"
            type="number"
            min={0}
            step={500}
            value={price}
            onChange={(e) => setPrice(Math.max(0, Number(e.target.value) || 0))}
          />
          <Input
            label="Validity (days)"
            type="number"
            min={1}
            max={1095}
            value={validityDays}
            onChange={(e) => setValidityDays(Math.max(1, Number(e.target.value) || 1))}
          />
          <Input
            label="Max redemptions (optional)"
            type="number"
            min={1}
            value={maxRedemptions}
            onChange={(e) => setMaxRedemptions(e.target.value)}
            placeholder="Unlimited"
          />
        </div>

        {/* Treatments line items */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-stone-700">Treatments included</label>
            <button
              type="button"
              onClick={addItem}
              className="text-xs text-purple-600 hover:text-purple-700 font-medium cursor-pointer flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" />
              Add treatment
            </button>
          </div>

          <div className="space-y-2">
            {items.map((it, idx) => {
              const t = it.treatmentId ? treatmentMap.get(it.treatmentId) : undefined;
              return (
                <div
                  key={idx}
                  className="grid grid-cols-12 gap-2 items-end rounded-xl bg-stone-50 border border-stone-100 px-3 py-2.5"
                >
                  <div className="col-span-12 sm:col-span-6">
                    <Select
                      label={idx === 0 ? "Treatment" : undefined}
                      value={it.treatmentId}
                      onChange={(e) => onPickTreatment(idx, e.target.value)}
                      options={[
                        { value: "", label: "— Custom (no catalog link) —" },
                        ...treatments.map((tr) => ({
                          value: tr.id,
                          label: tr.name + (tr.code ? ` (${tr.code})` : ""),
                        })),
                      ]}
                    />
                    {!it.treatmentId && (
                      <Input
                        className="mt-2"
                        placeholder="Custom treatment name"
                        value={it.name}
                        onChange={(e) => setItem(idx, { name: e.target.value })}
                      />
                    )}
                    {t && it.name !== t.name && (
                      <p className="text-[10px] text-stone-400 mt-1">
                        Snapshot name will be set to <span className="font-medium">{t.name}</span>.
                      </p>
                    )}
                  </div>
                  <div className="col-span-8 sm:col-span-4">
                    <Input
                      label={idx === 0 ? "Sessions" : undefined}
                      type="number"
                      min={1}
                      max={50}
                      value={it.sessions}
                      onChange={(e) => setItem(idx, { sessions: Math.max(1, Number(e.target.value) || 1) })}
                    />
                  </div>
                  <div className="col-span-4 sm:col-span-2 flex justify-end">
                    {items.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeItem(idx)}
                        className="text-stone-400 hover:text-red-600 cursor-pointer p-2"
                        aria-label="Remove"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {validItems.length === 0 && (
            <p className="text-xs text-amber-600">Add at least one treatment line item.</p>
          )}
        </div>

        {/* Branch availability */}
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
                          ? "bg-purple-600 text-white border-purple-600"
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
                  className="text-purple-600 hover:underline cursor-pointer"
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
                <p className="text-[11px] text-amber-600">Select at least one branch — packages must be available somewhere.</p>
              )}
            </div>
          )}
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
  target: Package | null;
  onClose: () => void;
  onEdit: (p: Package) => void;
  onDeactivate: (p: Package) => void;
  onActivate: (p: Package) => void;
  deactivating: boolean;
  toggling: boolean;
  branches: Branch[];
}) {
  if (!target) return null;
  const subs = subCount(target);
  const sessions = totalSessions(target);
  const branchById = new Map(branches.map((b) => [b.id, b]));
  const linkedBranches = (target.branches ?? [])
    .map((pb) => branchById.get(pb.branchId))
    .filter((b): b is Branch => !!b);

  return (
    <SlidePanel
      isOpen={!!target}
      onClose={onClose}
      title={target.name}
      subtitle={`${formatCurrency(priceNumber(target.price))} · ${target.validityDays} days · ${sessions} sessions`}
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
            <Button onClick={() => onEdit(target)} iconLeft={<Pencil className="w-4 h-4" />}>Edit</Button>
          </div>
        </div>
      }
    >
      <div className="space-y-5 pt-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className={`text-xs px-2 py-0.5 rounded-full ${
              target.isActive ? "bg-emerald-50 text-emerald-700" : "bg-stone-100 text-stone-500"
            }`}
          >
            {target.isActive ? "Active" : "Inactive"}
          </span>
          {target.maxRedemptions != null && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-stone-100 text-stone-600">
              Max {target.maxRedemptions} redemptions
            </span>
          )}
        </div>

        {target.description ? (
          <p className="text-sm text-stone-700 leading-relaxed">{target.description}</p>
        ) : (
          <p className="text-sm text-stone-400 italic">No description on file.</p>
        )}

        <div className="grid grid-cols-2 gap-2">
          <UsagePill icon={<Users className="w-3.5 h-3.5" />} label="Subscribers" value={subs} />
          <UsagePill icon={<Tag className="w-3.5 h-3.5" />} label="On invoices" value={target._count?.invoiceItems ?? 0} />
          <UsagePill icon={<Sparkles className="w-3.5 h-3.5" />} label="Treatments" value={(target.treatments || []).length} />
          <UsagePill icon={<Clock className="w-3.5 h-3.5" />} label="Validity (days)" value={target.validityDays} />
        </div>

        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-400 mb-1.5">Available at</p>
          {linkedBranches.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {linkedBranches.map((b) => (
                <span
                  key={b.id}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] bg-purple-50 text-purple-700 border border-purple-100"
                >
                  {b.name}
                  {b.code && <span className="text-[9px] font-mono opacity-70">{b.code}</span>}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-xs text-amber-600">Not offered at any branch — won&apos;t appear in billing flows.</p>
          )}
        </div>

        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-400 mb-2">Treatments included</p>
          {target.treatments && target.treatments.length > 0 ? (
            <ul className="rounded-xl border border-stone-100 divide-y divide-stone-100 overflow-hidden">
              {target.treatments.map((t: PackageTreatment, i) => (
                <li key={t.id ?? `${i}-${t.name}`} className="flex items-center justify-between px-3.5 py-2.5 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium text-stone-900 truncate">{t.name}</p>
                    {t.treatment?.code && (
                      <p className="text-[11px] text-stone-400 font-mono">{t.treatment.code}</p>
                    )}
                  </div>
                  <Badge variant="purple">{t.sessions} sessions</Badge>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-stone-400 italic">No treatments configured.</p>
          )}
        </div>

        {!target.isActive && (
          <div className="rounded-xl bg-amber-50 border border-amber-100 px-3.5 py-2.5 text-xs text-amber-800">
            This package is inactive — it won&apos;t appear at billing or in the catalog. Existing subscriptions stay active.
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
