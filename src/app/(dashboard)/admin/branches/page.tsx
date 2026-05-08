"use client";

/**
 * Branches admin
 * ──────────────
 * The previous page already wired up a Create slide-panel, but had no
 * Edit, no deactivate / re-activate, and shipped its own staff-counter
 * by fetching every user via useStaff() and filtering in memory — even
 * though the branches endpoint already returns _count.users. The local
 * Branch type also missed code, timezone, and _count, so the cards
 * couldn't show the branch code (the primary unique identifier on
 * receipts and audit logs).
 *
 * Rewrite (matching the established admin-page template):
 *   - Hero header (slate gradient, no-nonsense facility colour)
 *   - Stat cards driven off real _count data — no extra fetch
 *   - Search + Active/Inactive chips
 *   - Cards show name, code, status, address, phone, email, timezone,
 *     and per-branch staff/patient/room counts
 *   - Click card → details panel with full info + Edit / Deactivate /
 *     Re-activate
 *   - Add / Edit slide panel shares the same form (mode-aware) including
 *     timezone picker
 *   - Deactivate is soft (isActive=false). Hard delete blocked because
 *     users / patients / rooms / appointments / invoices all FK to
 *     branches with onDelete: Restrict.
 */

import { useMemo, useState } from "react";
import {
  Building2,
  Plus,
  MapPin,
  Phone,
  Users,
  Mail,
  Loader2,
  Pencil,
  Trash2,
  X,
  Globe,
  Bed,
  CheckCircle2,
} from "lucide-react";
import {
  Button,
  Card,
  Badge,
  StatCard,
  Input,
  Select,
  SearchInput,
} from "@/components/ui";
import { SlidePanel } from "@/components/ui/slide-panel";
import { LoadingSpinner } from "@/components/ui/loading";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  useBranches,
  useCreateBranch,
  useUpdateBranch,
  useDeleteBranch,
} from "@/hooks/use-queries";
import { useModuleAccess } from "@/modules/core/hooks";
import type { Branch } from "@/types";

// ─── Common Pakistani-clinic timezones first, then a few internationals ──
const TIMEZONES = [
  { value: "Asia/Karachi", label: "Asia/Karachi (PKT, UTC+5)" },
  { value: "Asia/Dubai", label: "Asia/Dubai (GST, UTC+4)" },
  { value: "Asia/Riyadh", label: "Asia/Riyadh (AST, UTC+3)" },
  { value: "Asia/Kolkata", label: "Asia/Kolkata (IST, UTC+5:30)" },
  { value: "Asia/Singapore", label: "Asia/Singapore (SGT, UTC+8)" },
  { value: "Europe/London", label: "Europe/London (GMT/BST)" },
  { value: "America/New_York", label: "America/New_York (ET)" },
  { value: "UTC", label: "UTC" },
];

// ═══════════════════════════════════════════════════════════════════════
// Page
// ═══════════════════════════════════════════════════════════════════════

export default function BranchesPage() {
  const access = useModuleAccess("MOD-BRANCH");
  const { data: branchesResponse, isLoading } = useBranches();
  const branches = (branchesResponse?.data || []) as Branch[];

  const create = useCreateBranch();
  const update = useUpdateBranch();
  const remove = useDeleteBranch();
  const { confirm } = useConfirm();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ACTIVE" | "ALL" | "INACTIVE">("ACTIVE");

  const [formMode, setFormMode] = useState<"closed" | "create" | "edit">("closed");
  const [formTarget, setFormTarget] = useState<Branch | null>(null);
  const [detailTarget, setDetailTarget] = useState<Branch | null>(null);

  // ─── Derived totals ────────────────────────────────────────────────
  const counts = useMemo(() => {
    const activeTotal = branches.filter((b) => b.isActive).length;
    const inactiveTotal = branches.length - activeTotal;
    return { total: branches.length, activeTotal, inactiveTotal };
  }, [branches]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return branches.filter((b) => {
      if (statusFilter === "ACTIVE" && !b.isActive) return false;
      if (statusFilter === "INACTIVE" && b.isActive) return false;
      if (q) {
        const code = (b.code || "").toLowerCase();
        const name = b.name.toLowerCase();
        const addr = (b.address || "").toLowerCase();
        if (!name.includes(q) && !code.includes(q) && !addr.includes(q)) return false;
      }
      return true;
    });
  }, [branches, search, statusFilter]);

  const headline = useMemo(() => {
    return {
      total: visible.length,
      staff: visible.reduce((s, b) => s + (b._count?.users ?? 0), 0),
      patients: visible.reduce((s, b) => s + (b._count?.patients ?? 0), 0),
      rooms: visible.reduce((s, b) => s + (b._count?.rooms ?? 0), 0),
    };
  }, [visible]);

  // ─── Mutations ─────────────────────────────────────────────────────
  const submitForm = (data: BranchFormData) => {
    const payload = data as unknown as Record<string, unknown>;
    if (formMode === "edit" && formTarget) {
      update.mutate(
        { id: formTarget.id, data: payload },
        {
          onSuccess: (res) => {
            setFormMode("closed"); setFormTarget(null);
            const fresh = (res as { data?: Branch })?.data;
            if (fresh) setDetailTarget((prev) => (prev?.id === fresh.id ? { ...prev, ...fresh } : prev));
          },
        }
      );
    } else {
      create.mutate(payload, {
        onSuccess: () => { setFormMode("closed"); setFormTarget(null); },
      });
    }
  };

  const handleDeactivate = async (b: Branch) => {
    const staff = b._count?.users ?? 0;
    const patients = b._count?.patients ?? 0;
    const ok = await confirm({
      title: `Deactivate ${b.name}?`,
      message:
        staff + patients > 0
          ? `This branch has ${staff} staff and ${patients} patients on file. It will be hidden from booking flows but historical records stay intact.`
          : "This will hide the branch from booking flows. It can be re-activated later by editing.",
      confirmLabel: "Deactivate",
      variant: "warning",
    });
    if (!ok) return;
    remove.mutate(b.id, { onSuccess: () => setDetailTarget(null) });
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
    <div data-id="ADMIN-BRANCHES" className="animate-fade-in space-y-5 sm:space-y-6">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl border border-stone-100 bg-gradient-to-br from-slate-700 via-slate-800 to-slate-900 px-5 py-5 sm:px-7 sm:py-6 text-white">
        <div className="absolute inset-0 opacity-25 [background:radial-gradient(circle_at_30%_30%,#fff_0,transparent_45%)]" />
        <div className="relative flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <Building2 className="w-4 h-4" />
              <span className="text-[11px] uppercase tracking-wider font-semibold opacity-90">Branches</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-semibold leading-tight">Every clinic, one roster.</h1>
            <p className="text-sm opacity-90 mt-1 max-w-xl">
              Branches scope users, patients, rooms, and bookings. Codes show on every receipt.
            </p>
          </div>
          <Button
            onClick={() => { setFormTarget(null); setFormMode("create"); }}
            iconLeft={<Plus className="w-4 h-4" />}
            className="!bg-white !text-slate-800 hover:!bg-stone-50"
          >
            Add branch
          </Button>
        </div>
      </div>

      {/* Headline metrics — driven off the visible filter */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard label="Branches" value={headline.total} icon={<Building2 className="w-5 h-5" />} color="primary" />
        <StatCard label="Staff" value={headline.staff} icon={<Users className="w-5 h-5" />} color="info" />
        <StatCard label="Patients" value={headline.patients} icon={<Users className="w-5 h-5" />} color="success" />
        <StatCard label="Rooms" value={headline.rooms} icon={<Bed className="w-5 h-5" />} color="warning" />
      </div>

      {/* Search + status chips */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-3">
        <SearchInput
          placeholder="Search by name, code, or address..."
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
          {visible.map((b) => (
            <BranchCard
              key={b.id}
              branch={b}
              onOpen={() => setDetailTarget(b)}
              onEdit={() => { setFormTarget(b); setFormMode("edit"); }}
            />
          ))}
        </div>
      )}

      {/* Form */}
      <BranchFormPanel
        mode={formMode === "edit" ? "edit" : "create"}
        open={formMode !== "closed"}
        target={formTarget}
        onClose={() => { setFormMode("closed"); setFormTarget(null); create.reset(); update.reset(); }}
        onSubmit={submitForm}
        submitting={create.isPending || update.isPending}
        error={(create.error?.message ?? update.error?.message) || null}
      />

      {/* Details */}
      <DetailsPanel
        target={detailTarget}
        onClose={() => setDetailTarget(null)}
        onEdit={(b) => { setFormTarget(b); setFormMode("edit"); setDetailTarget(null); }}
        onDeactivate={handleDeactivate}
        onActivate={(b) =>
          update.mutate(
            { id: b.id, data: { isActive: true } },
            { onSuccess: (res) => {
                const fresh = (res as { data?: Branch })?.data;
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
// Pieces
// ═══════════════════════════════════════════════════════════════════════

function BranchCard({
  branch, onOpen, onEdit,
}: {
  branch: Branch;
  onOpen: () => void;
  onEdit: () => void;
}) {
  return (
    <Card
      hover
      padding="lg"
      onClick={onOpen}
      className={`bg-white rounded-2xl border border-stone-100 shadow-sm animate-fade-in cursor-pointer transition-shadow hover:shadow-md ${
        !branch.isActive ? "opacity-60" : ""
      }`}
    >
      <div className="flex flex-col gap-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0">
              <Building2 className="w-5 h-5 text-slate-700" />
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-stone-900 truncate">{branch.name}</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <Badge variant={branch.isActive ? "success" : "default"} dot>
                  {branch.isActive ? "Active" : "Inactive"}
                </Badge>
                {branch.code && (
                  <span className="text-[10px] font-mono text-stone-500">{branch.code}</span>
                )}
              </div>
            </div>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); onEdit(); }}
            className="text-stone-400 hover:text-slate-700 transition-colors p-1 cursor-pointer"
            aria-label="Edit"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="space-y-1.5 pt-3 border-t border-stone-100 text-xs">
          <div className="flex items-start gap-1.5 text-stone-600">
            <MapPin className="w-3.5 h-3.5 mt-0.5 shrink-0 text-stone-400" />
            <span className="line-clamp-2">{branch.address}</span>
          </div>
          {branch.phone && (
            <div className="flex items-center gap-1.5 text-stone-600">
              <Phone className="w-3.5 h-3.5 shrink-0 text-stone-400" />
              <span className="truncate">{branch.phone}</span>
            </div>
          )}
          {branch.email && (
            <div className="flex items-center gap-1.5 text-stone-600">
              <Mail className="w-3.5 h-3.5 shrink-0 text-stone-400" />
              <span className="truncate">{branch.email}</span>
            </div>
          )}
          {branch.timezone && (
            <div className="flex items-center gap-1.5 text-stone-500">
              <Globe className="w-3.5 h-3.5 shrink-0 text-stone-400" />
              <span className="font-mono text-[10px]">{branch.timezone}</span>
            </div>
          )}
        </div>

        <div className="grid grid-cols-3 gap-2 pt-3 border-t border-stone-100">
          <Stat label="Staff" value={branch._count?.users ?? 0} icon={<Users className="w-3 h-3" />} />
          <Stat label="Patients" value={branch._count?.patients ?? 0} icon={<Users className="w-3 h-3" />} />
          <Stat label="Rooms" value={branch._count?.rooms ?? 0} icon={<Bed className="w-3 h-3" />} />
        </div>
      </div>
    </Card>
  );
}

function Stat({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center text-center bg-stone-50 rounded-lg py-1.5">
      <span className="flex items-center gap-1 text-[10px] text-stone-500">
        {icon}
        {label}
      </span>
      <span className="text-sm font-semibold text-stone-900">{value}</span>
    </div>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="rounded-2xl border-2 border-dashed border-stone-200 py-16 px-6 text-center">
      <div className="w-14 h-14 mx-auto rounded-full bg-slate-100 flex items-center justify-center mb-3">
        <Building2 className="w-7 h-7 text-slate-400" />
      </div>
      <p className="text-sm text-stone-700 font-medium mb-1">No branches match this filter.</p>
      <p className="text-xs text-stone-400 mb-4">Add one to start booking patients into a location.</p>
      <Button onClick={onCreate} iconLeft={<Plus className="w-4 h-4" />}>Add branch</Button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Form panel — create + edit share the same panel in two modes
// ═══════════════════════════════════════════════════════════════════════

interface BranchFormData {
  name: string;
  code: string;
  address: string;
  phone: string;
  email: string;
  timezone: string;
  isActive?: boolean;
}

function BranchFormPanel({
  mode, open, target, onClose, onSubmit, submitting, error,
}: {
  mode: "create" | "edit";
  open: boolean;
  target: Branch | null;
  onClose: () => void;
  onSubmit: (data: BranchFormData) => void;
  submitting: boolean;
  error: string | null;
}) {
  const [seenKey, setSeenKey] = useState("");
  const key = `${open}::${target?.id ?? ""}::${mode}`;

  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [timezone, setTimezone] = useState("Asia/Karachi");
  const [isActive, setIsActive] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});

  if (key !== seenKey) {
    setSeenKey(key);
    setErrors({});
    if (mode === "edit" && target) {
      setName(target.name ?? "");
      setCode(target.code ?? "");
      setAddress(target.address ?? "");
      setPhone(target.phone ?? "");
      setEmail(target.email ?? "");
      setTimezone(target.timezone || "Asia/Karachi");
      setIsActive(target.isActive);
    } else if (open && mode === "create") {
      setName(""); setCode(""); setAddress(""); setPhone(""); setEmail("");
      setTimezone("Asia/Karachi"); setIsActive(true);
    }
  }

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = "Name is required";
    if (!code.trim()) errs.code = "Code is required";
    else if (code.length > 10) errs.code = "Max 10 chars";
    if (!address.trim()) errs.address = "Address is required";
    // Email format CHECK is enforced at DB level (v13); soft-validate here too.
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) errs.email = "Invalid email";
    return errs;
  };

  const submit = () => {
    const errs = validate();
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    onSubmit({
      name: name.trim(),
      code: code.trim().toUpperCase(),
      address: address.trim(),
      phone: phone.trim(),
      email: email.trim(),
      timezone: timezone || "Asia/Karachi",
      ...(mode === "edit" && { isActive }),
    });
  };

  return (
    <SlidePanel
      isOpen={open}
      onClose={onClose}
      title={mode === "edit" ? "Edit branch" : "Add branch"}
      subtitle={
        mode === "edit"
          ? "Changes apply immediately to all flows that scope by branch."
          : "Set up a new clinic location. The code shows on receipts and audit logs."
      }
      width="md"
      footer={
        <div className="flex justify-end gap-2 w-full">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            onClick={submit}
            disabled={submitting}
            iconLeft={
              submitting ? <Loader2 className="w-4 h-4 animate-spin" /> :
              mode === "edit" ? <CheckCircle2 className="w-4 h-4" /> : <Plus className="w-4 h-4" />
            }
          >
            {submitting ? "Saving..." : mode === "edit" ? "Save changes" : "Create branch"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4 pt-1">
        {error && (
          <div className="p-3 rounded-xl bg-red-50 border border-red-100 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="sm:col-span-2">
            <Input
              label="Name"
              required
              placeholder="e.g. Downtown Clinic"
              value={name}
              onChange={(e) => setName(e.target.value)}
              error={errors.name}
            />
          </div>
          <Input
            label="Code"
            required
            maxLength={10}
            placeholder="DTC"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            error={errors.code}
            helperText="Up to 10 chars, uppercase"
          />
        </div>

        <Input
          label="Address"
          required
          placeholder="Full street address"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          error={errors.address}
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input
            label="Phone"
            placeholder="+92 21 0000 0000"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            error={errors.phone}
          />
          <Input
            label="Email"
            type="email"
            placeholder="branch@clinic.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={errors.email}
          />
        </div>

        <Select
          label="Timezone"
          value={timezone}
          onChange={(e) => setTimezone(e.target.value)}
          options={TIMEZONES}
        />

        {mode === "edit" && (
          <label className="flex items-center gap-2 text-sm text-stone-700 cursor-pointer">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="w-4 h-4 rounded border-stone-300 text-teal-600 focus:ring-teal-500"
            />
            Active
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
  target, onClose, onEdit, onDeactivate, onActivate, deactivating, toggling,
}: {
  target: Branch | null;
  onClose: () => void;
  onEdit: (b: Branch) => void;
  onDeactivate: (b: Branch) => void;
  onActivate: (b: Branch) => void;
  deactivating: boolean;
  toggling: boolean;
}) {
  if (!target) return null;

  return (
    <SlidePanel
      isOpen={!!target}
      onClose={onClose}
      title={target.name}
      subtitle={`${target.code}${target.timezone ? ` · ${target.timezone}` : ""}`}
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
          {target.code && (
            <span className="text-xs px-2 py-0.5 bg-stone-100 text-stone-600 font-mono rounded-full">
              {target.code}
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <Field label="Address" value={target.address} />
          <Field label="Phone" value={target.phone || "—"} />
          <Field label="Email" value={target.email || "—"} />
          <Field label="Timezone" value={target.timezone || "Asia/Karachi"} mono />
        </div>

        {target._count && (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-400 mb-2">Usage</p>
            <div className="grid grid-cols-2 gap-2">
              <UsagePill icon={<Users className="w-3.5 h-3.5" />} label="Staff" value={target._count.users ?? 0} />
              <UsagePill icon={<Users className="w-3.5 h-3.5" />} label="Patients" value={target._count.patients ?? 0} />
              <UsagePill icon={<Bed className="w-3.5 h-3.5" />} label="Rooms" value={target._count.rooms ?? 0} />
              <UsagePill icon={<Building2 className="w-3.5 h-3.5" />} label="Appointments" value={target._count.appointments ?? 0} />
              <UsagePill icon={<Building2 className="w-3.5 h-3.5" />} label="Invoices" value={target._count.invoices ?? 0} />
            </div>
          </div>
        )}

        {!target.isActive && (
          <div className="rounded-xl bg-amber-50 border border-amber-100 px-3.5 py-2.5 text-xs text-amber-800">
            This branch is inactive — it won&apos;t show up in booking flows or new staff assignments. Existing records remain intact.
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
