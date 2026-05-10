"use client";

/**
 * Staff / Team admin
 * ──────────────────
 * Two real bugs the previous version was shipping:
 *   - It read `user.lastLogin`, but the API returns `lastLoginAt` —
 *     so every card showed "Never logged in" regardless of reality.
 *   - It read `user.branchName`, but the API returns nested
 *     `user.branch.name` — every card showed "Unassigned".
 * On top of that, there was duplicated dead code in the create
 * handler (a `delete payload.consultationFee` between two identical
 * blocks), the PATCH endpoint only supported isActive +
 * consultationFee, and there was no Edit flow at all.
 *
 * Rewrite (matching the established admin-page template):
 *   - Hero header + working "Add member" CTA
 *   - Headline metrics (total / doctors / active / new this month)
 *   - Role + branch + status filter chips with counts
 *   - Cards show real branch.name + code, real lastLoginAt, role badge
 *     and (for doctors) a fee/license summary line
 *   - Click card → details panel with full info + Edit / Reset password /
 *     Deactivate / Re-activate. Edit covers name, phone, role, branch,
 *     speciality, license #, consultation fee — everything PATCH allows.
 *   - Self-deactivation guarded; Super-Admin scope guarded.
 */

import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Users,
  Plus,
  Stethoscope,
  UserCheck,
  MapPin,
  Clock,
  Loader2,
  KeyRound,
  UserX,
  UserPlus2,
  Pencil,
  X,
  CheckCircle2,
  Mail,
  Phone as PhoneIcon,
  Award,
  Wallet,
  CalendarDays,
} from "lucide-react";
import {
  Button,
  StatCard,
  Card,
  SearchInput,
  Avatar,
  Badge,
  Input,
  Select,
} from "@/components/ui";
import { SlidePanel } from "@/components/ui/slide-panel";
import { LoadingSpinner } from "@/components/ui/loading";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  useStaff,
  useCreateUser,
  useUpdateUser,
  useBranches,
} from "@/hooks/use-queries";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { UserRole } from "@/types";
import type { User, Branch } from "@/types";
import { timeAgo } from "@/lib/utils";
import { useFormatCurrency } from "@/hooks/use-format-currency";
import { useModuleAccess } from "@/modules/core/hooks";

// ─── Role metadata ──────────────────────────────────────────────────

const ROLE_BADGE: Record<UserRole, "primary" | "info" | "success" | "warning" | "danger" | "default" | "purple"> = {
  [UserRole.SUPER_ADMIN]: "danger",
  [UserRole.ADMIN]: "primary",
  [UserRole.DOCTOR]: "info",
  [UserRole.RECEPTIONIST]: "success",
  [UserRole.BILLING]: "warning",
  [UserRole.CALL_CENTER]: "purple",
  [UserRole.ASSISTANT]: "default",
  [UserRole.AESTHETICIAN]: "info",
  [UserRole.OPERATOR]: "default",
};

const ROLE_LABEL: Record<UserRole, string> = {
  [UserRole.SUPER_ADMIN]: "Super Admin",
  [UserRole.ADMIN]: "Admin",
  [UserRole.DOCTOR]: "Doctor",
  [UserRole.RECEPTIONIST]: "Receptionist",
  [UserRole.BILLING]: "Billing",
  [UserRole.CALL_CENTER]: "Call Center",
  [UserRole.ASSISTANT]: "Assistant",
  [UserRole.AESTHETICIAN]: "Aesthetician",
  [UserRole.OPERATOR]: "Operator",
};

const ROLE_ORDER: UserRole[] = [
  UserRole.DOCTOR,
  UserRole.AESTHETICIAN,
  UserRole.RECEPTIONIST,
  UserRole.ADMIN,
  UserRole.BILLING,
  UserRole.CALL_CENTER,
  UserRole.ASSISTANT,
  UserRole.OPERATOR,
  UserRole.SUPER_ADMIN,
];

const ROLE_OPTIONS_FOR_CREATE = [
  { value: UserRole.ADMIN, label: "Admin" },
  { value: UserRole.DOCTOR, label: "Doctor" },
  { value: UserRole.AESTHETICIAN, label: "Aesthetician" },
  { value: UserRole.RECEPTIONIST, label: "Receptionist" },
  { value: UserRole.BILLING, label: "Billing" },
  { value: UserRole.CALL_CENTER, label: "Call Center" },
  { value: UserRole.ASSISTANT, label: "Assistant" },
  { value: UserRole.OPERATOR, label: "Operator" },
];

// ─── Helpers ────────────────────────────────────────────────────────

function feeNumber(v: User["consultationFee"]): number | null {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const n = parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

// ═══════════════════════════════════════════════════════════════════════
// Page
// ═══════════════════════════════════════════════════════════════════════

export default function StaffPage() {
  const access = useModuleAccess("MOD-STAFF");
  const { user: currentUser } = useAuth();
  const qc = useQueryClient();
  const { confirm } = useConfirm();

  const { data: staffResponse, isLoading } = useStaff();
  const { data: branchesResponse } = useBranches();
  const users = (staffResponse?.data || []) as User[];
  const branches = (branchesResponse?.data || []) as Branch[];

  const create = useCreateUser();
  const update = useUpdateUser();

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<"ALL" | UserRole>("ALL");
  const [branchFilter, setBranchFilter] = useState<"ALL" | string>("ALL");
  const [statusFilter, setStatusFilter] = useState<"ACTIVE" | "ALL" | "INACTIVE">("ACTIVE");

  const [formMode, setFormMode] = useState<"closed" | "create" | "edit">("closed");
  const [formTarget, setFormTarget] = useState<User | null>(null);
  const [detailTarget, setDetailTarget] = useState<User | null>(null);
  const [resetTarget, setResetTarget] = useState<User | null>(null);
  const [statusToast, setStatusToast] = useState<string | null>(null);

  // ─── Counts ───────────────────────────────────────────────────────
  const counts = useMemo(() => {
    const byRole: Record<string, number> = {};
    let active = 0;
    let newThisMonth = 0;
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    for (const u of users) {
      byRole[u.role] = (byRole[u.role] || 0) + 1;
      if (u.isActive) active++;
      const created = new Date(u.createdAt);
      if (!isNaN(created.getTime()) && created >= monthStart) newThisMonth++;
    }
    return {
      total: users.length,
      active,
      inactive: users.length - active,
      doctors: byRole[UserRole.DOCTOR] || 0,
      newThisMonth,
      byRole,
    };
  }, [users]);

  // ─── Filter pipeline ──────────────────────────────────────────────
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      if (statusFilter === "ACTIVE" && !u.isActive) return false;
      if (statusFilter === "INACTIVE" && u.isActive) return false;
      if (roleFilter !== "ALL" && u.role !== roleFilter) return false;
      if (branchFilter !== "ALL" && u.branchId !== branchFilter) return false;
      if (q) {
        const hay = [
          u.name,
          u.email,
          ROLE_LABEL[u.role],
          u.speciality ?? "",
          u.licenseNumber ?? "",
          u.branch?.name ?? "",
          u.branch?.code ?? "",
        ].join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [users, search, statusFilter, roleFilter, branchFilter]);

  // ─── Mutations ────────────────────────────────────────────────────
  const submitForm = (data: StaffFormData) => {
    if (formMode === "edit" && formTarget) {
      // PATCH only takes mutable fields — strip email/password for edit.
      const { name, phone, role, branchId, speciality, licenseNumber, consultationFee } = data;
      update.mutate(
        {
          id: formTarget.id,
          data: {
            name,
            phone: phone || null,
            role,
            branchId,
            speciality: role === UserRole.DOCTOR ? (speciality || null) : null,
            licenseNumber: role === UserRole.DOCTOR ? (licenseNumber || null) : null,
            consultationFee: role === UserRole.DOCTOR ? (consultationFee ?? null) : null,
          },
        },
        {
          onSuccess: (res) => {
            setFormMode("closed"); setFormTarget(null);
            const fresh = (res as { data?: User })?.data;
            if (fresh) {
              setDetailTarget((prev) => (prev?.id === fresh.id ? fresh : prev));
              setStatusToast(`${fresh.name} updated.`);
              window.setTimeout(() => setStatusToast(null), 3000);
            }
          },
        }
      );
    } else {
      const payload: Record<string, unknown> = {
        name: data.name,
        email: data.email,
        password: data.password,
        role: data.role,
        phone: data.phone || undefined,
        branchId: data.branchId || undefined,
      };
      if (data.role === UserRole.DOCTOR) {
        if (data.speciality) payload.speciality = data.speciality;
        if (data.licenseNumber) payload.licenseNumber = data.licenseNumber;
        if (data.consultationFee != null) payload.consultationFee = data.consultationFee;
      }
      create.mutate(payload, {
        onSuccess: () => { setFormMode("closed"); setFormTarget(null); },
      });
    }
  };

  const toggleActive = async (u: User) => {
    if (u.id === currentUser?.id) {
      setStatusToast("You can't deactivate your own account.");
      window.setTimeout(() => setStatusToast(null), 3000);
      return;
    }
    if (u.isActive) {
      const ok = await confirm({
        title: `Deactivate ${u.name}?`,
        message: "They will no longer be able to sign in. Historical records (appointments, calls, notes, invoices) stay intact and continue to reference them. You can re-activate later.",
        confirmLabel: "Deactivate",
        variant: "warning",
      });
      if (!ok) return;
    }
    try {
      await api.admin.setUserActive(u.id, !u.isActive);
      setStatusToast(`${u.name} ${u.isActive ? "deactivated" : "re-activated"}.`);
      window.setTimeout(() => setStatusToast(null), 3000);
      qc.invalidateQueries({ queryKey: ["staff"] });
      setDetailTarget(null);
    } catch (e) {
      setStatusToast(e instanceof Error ? e.message : "Failed.");
      window.setTimeout(() => setStatusToast(null), 4000);
    }
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
    <div data-id="ADMIN-USERS" className="animate-fade-in space-y-5 sm:space-y-6">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl border border-stone-100 bg-gradient-to-br from-cyan-600 via-blue-600 to-indigo-600 px-5 py-5 sm:px-7 sm:py-6 text-white">
        <div className="absolute inset-0 opacity-25 [background:radial-gradient(circle_at_30%_30%,#fff_0,transparent_45%)]" />
        <div className="relative flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <Users className="w-4 h-4" />
              <span className="text-[11px] uppercase tracking-wider font-semibold opacity-90">Team</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-semibold leading-tight">Your people, all in one place.</h1>
            <p className="text-sm opacity-90 mt-1 max-w-xl">
              Add, edit, reset passwords, and deactivate accounts. Doctors get a consultation fee and license number.
            </p>
          </div>
          <Button
            onClick={() => { setFormTarget(null); setFormMode("create"); }}
            iconLeft={<Plus className="w-4 h-4" />}
            className="!bg-white !text-blue-700 hover:!bg-stone-50"
          >
            Add member
          </Button>
        </div>
      </div>

      {/* Headline metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard label="Total team" value={counts.total} icon={<Users className="w-5 h-5" />} color="primary" />
        <StatCard label="Doctors" value={counts.doctors} icon={<Stethoscope className="w-5 h-5" />} color="info" />
        <StatCard label="Active now" value={counts.active} icon={<UserCheck className="w-5 h-5" />} color="success" />
        <StatCard label="Joined this month" value={counts.newThisMonth} icon={<CalendarDays className="w-5 h-5" />} color="warning" />
      </div>

      {/* Search + filters */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-3">
          <SearchInput
            placeholder="Search name, email, role, branch, license…"
            value={search}
            onChange={setSearch}
            className="w-full sm:max-w-sm"
          />
          <div className="flex flex-wrap gap-2">
            {([
              { key: "ACTIVE", label: `Active (${counts.active})` },
              { key: "ALL", label: `All (${counts.total})` },
              { key: "INACTIVE", label: `Inactive (${counts.inactive})` },
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
            {(search || roleFilter !== "ALL" || branchFilter !== "ALL" || statusFilter !== "ACTIVE") && (
              <button
                onClick={() => { setSearch(""); setRoleFilter("ALL"); setBranchFilter("ALL"); setStatusFilter("ACTIVE"); }}
                className="px-3 py-1.5 rounded-full text-xs font-medium text-stone-500 hover:text-stone-700 cursor-pointer flex items-center gap-1"
              >
                <X className="w-3 h-3" /> Clear
              </button>
            )}
          </div>
        </div>

        {/* Role chips — secondary line so the page doesn't get crowded */}
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setRoleFilter("ALL")}
            className={`text-[11px] px-2.5 py-1 rounded-full transition-all cursor-pointer ${
              roleFilter === "ALL" ? "bg-blue-600 text-white" : "bg-stone-100 text-stone-600 hover:bg-stone-200"
            }`}
          >
            All roles
          </button>
          {ROLE_ORDER.filter((r) => (counts.byRole[r] ?? 0) > 0).map((r) => (
            <button
              key={r}
              onClick={() => setRoleFilter(roleFilter === r ? "ALL" : r)}
              className={`text-[11px] px-2.5 py-1 rounded-full transition-all cursor-pointer ${
                roleFilter === r ? "bg-blue-600 text-white" : "bg-stone-100 text-stone-600 hover:bg-stone-200"
              }`}
            >
              {ROLE_LABEL[r]} · {counts.byRole[r] ?? 0}
            </button>
          ))}
          {branches.length > 1 && (
            <>
              <span className="mx-1 text-stone-300">·</span>
              <button
                onClick={() => setBranchFilter("ALL")}
                className={`text-[11px] px-2.5 py-1 rounded-full transition-all cursor-pointer ${
                  branchFilter === "ALL" ? "bg-stone-900 text-white" : "bg-stone-100 text-stone-600 hover:bg-stone-200"
                }`}
              >
                All branches
              </button>
              {branches.filter((b) => b.isActive).map((b) => (
                <button
                  key={b.id}
                  onClick={() => setBranchFilter(branchFilter === b.id ? "ALL" : b.id)}
                  className={`text-[11px] px-2.5 py-1 rounded-full transition-all cursor-pointer ${
                    branchFilter === b.id ? "bg-stone-900 text-white" : "bg-stone-100 text-stone-600 hover:bg-stone-200"
                  }`}
                >
                  {b.code}
                </button>
              ))}
            </>
          )}
        </div>
      </div>

      {/* Cards */}
      {visible.length === 0 ? (
        <EmptyState onCreate={() => { setFormTarget(null); setFormMode("create"); }} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
          {visible.map((u) => (
            <UserCard
              key={u.id}
              user={u}
              onOpen={() => setDetailTarget(u)}
              onEdit={() => { setFormTarget(u); setFormMode("edit"); }}
            />
          ))}
        </div>
      )}

      {/* Toast */}
      {statusToast && (
        <div className="fixed bottom-4 right-4 p-3 rounded-xl bg-stone-900 text-white text-sm shadow-lg max-w-sm">
          {statusToast}
        </div>
      )}

      {/* Form (create + edit) */}
      <StaffFormPanel
        mode={formMode === "edit" ? "edit" : "create"}
        open={formMode !== "closed"}
        target={formTarget}
        branches={branches}
        onClose={() => { setFormMode("closed"); setFormTarget(null); create.reset(); update.reset(); }}
        onSubmit={submitForm}
        submitting={create.isPending || update.isPending}
        error={(create.error?.message ?? update.error?.message) || null}
      />

      {/* Details */}
      <DetailsPanel
        target={detailTarget}
        currentUserId={currentUser?.id}
        onClose={() => setDetailTarget(null)}
        onEdit={(u) => { setFormTarget(u); setFormMode("edit"); setDetailTarget(null); }}
        onResetPassword={(u) => setResetTarget(u)}
        onToggleActive={toggleActive}
        toggling={update.isPending}
      />

      {/* Reset password */}
      <ResetPasswordPanel
        target={resetTarget}
        onClose={() => setResetTarget(null)}
        onDone={(msg) => { setStatusToast(msg); window.setTimeout(() => setStatusToast(null), 3000); }}
      />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Pieces
// ═══════════════════════════════════════════════════════════════════════

function UserCard({
  user, onOpen, onEdit,
}: {
  user: User;
  onOpen: () => void;
  onEdit: () => void;
}) {
  const formatCurrency = useFormatCurrency();
  const lastLogin = user.lastLoginAt || user.lastLogin;
  const fee = feeNumber(user.consultationFee);
  return (
    <Card
      hover
      padding="lg"
      onClick={onOpen}
      className={`bg-white rounded-2xl border border-stone-100 shadow-sm animate-fade-in cursor-pointer transition-shadow hover:shadow-md ${
        !user.isActive ? "opacity-60" : ""
      }`}
    >
      <div className="flex flex-col items-center text-center gap-3">
        <div className="relative">
          <Avatar name={user.name} src={user.avatar ?? undefined} size="xl" />
          <span
            className={`absolute bottom-0 right-0 w-4 h-4 rounded-full border-2 border-white ${
              user.isActive ? "bg-emerald-400" : "bg-stone-300"
            }`}
            title={user.isActive ? "Active" : "Inactive"}
          />
          <button
            onClick={(e) => { e.stopPropagation(); onEdit(); }}
            className="absolute -top-1 -right-1 w-7 h-7 rounded-full bg-white border border-stone-200 shadow-sm flex items-center justify-center text-stone-500 hover:text-blue-600 cursor-pointer"
            aria-label="Edit"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="min-w-0 w-full">
          <p className="font-semibold text-stone-900 truncate">{user.name}</p>
          <p className="text-xs text-stone-500 mt-0.5 truncate">{user.email}</p>
        </div>

        <Badge variant={ROLE_BADGE[user.role] || "default"}>
          {ROLE_LABEL[user.role] || user.role}
        </Badge>

        {/* Doctor extras inline */}
        {user.role === UserRole.DOCTOR && (user.speciality || fee != null) && (
          <div className="text-[11px] text-stone-500 -mt-1 truncate w-full">
            {user.speciality && <span className="truncate">{user.speciality}</span>}
            {user.speciality && fee != null && <span className="mx-1">·</span>}
            {fee != null && <span>{formatCurrency(fee)}</span>}
          </div>
        )}

        <div className="w-full pt-3 border-t border-stone-100 space-y-1.5">
          <div className="flex items-center justify-center gap-1.5 text-xs text-stone-500">
            <MapPin className="w-3.5 h-3.5" />
            <span className="truncate">
              {user.branch?.name ?? "Unassigned"}
              {user.branch?.code && (
                <span className="ml-1 text-[10px] font-mono text-stone-400">{user.branch.code}</span>
              )}
            </span>
          </div>
          <div className="flex items-center justify-center gap-1.5 text-xs text-stone-400">
            <Clock className="w-3.5 h-3.5" />
            <span>{lastLogin ? `Active ${timeAgo(lastLogin)}` : "Never logged in"}</span>
          </div>
        </div>
      </div>
    </Card>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="rounded-2xl border-2 border-dashed border-stone-200 py-16 px-6 text-center">
      <div className="w-14 h-14 mx-auto rounded-full bg-blue-50 flex items-center justify-center mb-3">
        <Users className="w-7 h-7 text-blue-400" />
      </div>
      <p className="text-sm text-stone-700 font-medium mb-1">No team members match this filter.</p>
      <p className="text-xs text-stone-400 mb-4">Add a doctor, receptionist, or assistant to get started.</p>
      <Button onClick={onCreate} iconLeft={<Plus className="w-4 h-4" />}>Add member</Button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Form panel — create + edit share the same panel in two modes
// ═══════════════════════════════════════════════════════════════════════

interface StaffFormData {
  name: string;
  email: string;
  password: string;
  phone: string;
  role: UserRole;
  branchId: string;
  speciality: string;
  licenseNumber: string;
  consultationFee: number | null;
}

function StaffFormPanel({
  mode, open, target, branches, onClose, onSubmit, submitting, error,
}: {
  mode: "create" | "edit";
  open: boolean;
  target: User | null;
  branches: Branch[];
  onClose: () => void;
  onSubmit: (data: StaffFormData) => void;
  submitting: boolean;
  error: string | null;
}) {
  const [seenKey, setSeenKey] = useState("");
  const key = `${open}::${target?.id ?? ""}::${mode}`;

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<UserRole>(UserRole.DOCTOR);
  const [branchId, setBranchId] = useState("");
  const [speciality, setSpeciality] = useState("");
  const [licenseNumber, setLicenseNumber] = useState("");
  const [consultationFee, setConsultationFee] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  if (key !== seenKey) {
    setSeenKey(key);
    setErrors({});
    if (mode === "edit" && target) {
      setName(target.name ?? "");
      setEmail(target.email ?? "");
      setPassword("");
      setPhone(target.phone ?? "");
      setRole(target.role);
      setBranchId(target.branchId ?? "");
      setSpeciality(target.speciality ?? "");
      setLicenseNumber(target.licenseNumber ?? "");
      const fee = feeNumber(target.consultationFee);
      setConsultationFee(fee != null ? String(fee) : "");
    } else if (open && mode === "create") {
      setName(""); setEmail(""); setPassword(""); setPhone("");
      setRole(UserRole.DOCTOR); setBranchId("");
      setSpeciality(""); setLicenseNumber(""); setConsultationFee("");
    }
  }

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = "Name is required";
    if (mode === "create") {
      if (!email.trim()) errs.email = "Email is required";
      else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) errs.email = "Invalid email";
      if (!password.trim()) errs.password = "Password is required";
      else if (password.length < 8) errs.password = "Min 8 characters";
    }
    if (!role) errs.role = "Role is required";
    if (mode === "create" && !branchId) errs.branchId = "Branch is required";
    if (consultationFee && !Number.isFinite(parseFloat(consultationFee))) {
      errs.consultationFee = "Must be a number";
    }
    return errs;
  };

  const submit = () => {
    const errs = validate();
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    const fee = consultationFee.trim() ? parseFloat(consultationFee) : NaN;
    onSubmit({
      name: name.trim(),
      email: email.trim(),
      password,
      phone: phone.trim(),
      role,
      branchId,
      speciality: speciality.trim(),
      licenseNumber: licenseNumber.trim(),
      consultationFee: Number.isFinite(fee) && fee >= 0 ? fee : null,
    });
  };

  return (
    <SlidePanel
      isOpen={open}
      onClose={onClose}
      title={mode === "edit" ? "Edit team member" : "Add team member"}
      subtitle={
        mode === "edit"
          ? "Email isn't editable here — it's the auth identity."
          : "New staff sign in with the email + password you set."
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
            {submitting ? "Saving..." : mode === "edit" ? "Save changes" : "Create member"}
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

        <Input
          label="Full name"
          required
          placeholder="e.g. Dr. Sarah Ahmed"
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={errors.name}
        />

        {mode === "create" ? (
          <>
            <Input
              label="Email"
              required
              type="email"
              placeholder="sarah@clinic.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              error={errors.email}
            />
            <Input
              label="Password"
              required
              type="password"
              placeholder="Min 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              error={errors.password}
            />
          </>
        ) : (
          <div>
            <p className="text-xs font-medium text-stone-500 mb-1">Email</p>
            <p className="text-sm text-stone-900 font-mono">{email}</p>
            <p className="text-[11px] text-stone-400 mt-0.5">Use Reset password from the details panel to change credentials.</p>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Select
            label="Role"
            required
            placeholder="Select role..."
            options={ROLE_OPTIONS_FOR_CREATE}
            value={role}
            onChange={(e) => setRole(e.target.value as UserRole)}
            error={errors.role}
          />
          <Select
            label="Branch"
            required
            placeholder="Select branch..."
            options={branches.filter((b) => b.isActive).map((b) => ({ value: b.id, label: `${b.name} (${b.code})` }))}
            value={branchId}
            onChange={(e) => setBranchId(e.target.value)}
            error={errors.branchId}
          />
        </div>

        <Input
          label="Phone (optional)"
          placeholder="+92 300 0000 000"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />

        {/* Doctor-only block */}
        {role === UserRole.DOCTOR && (
          <div className="rounded-2xl bg-blue-50/50 border border-blue-100 px-4 py-3 space-y-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-blue-700">Doctor details</p>
            <Input
              label="Speciality"
              placeholder="e.g. Dermatology, Cosmetic Surgery"
              value={speciality}
              onChange={(e) => setSpeciality(e.target.value)}
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input
                label="PMC license #"
                placeholder="e.g. PMDC-12345"
                value={licenseNumber}
                onChange={(e) => setLicenseNumber(e.target.value)}
              />
              <Input
                label="Consultation fee (Rs.)"
                type="number"
                min={0}
                step={100}
                placeholder="e.g. 2500"
                value={consultationFee}
                onChange={(e) => setConsultationFee(e.target.value)}
                error={errors.consultationFee}
              />
            </div>
            <p className="text-[10px] text-blue-700/80">
              Fee feeds the receptionist&apos;s check-in pay-then-proceed flow. License number is unique across the system.
            </p>
          </div>
        )}
      </div>
    </SlidePanel>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Details panel
// ═══════════════════════════════════════════════════════════════════════

function DetailsPanel({
  target, currentUserId, onClose, onEdit, onResetPassword, onToggleActive, toggling,
}: {
  target: User | null;
  currentUserId?: string;
  onClose: () => void;
  onEdit: (u: User) => void;
  onResetPassword: (u: User) => void;
  onToggleActive: (u: User) => void;
  toggling: boolean;
}) {
  const formatCurrency = useFormatCurrency();
  if (!target) return null;
  const lastLogin = target.lastLoginAt || target.lastLogin;
  const fee = feeNumber(target.consultationFee);
  const isSelf = currentUserId && target.id === currentUserId;

  return (
    <SlidePanel
      isOpen={!!target}
      onClose={onClose}
      title={target.name}
      subtitle={`${ROLE_LABEL[target.role]}${target.branch?.code ? ` · ${target.branch.code}` : ""}`}
      width="lg"
      footer={
        <div className="flex justify-between gap-2 w-full flex-wrap">
          <div className="flex gap-2 flex-wrap">
            {!isSelf && (
              target.isActive ? (
                <Button
                  variant="ghost"
                  className="text-red-600"
                  iconLeft={<UserX className="w-4 h-4" />}
                  onClick={() => onToggleActive(target)}
                  disabled={toggling}
                >
                  {toggling ? "Working..." : "Deactivate"}
                </Button>
              ) : (
                <Button
                  variant="outline"
                  className="text-emerald-700 border-emerald-100 hover:bg-emerald-50"
                  iconLeft={<UserPlus2 className="w-4 h-4" />}
                  onClick={() => onToggleActive(target)}
                  disabled={toggling}
                >
                  {toggling ? "Working..." : "Re-activate"}
                </Button>
              )
            )}
            <Button
              variant="outline"
              iconLeft={<KeyRound className="w-4 h-4" />}
              onClick={() => onResetPassword(target)}
            >
              Reset password
            </Button>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>Close</Button>
            <Button onClick={() => onEdit(target)} iconLeft={<Pencil className="w-4 h-4" />}>Edit</Button>
          </div>
        </div>
      }
    >
      <div className="space-y-5 pt-1">
        <div className="flex items-center gap-3">
          <Avatar name={target.name} src={target.avatar ?? undefined} size="lg" />
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-0.5 flex-wrap">
              <Badge variant={ROLE_BADGE[target.role] || "default"}>{ROLE_LABEL[target.role]}</Badge>
              <span
                className={`text-[10px] px-2 py-0.5 rounded-full ${
                  target.isActive ? "bg-emerald-50 text-emerald-700" : "bg-stone-100 text-stone-500"
                }`}
              >
                {target.isActive ? "Active" : "Inactive"}
              </span>
            </div>
            <p className="text-xs text-stone-500">
              {target.email}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <Field label="Email" value={target.email} icon={<Mail className="w-3 h-3" />} mono />
          <Field label="Phone" value={target.phone || "—"} icon={<PhoneIcon className="w-3 h-3" />} />
          <Field
            label="Branch"
            value={target.branch?.name ? `${target.branch.name}${target.branch.code ? ` (${target.branch.code})` : ""}` : "Unassigned"}
            icon={<MapPin className="w-3 h-3" />}
          />
          <Field
            label="Last login"
            value={lastLogin ? `${timeAgo(lastLogin)}` : "Never"}
            icon={<Clock className="w-3 h-3" />}
          />
        </div>

        {target.role === UserRole.DOCTOR && (
          <div className="rounded-2xl bg-blue-50/50 border border-blue-100 px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-blue-700 mb-2">Doctor details</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <Field label="Speciality" value={target.speciality || "—"} icon={<Stethoscope className="w-3 h-3" />} />
              <Field label="PMC license" value={target.licenseNumber || "—"} icon={<Award className="w-3 h-3" />} mono />
              <Field
                label="Consultation fee"
                value={fee != null ? formatCurrency(fee) : "—"}
                icon={<Wallet className="w-3 h-3" />}
              />
            </div>
          </div>
        )}

        {!target.isActive && (
          <div className="rounded-xl bg-amber-50 border border-amber-100 px-3.5 py-2.5 text-xs text-amber-800">
            This account is deactivated — they can&apos;t sign in. Historical records remain intact.
          </div>
        )}

        {isSelf && (
          <div className="rounded-xl bg-stone-50 border border-stone-200 px-3.5 py-2.5 text-xs text-stone-600">
            This is your own account. Use the Settings page to update your profile.
          </div>
        )}
      </div>
    </SlidePanel>
  );
}

function Field({ label, value, icon, mono }: { label: string; value: string; icon?: React.ReactNode; mono?: boolean }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-400 mb-0.5 flex items-center gap-1">
        {icon} {label}
      </p>
      <p className={`text-sm text-stone-900 ${mono ? "font-mono" : ""} truncate`}>{value}</p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Reset password panel
// ═══════════════════════════════════════════════════════════════════════

function ResetPasswordPanel({
  target, onClose, onDone,
}: {
  target: User | null;
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const [pwd, setPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Reset state when the target changes — derived-from-prop pattern.
  const [seenId, setSeenId] = useState("");
  const id = target?.id ?? "";
  if (id !== seenId) {
    setSeenId(id);
    setPwd(""); setConfirmPwd(""); setErr(null); setBusy(false);
  }

  const submit = async () => {
    if (!target) return;
    setErr(null);
    if (pwd.length < 8) return setErr("Min 8 characters.");
    if (pwd !== confirmPwd) return setErr("Passwords don't match.");
    setBusy(true);
    try {
      await api.admin.resetUserPassword(target.id, pwd);
      onDone(`Password updated for ${target.email}.`);
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to reset password.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <SlidePanel
      isOpen={!!target}
      onClose={onClose}
      title="Reset password"
      subtitle={target ? `for ${target.name} · ${target.email}` : ""}
      width="sm"
      footer={
        <div className="flex justify-end gap-2 w-full">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={busy} iconLeft={busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}>
            {busy ? "Resetting..." : "Set new password"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4 pt-1">
        {err && (
          <div className="p-3 rounded-xl bg-red-50 border border-red-100 text-sm text-red-700">
            {err}
          </div>
        )}
        <p className="text-xs text-stone-500">
          The user will sign in with this password next time. Their current password will be invalidated immediately.
        </p>
        <Input
          label="New password"
          required
          type="password"
          placeholder="Min 8 characters"
          value={pwd}
          onChange={(e) => setPwd(e.target.value)}
        />
        <Input
          label="Confirm new password"
          required
          type="password"
          value={confirmPwd}
          onChange={(e) => setConfirmPwd(e.target.value)}
        />
      </div>
    </SlidePanel>
  );
}
