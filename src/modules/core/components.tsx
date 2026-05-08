"use client";

// ============================================================
// MediCore ERP — Module-Aware Components
// Permission-based UI wrappers
// ============================================================

import type { ReactNode } from "react";
import { useModuleAccess } from "./hooks";
import type { ModuleId, PermissionAction } from "./types";

/**
 * Only renders children if the user has the specified permission on the module.
 */
export function ModuleGate({
  moduleId,
  action = "VIEW",
  fallback = null,
  children,
}: {
  moduleId: ModuleId;
  action?: PermissionAction;
  fallback?: ReactNode;
  children: ReactNode;
}) {
  const access = useModuleAccess(moduleId);
  if (!access.can(action)) return <>{fallback}</>;
  return <>{children}</>;
}

/**
 * Renders children only if user can VIEW the module.
 */
export function ModuleVisible({ moduleId, children }: { moduleId: ModuleId; children: ReactNode }) {
  return <ModuleGate moduleId={moduleId} action="VIEW">{children}</ModuleGate>;
}

/**
 * Wraps an action button — disabled or hidden if user lacks permission.
 */
export function ModuleActionGate({
  moduleId,
  action,
  mode = "hide",
  children,
}: {
  moduleId: ModuleId;
  action: PermissionAction;
  mode?: "hide" | "disable";
  children: ReactNode;
}) {
  const access = useModuleAccess(moduleId);
  const allowed = access.can(action);

  if (!allowed && mode === "hide") return null;

  if (!allowed && mode === "disable") {
    return (
      <div className="opacity-50 pointer-events-none cursor-not-allowed" title="You don't have permission for this action">
        {children}
      </div>
    );
  }

  return <>{children}</>;
}
