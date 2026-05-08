"use client";

/**
 * Roles & Permissions
 *
 * Live view of the module registry — the same source of truth that
 * gates every page in the app. Two compatible views:
 *
 *   - Sidebar role list on lg+ (sticky), pill chips on mobile.
 *     Active role's modules render in the main area, bucketed by
 *     workflow stage so 20+ modules don't read as a flat scroll.
 *   - "Matrix" toggle in the toolbar swaps the main area for a full
 *     role × module dot grid — same data, scan-everywhere shape for
 *     compliance / audit reviews.
 *
 * Every interactive element here is an explicit <button type="button">
 * (no implicit submit), the radial overlay on the hero is
 * pointer-events-none, and no decorative element sits above the
 * action area — covers the click-issue regressions we hit in the
 * earlier rewrite.
 *
 * Permissions are code-defined; the page is a window onto state, not
 * an editor. Honest banner says so.
 */
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ShieldCheck, ArrowLeft, Info, Download, LayoutGrid, Rows3,
  Eye, Plus, Edit3, Trash2, FileDown, ExternalLink, ChevronRight,
} from "lucide-react";
import { Card, Badge, SearchInput } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { useModuleAccess } from "@/modules/core/hooks";
import { moduleRegistry } from "@/modules/core/registry";
import type { ModuleDefinition, PermissionAction, ModuleId } from "@/modules/core/types";
import { UserRole } from "@/types";
import { useAuth } from "@/lib/auth-context";
import { downloadCSV } from "@/lib/export";
import { cn } from "@/lib/utils";

// ─── Roles + actions ─────────────────────────────────────────────

interface RoleMeta {
  value: UserRole;
  label: string;
  // Tailwind tone for the active pill highlight + sidebar accent.
  pill: string;       // bg+text+border (inactive pill)
  dot: string;        // bg only (sidebar dot)
}

const ROLES: RoleMeta[] = [
  { value: UserRole.SUPER_ADMIN,  label: "Super Admin",  pill: "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200", dot: "bg-fuchsia-500" },
  { value: UserRole.ADMIN,        label: "Admin",        pill: "bg-violet-50 text-violet-700 border-violet-200",   dot: "bg-violet-500" },
  { value: UserRole.DOCTOR,       label: "Doctor",       pill: "bg-teal-50 text-teal-700 border-teal-200",         dot: "bg-teal-500" },
  { value: UserRole.AESTHETICIAN, label: "Aesthetician", pill: "bg-rose-50 text-rose-700 border-rose-200",         dot: "bg-rose-500" },
  { value: UserRole.RECEPTIONIST, label: "Receptionist", pill: "bg-amber-50 text-amber-700 border-amber-200",      dot: "bg-amber-500" },
  { value: UserRole.BILLING,      label: "Billing",      pill: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-500" },
  { value: UserRole.CALL_CENTER,  label: "Call Center",  pill: "bg-indigo-50 text-indigo-700 border-indigo-200",   dot: "bg-indigo-500" },
  { value: UserRole.ASSISTANT,    label: "Assistant",    pill: "bg-stone-100 text-stone-700 border-stone-200",     dot: "bg-stone-500" },
  { value: UserRole.OPERATOR,     label: "Operator",     pill: "bg-sky-50 text-sky-700 border-sky-200",            dot: "bg-sky-500" },
];

const ACTIONS: Array<{ key: PermissionAction; label: string; icon: React.ReactNode; tone: string; dot: string }> = [
  { key: "VIEW",   label: "View",   icon: <Eye    className="w-3 h-3" />, tone: "bg-stone-100  text-stone-700  border-stone-200",  dot: "bg-stone-400" },
  { key: "CREATE", label: "Create", icon: <Plus   className="w-3 h-3" />, tone: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-500" },
  { key: "EDIT",   label: "Edit",   icon: <Edit3  className="w-3 h-3" />, tone: "bg-sky-50     text-sky-700     border-sky-200",     dot: "bg-sky-500" },
  { key: "DELETE", label: "Delete", icon: <Trash2 className="w-3 h-3" />, tone: "bg-red-50     text-red-700     border-red-200",     dot: "bg-red-500" },
  { key: "EXPORT", label: "Export", icon: <FileDown className="w-3 h-3" />, tone: "bg-violet-50 text-violet-700 border-violet-200", dot: "bg-violet-500" },
];

// Workflow position → bucket label. Order matches the patient journey
// so the module list reads like the day-flow of the clinic.
const GROUP_ORDER: Array<{ key: string; label: string }> = [
  { key: "INQUIRY",        label: "Inquiry & Inbound" },
  { key: "REGISTRATION",   label: "Registration" },
  { key: "BOOKING",        label: "Booking" },
  { key: "CHECK_IN",       label: "Check-In" },
  { key: "WAITING",        label: "Waiting" },
  { key: "CONSULTATION",   label: "Consultation" },
  { key: "DIAGNOSIS",      label: "Diagnosis" },
  { key: "TREATMENT",      label: "Treatment" },
  { key: "PRESCRIPTION",   label: "Prescription" },
  { key: "BILLING",        label: "Billing" },
  { key: "PAYMENT",        label: "Payment" },
  { key: "CHECKOUT",       label: "Checkout" },
  { key: "FOLLOW_UP",      label: "Follow-up" },
  { key: "HISTORY_UPDATE", label: "History" },
  { key: "CONTINUOUS",     label: "Continuous" },
  { key: "SYSTEM",         label: "System" },
];

type ViewMode = "by-role" | "matrix";

// ─────────────────────────────────────────────────────────────────

export default function RolesPage() {
  const access = useModuleAccess("MOD-ADMIN");
  const { user } = useAuth();
  const isAdmin = user?.role === "SUPER_ADMIN" || user?.role === "ADMIN";
  const [activeRole, setActiveRole] = useState<UserRole>(UserRole.RECEPTIONIST);
  const [view, setView] = useState<ViewMode>("by-role");
  const [search, setSearch] = useState("");
  // Subscribe to registry overrides so chip toggles re-render the page
  // (the chips read directly from moduleRegistry.canAccess; without this
  // subscribe the local state wouldn't bump on a chip click).
  const [, force] = useState(0);
  useEffect(() => moduleRegistry.subscribe(() => force((n) => n + 1)), []);

  const modules = useMemo(() => moduleRegistry.getAll(), []);
  const q = search.trim().toLowerCase();
  const visibleModules = useMemo(() => {
    if (!q) return modules;
    return modules.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        m.id.toLowerCase().includes(q) ||
        m.purpose.toLowerCase().includes(q) ||
        m.ownedEntities.some((e) => e.toLowerCase().includes(q)),
    );
  }, [modules, q]);

  // Pre-compute "modules this role can touch" counts for the sidebar.
  // Small enough to recompute on every render; no useMemo needed.
  const roleAccessCount = (role: UserRole): number =>
    modules.filter((m) =>
      Object.values(m.permissions).some((roles) => roles.includes(role)),
    ).length;

  if (!access.canView) {
    return (
      <div className="flex items-center justify-center py-20 text-stone-500">
        You don&apos;t have access to this module.
      </div>
    );
  }

  function handleExport() {
    const rows: Record<string, unknown>[] = [];
    for (const m of modules) {
      const row: Record<string, unknown> = {
        Module: m.name,
        ID: m.id,
        "Workflow Stage": m.workflowPosition,
      };
      for (const r of ROLES) {
        const granted = ACTIONS.filter((a) => moduleRegistry.canAccess(r.value, m.id, a.key)).map((a) => a.label);
        row[r.label] = granted.join(" + ") || "—";
      }
      rows.push(row);
    }
    downloadCSV(rows, "roles-permissions");
  }

  // Click-to-toggle handler. Three-state logic:
  //   - If new value matches the static module-def default → DELETE the
  //     override (revert to default).
  //   - Otherwise → PUT an override to force the new value.
  // Optimistic update: flip the registry first, persist after, revert on
  // failure with a toast/alert.
  async function toggleAction(role: UserRole, moduleId: ModuleId, action: PermissionAction) {
    if (!isAdmin) return;
    if (role === UserRole.SUPER_ADMIN) {
      // Super admin always has full access — toggling would be a no-op.
      alert("Super Admin always has full access — overrides not applicable.");
      return;
    }
    const current = moduleRegistry.canAccess(role, moduleId, action);
    const next = !current;
    const defaultGranted = moduleRegistry.defaultGranted(role, moduleId, action);

    // Optimistic local update so the chip flips instantly.
    moduleRegistry.setOverride(
      role,
      moduleId,
      action,
      next === defaultGranted ? null : next,
    );

    try {
      if (next === defaultGranted) {
        const qs = new URLSearchParams({ role, moduleId, action }).toString();
        const res = await fetch(`/api/admin/role-permissions?${qs}`, {
          method: "DELETE",
          credentials: "include",
        });
        const d = await res.json();
        if (!d.success) throw new Error(d.error || "Failed to clear override");
      } else {
        const res = await fetch(`/api/admin/role-permissions`, {
          method: "PUT",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role, moduleId, action, granted: next }),
        });
        const d = await res.json();
        if (!d.success) throw new Error(d.error || "Failed to save override");
      }
    } catch (e) {
      // Roll back the optimistic update.
      moduleRegistry.setOverride(
        role,
        moduleId,
        action,
        current === defaultGranted ? null : current,
      );
      alert(e instanceof Error ? e.message : "Could not save permission");
    }
  }

  return (
    <div className="space-y-5 sm:space-y-6 animate-fade-in" data-id="ADMIN-ROLES">
      {/* ===== HERO ===== */}
      <div className="relative overflow-hidden rounded-2xl border border-stone-100 bg-gradient-to-br from-indigo-600 via-blue-600 to-sky-600 px-5 py-5 sm:px-7 sm:py-6 text-white">
        <div className="pointer-events-none absolute inset-0 opacity-25 [background:radial-gradient(circle_at_30%_30%,#fff_0,transparent_45%)]" />
        <div className="relative flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <Link href="/admin" className="inline-flex items-center gap-1 text-[11px] uppercase tracking-wider font-semibold opacity-90 hover:opacity-100">
                <ArrowLeft className="w-3 h-3" /> Admin
              </Link>
              <span className="opacity-60">/</span>
              <span className="text-[11px] uppercase tracking-wider font-semibold opacity-90">Roles &amp; Permissions</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-semibold leading-tight flex items-center gap-2">
              <ShieldCheck className="w-5 h-5" /> Who can do what
            </h1>
            <p className="text-sm opacity-90 mt-1 max-w-xl">
              Live view of every module&apos;s permission grid — pulled from the same registry the app uses to gate access.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            iconLeft={<Download className="w-3.5 h-3.5" />}
            onClick={handleExport}
            className="!bg-white/15 !border-white/30 !text-white hover:!bg-white/25"
          >
            Export matrix
          </Button>
        </div>
      </div>

      {/* ===== EDITABLE BANNER ===== */}
      <div className="flex items-start gap-3 p-3.5 rounded-xl bg-sky-50 border border-sky-100">
        <Info className="w-4 h-4 text-sky-600 mt-0.5 shrink-0" />
        <div className="text-sm text-sky-900 flex-1 min-w-0">
          {isAdmin ? (
            <>
              <p className="font-medium">Click any chip to toggle the permission.</p>
              <p className="text-xs mt-0.5">
                Overrides save instantly and take effect across the app on the next page load.
                A small dot on a chip means it differs from the module&apos;s shipped default — click again to revert.
              </p>
            </>
          ) : (
            <>
              <p className="font-medium">Read-only view.</p>
              <p className="text-xs mt-0.5">
                You&apos;re seeing the live permission state. Only Admins can toggle these.
              </p>
            </>
          )}
        </div>
      </div>

      {/* ===== TOOLBAR ===== */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
        {/* View toggle */}
        <div className="flex items-center gap-0.5 bg-stone-100 rounded-xl p-1 self-start">
          {([
            { value: "by-role", label: "By role", icon: <Rows3 className="w-3.5 h-3.5" /> },
            { value: "matrix",  label: "Matrix",  icon: <LayoutGrid className="w-3.5 h-3.5" /> },
          ] as const).map((v) => (
            <button
              key={v.value}
              type="button"
              onClick={() => setView(v.value)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer",
                view === v.value
                  ? "bg-white text-stone-900 shadow-sm"
                  : "text-stone-500 hover:text-stone-700",
              )}
            >
              {v.icon} {v.label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="flex-1 min-w-0 max-w-md">
          <SearchInput placeholder="Search modules…" value={search} onChange={setSearch} />
        </div>
      </div>

      {/* ===== CONTENT ===== */}
      {view === "by-role" ? (
        <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-4 sm:gap-5">
          {/* ── Role list — sticky sidebar on lg+, horizontal pills on mobile ── */}
          <aside className="lg:sticky lg:top-20 lg:self-start">
            {/* Mobile: pills */}
            <div className="lg:hidden flex items-center gap-2 overflow-x-auto pb-1 -mb-1">
              {ROLES.map((role) => {
                const active = activeRole === role.value;
                return (
                  <button
                    key={role.value}
                    type="button"
                    onClick={() => setActiveRole(role.value)}
                    className={cn(
                      "shrink-0 px-3.5 py-2 text-sm font-medium rounded-full border transition-colors cursor-pointer",
                      active
                        ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                        : role.pill,
                    )}
                  >
                    {role.label}
                  </button>
                );
              })}
            </div>

            {/* Desktop: vertical list with module-count + accent */}
            <div className="hidden lg:block bg-white rounded-2xl border border-stone-100 shadow-sm p-2">
              <p className="px-3 pt-1 pb-2 text-[10px] uppercase tracking-wider font-semibold text-stone-400">
                Roles ({ROLES.length})
              </p>
              {ROLES.map((role) => {
                const active = activeRole === role.value;
                const count = roleAccessCount(role.value);
                return (
                  <button
                    key={role.value}
                    type="button"
                    onClick={() => setActiveRole(role.value)}
                    className={cn(
                      "w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors cursor-pointer group",
                      active ? "bg-indigo-50" : "hover:bg-stone-50",
                    )}
                  >
                    <span className={cn("w-2 h-2 rounded-full shrink-0", role.dot)} />
                    <div className="min-w-0 flex-1">
                      <p className={cn("text-sm font-semibold truncate", active ? "text-indigo-900" : "text-stone-800")}>
                        {role.label}
                      </p>
                      <p className="text-[11px] text-stone-400 mt-0.5">
                        {count}/{modules.length} modules
                      </p>
                    </div>
                    <ChevronRight className={cn(
                      "w-4 h-4 transition-opacity",
                      active ? "text-indigo-600 opacity-100" : "text-stone-300 opacity-0 group-hover:opacity-100",
                    )} />
                  </button>
                );
              })}
            </div>
          </aside>

          {/* ── Modules for the selected role, bucketed by workflow ── */}
          <ByRoleView role={activeRole} modules={visibleModules} canEdit={isAdmin} onToggle={toggleAction} />
        </div>
      ) : (
        <MatrixView modules={visibleModules} canEdit={isAdmin} onToggle={toggleAction} />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// "By role" — modules grouped by workflow stage, each card shows
// the five action chips for the selected role with granted ones lit.
// ─────────────────────────────────────────────────────────────────

function ByRoleView({
  role, modules, canEdit, onToggle,
}: {
  role: UserRole;
  modules: ModuleDefinition[];
  canEdit: boolean;
  onToggle: (role: UserRole, moduleId: ModuleId, action: PermissionAction) => void;
}) {
  const grouped = useMemo(() => {
    const map = new Map<string, ModuleDefinition[]>();
    for (const m of modules) {
      const k = m.workflowPosition;
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(m);
    }
    return map;
  }, [modules]);

  // Use the registry's canAccess so the count reflects overrides too.
  const accessibleCount = modules.filter((m) =>
    ACTIONS.some((a) => moduleRegistry.canAccess(role, m.id, a.key)),
  ).length;

  const roleMeta = ROLES.find((r) => r.value === role);

  return (
    <div className="space-y-5 min-w-0">
      {/* Selected-role header — anchor for the main area on desktop
          where the user clicked a sidebar item and wants confirmation
          of which slice they're looking at. */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          {roleMeta && <span className={cn("w-2.5 h-2.5 rounded-full", roleMeta.dot)} />}
          <h2 className="text-base font-semibold text-stone-900">{roleMeta?.label}</h2>
          <span className="text-xs text-stone-500">
            <span className="font-semibold text-stone-700">{accessibleCount}</span> / {modules.length} modules
          </span>
        </div>
      </div>

      {GROUP_ORDER.map(({ key, label }) => {
        const inGroup = grouped.get(key);
        if (!inGroup || inGroup.length === 0) return null;
        return (
          <div key={key}>
            <p className="text-[10px] uppercase font-semibold text-stone-400 tracking-wider mb-2">{label}</p>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
              {inGroup.map((m) => (
                <ModuleRoleCard key={m.id} module={m} role={role} canEdit={canEdit} onToggle={onToggle} />
              ))}
            </div>
          </div>
        );
      })}

      {modules.length === 0 && (
        <Card padding="lg">
          <p className="text-center text-stone-400 py-6">No modules match your search.</p>
        </Card>
      )}
    </div>
  );
}

function ModuleRoleCard({
  module: m, role, canEdit, onToggle,
}: {
  module: ModuleDefinition;
  role: UserRole;
  canEdit: boolean;
  onToggle: (role: UserRole, moduleId: ModuleId, action: PermissionAction) => void;
}) {
  const granted = ACTIONS.map((a) => ({
    ...a,
    has: moduleRegistry.canAccess(role, m.id, a.key),
    overridden: moduleRegistry.hasOverride(role, m.id, a.key),
  }));
  const accessible = granted.some((a) => a.has);
  const isPrimary = m.primaryRoles.includes(role);

  return (
    <Card padding="md" className={cn(accessible ? "" : "opacity-60", "animate-fade-in")}>
      <div className="flex items-start gap-3">
        <div
          className="pointer-events-none w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-white text-xs font-semibold"
          style={{ background: m.color }}
        >
          {m.id.replace(/^MOD-/, "").slice(0, 2)}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
            <p className="text-sm font-semibold text-stone-900 truncate">{m.name}</p>
            {isPrimary && <Badge variant="primary">Primary</Badge>}
            {m.route && (
              <Link
                href={m.route}
                className="inline-flex items-center text-stone-400 hover:text-stone-600 transition-colors"
                title={`Open ${m.name}`}
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </Link>
            )}
          </div>
          <p className="text-[11px] text-stone-500 line-clamp-2">{m.purpose}</p>

          {/* Action chips — admins can click to toggle; non-admins see
              the same chips as static. Overridden chips get a tiny dot
              to flag "differs from default". */}
          <div className="flex flex-wrap gap-1.5 mt-2">
            {granted.map((a) => (
              <PermissionChip
                key={a.key}
                action={a}
                canEdit={canEdit}
                onToggle={() => onToggle(role, m.id, a.key)}
              />
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}

// Action chip — button when admin can edit, span otherwise. The
// `overridden` dot tells the admin "this differs from the module's
// shipped default" so they know clicking again will revert.
function PermissionChip({
  action: a, canEdit, onToggle,
}: {
  action: { key: PermissionAction; label: string; icon: React.ReactNode; tone: string; has: boolean; overridden: boolean };
  canEdit: boolean;
  onToggle: () => void;
}) {
  const baseClass = cn(
    "relative inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-medium transition-all",
    a.has ? a.tone : "bg-stone-50 text-stone-300 border-stone-100",
  );
  const tooltip = a.overridden
    ? `${a.label}: ${a.has ? "granted" : "denied"} (overridden${canEdit ? " — click to revert" : ""})`
    : `${a.label}: ${a.has ? "granted" : "denied"}${canEdit ? " — click to toggle" : ""}`;

  if (canEdit) {
    return (
      <button
        type="button"
        onClick={onToggle}
        className={cn(baseClass, "cursor-pointer hover:scale-105 active:scale-95")}
        title={tooltip}
      >
        {a.icon} {a.label}
        {a.overridden && (
          <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-amber-500 ring-1 ring-white" />
        )}
      </button>
    );
  }
  return (
    <span className={baseClass} title={tooltip}>
      {a.icon} {a.label}
      {a.overridden && (
        <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-amber-500 ring-1 ring-white" />
      )}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────
// Matrix view — roles × modules grid with five tiny dots per cell.
// ─────────────────────────────────────────────────────────────────

function MatrixView({
  modules, canEdit, onToggle,
}: {
  modules: ModuleDefinition[];
  canEdit: boolean;
  onToggle: (role: UserRole, moduleId: ModuleId, action: PermissionAction) => void;
}) {
  if (modules.length === 0) {
    return (
      <Card padding="lg">
        <p className="text-center text-stone-400 py-6">No modules match your search.</p>
      </Card>
    );
  }

  return (
    <Card padding="lg">
      {/* Action legend */}
      <div className="flex items-center gap-3 flex-wrap mb-4 text-[11px] text-stone-500">
        <span className="font-medium">Each cell:</span>
        {ACTIONS.map((a) => (
          <span key={a.key} className="inline-flex items-center gap-1">
            <span className={cn("w-2.5 h-2.5 rounded-full", a.dot)} />
            {a.label}
          </span>
        ))}
      </div>

      <div className="overflow-x-auto -mx-2">
        <table className="w-full text-sm border-separate border-spacing-0">
          <thead className="text-xs text-stone-500">
            <tr>
              <th className="text-left py-2 px-3 font-medium sticky left-0 bg-white z-10 border-b-2 border-stone-200">
                Module
              </th>
              {ROLES.map((r) => (
                <th
                  key={r.value}
                  className="text-center py-2 px-2 font-medium whitespace-nowrap border-b-2 border-stone-200"
                  title={r.label}
                >
                  <div className="flex flex-col items-center gap-1">
                    <span className={cn("w-2 h-2 rounded-full", r.dot)} />
                    <span>{r.label}</span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {modules.map((m) => (
              <tr key={m.id} className="hover:bg-stone-50/40">
                <td className="py-2 px-3 sticky left-0 bg-white z-10 border-b border-stone-100">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="pointer-events-none w-1.5 h-6 rounded-full shrink-0"
                      style={{ background: m.color }}
                    />
                    <div className="min-w-0">
                      <p className="font-medium text-stone-900 truncate">{m.name}</p>
                      <p className="text-[10px] text-stone-400 truncate">{m.id}</p>
                    </div>
                  </div>
                </td>
                {ROLES.map((r) => (
                  <td key={r.value} className="py-2 px-2 border-b border-stone-100">
                    <div className="flex items-center justify-center gap-1">
                      {ACTIONS.map((a) => {
                        const has = moduleRegistry.canAccess(r.value, m.id, a.key);
                        const overridden = moduleRegistry.hasOverride(r.value, m.id, a.key);
                        const tooltip = `${r.label} · ${a.label}: ${has ? "granted" : "denied"}${overridden ? " (overridden)" : ""}${canEdit ? " — click to toggle" : ""}`;
                        const dotClass = cn(
                          "w-2.5 h-2.5 rounded-full transition-transform relative",
                          has ? a.dot : "bg-stone-200",
                        );
                        if (canEdit && r.value !== UserRole.SUPER_ADMIN) {
                          return (
                            <button
                              key={a.key}
                              type="button"
                              onClick={() => onToggle(r.value, m.id, a.key)}
                              title={tooltip}
                              className={cn(dotClass, "cursor-pointer hover:scale-150 active:scale-95")}
                            >
                              {overridden && (
                                <span className="absolute -top-0.5 -right-0.5 w-1 h-1 rounded-full bg-amber-500 ring-1 ring-white" />
                              )}
                            </button>
                          );
                        }
                        return (
                          <span
                            key={a.key}
                            title={tooltip}
                            className={dotClass}
                          />
                        );
                      })}
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
