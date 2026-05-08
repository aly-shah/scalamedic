"use client";

// ============================================================
// MediCore ERP — Module System React Hooks
// ============================================================

import { useEffect, useMemo, useCallback, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { moduleRegistry } from "./registry";
import { eventBus } from "./events";
import type { ModuleId, PermissionAction, ModuleDefinition, ModuleEvent } from "./types";
import { UserRole } from "@/types";

/**
 * Check if the current user can access a module action.
 *
 * Subscribes to the registry so when an admin toggles a permission
 * chip on /admin/roles (which calls moduleRegistry.setOverride), every
 * useModuleAccess consumer re-renders with the new effective access.
 */
export function useModuleAccess(moduleId: ModuleId) {
  const { user } = useAuth();
  const role = (user?.role as UserRole) ?? UserRole.ASSISTANT;
  const [version, setVersion] = useState(0);

  useEffect(() => {
    return moduleRegistry.subscribe(() => setVersion((v) => v + 1));
  }, []);

  return useMemo(() => ({
    canView: moduleRegistry.canAccess(role, moduleId, "VIEW"),
    canCreate: moduleRegistry.canAccess(role, moduleId, "CREATE"),
    canEdit: moduleRegistry.canAccess(role, moduleId, "EDIT"),
    canDelete: moduleRegistry.canAccess(role, moduleId, "DELETE"),
    canExport: moduleRegistry.canAccess(role, moduleId, "EXPORT"),
    can: (action: PermissionAction) => moduleRegistry.canAccess(role, moduleId, action),
    // version is part of the key so this memo re-runs when overrides change
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [role, moduleId, version]);
}

/**
 * Get the module definition.
 */
export function useModule(moduleId: ModuleId): ModuleDefinition | undefined {
  return useMemo(() => moduleRegistry.get(moduleId), [moduleId]);
}

/**
 * Get navigation items for the current user's role.
 */
export function useModuleNavigation() {
  const { user } = useAuth();
  const role = (user?.role as UserRole) ?? UserRole.ASSISTANT;

  return useMemo(() => moduleRegistry.getNavigation(role), [role]);
}

/**
 * Get patient profile submodules for the current user's role.
 */
export function usePatientModules() {
  const { user } = useAuth();
  const role = (user?.role as UserRole) ?? UserRole.ASSISTANT;

  return useMemo(() => moduleRegistry.getPatientSubmodules(role), [role]);
}

/**
 * Subscribe to module events. Automatically cleans up on unmount.
 */
export function useModuleEvent(
  eventType: string,
  moduleId: ModuleId,
  handler: (event: ModuleEvent) => void
) {
  useEffect(() => {
    return eventBus.on(eventType, moduleId, handler);
  }, [eventType, moduleId, handler]);
}

/**
 * Subscribe to a namespace of events (e.g., "patient.*").
 */
export function useModuleEventNamespace(
  namespace: string,
  moduleId: ModuleId,
  handler: (event: ModuleEvent) => void
) {
  useEffect(() => {
    return eventBus.onNamespace(namespace, moduleId, handler);
  }, [namespace, moduleId, handler]);
}

/**
 * Get an emit function scoped to a module.
 */
export function useModuleEmit(moduleId: ModuleId) {
  return useCallback(
    <T = Record<string, unknown>>(
      type: string,
      payload: T,
      meta?: { entityId?: string; patientId?: string; appointmentId?: string }
    ) => {
      eventBus.emit(type, moduleId, payload, meta);
    },
    [moduleId]
  );
}

/**
 * Track live module events and return latest for display.
 */
export function useModuleEventLog(options?: { moduleId?: ModuleId; patientId?: string; limit?: number }) {
  const limit = options?.limit ?? 50;

  // Initialize with current history
  const [events, setEvents] = useState<ModuleEvent[]>(() => {
    const history = eventBus.getHistory({
      moduleId: options?.moduleId,
      patientId: options?.patientId,
    });
    return history.slice(-limit);
  });

  useEffect(() => {
    // Subscribe to new events (callback-based setState is fine)
    const unsub = eventBus.onNamespace("", options?.moduleId ?? "MOD-DASHBOARD", (event) => {
      if (options?.patientId && event.patientId !== options.patientId) return;
      if (options?.moduleId && event.sourceModule !== options.moduleId) return;
      setEvents((prev) => [...prev.slice(-(limit - 1)), event]);
    });

    return unsub;
  }, [options?.moduleId, options?.patientId, limit]);

  return events;
}

/**
 * Get all modules the current user can access.
 */
export function useAccessibleModules() {
  const { user } = useAuth();
  const role = (user?.role as UserRole) ?? UserRole.ASSISTANT;
  return useMemo(() => moduleRegistry.getForRole(role), [role]);
}
