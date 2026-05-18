// ============================================================
// MediCore ERP — Module Registry
// Central registration, lookup, and access control for modules
// ============================================================

import type { ModuleDefinition, ModuleId, PermissionAction, EntityOwnership, RoleModuleAccess } from "./types";
import { UserRole } from "@/types";

class ModuleRegistry {
  private modules = new Map<ModuleId, ModuleDefinition>();
  // Runtime overrides on top of the static module-definition permission
  // grid. Keyed by `${role}:${moduleId}:${action}` → granted boolean.
  // Loaded once at app boot from /api/admin/role-permissions; updated
  // by /admin/roles when an admin clicks a chip. Listeners get notified
  // so useModuleAccess re-renders.
  private overrides = new Map<string, boolean>();
  private listeners = new Set<() => void>();

  private overrideKey(role: UserRole, moduleId: ModuleId, action: PermissionAction): string {
    return `${role}:${moduleId}:${action}`;
  }

  /** Replace the entire override map (called on app boot after fetch). */
  setOverrides(rows: Array<{ role: UserRole; moduleId: string; action: string; granted: boolean }>): void {
    this.overrides.clear();
    for (const r of rows) {
      this.overrides.set(`${r.role}:${r.moduleId}:${r.action}`, r.granted);
    }
    this.notify();
  }

  /** Set or clear a single override. Pass granted=null to revert to default. */
  setOverride(role: UserRole, moduleId: ModuleId, action: PermissionAction, granted: boolean | null): void {
    const k = this.overrideKey(role, moduleId, action);
    if (granted === null) this.overrides.delete(k);
    else this.overrides.set(k, granted);
    this.notify();
  }

  /** Subscribe to override changes. Returns an unsubscribe fn. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  private notify(): void {
    for (const l of this.listeners) l();
  }

  /** Reflect the current override state for UI (useful for /admin/roles). */
  hasOverride(role: UserRole, moduleId: ModuleId, action: PermissionAction): boolean {
    return this.overrides.has(this.overrideKey(role, moduleId, action));
  }

  register(module: ModuleDefinition): void {
    this.modules.set(module.id, module);
  }

  get(id: ModuleId): ModuleDefinition | undefined {
    return this.modules.get(id);
  }

  getAll(): ModuleDefinition[] {
    return Array.from(this.modules.values());
  }

  /**
   * Get modules accessible by a specific role.
   */
  getForRole(role: UserRole): ModuleDefinition[] {
    return this.getAll().filter((mod) =>
      mod.primaryRoles.includes(role) ||
      Object.values(mod.permissions).some((roles) => roles.includes(role))
    );
  }

  /**
   * Get navigation items for a role, sorted by navOrder.
   */
  getNavigation(role: UserRole): ModuleDefinition[] {
    return this.getForRole(role)
      .filter((mod) => mod.route && mod.navLabel)
      .sort((a, b) => (a.navOrder ?? 99) - (b.navOrder ?? 99));
  }

  /**
   * Get patient submodules (shown as tabs on patient profile).
   */
  getPatientSubmodules(role: UserRole): ModuleDefinition[] {
    return this.getForRole(role)
      .filter((mod) => mod.isPatientSubmodule)
      .sort((a, b) => (a.navOrder ?? 99) - (b.navOrder ?? 99));
  }

  /**
   * Check if a role can perform an action in a module.
   *
   * Order: super admin always wins → runtime override (if present) →
   * static module-definition default. The override layer is what makes
   * /admin/roles' chip toggling actually take effect without a redeploy.
   */
  canAccess(role: UserRole, moduleId: ModuleId, action: PermissionAction): boolean {
    if (role === UserRole.SUPER_ADMIN) return true;
    const overrideKey = `${role}:${moduleId}:${action}`;
    if (this.overrides.has(overrideKey)) {
      return this.overrides.get(overrideKey)!;
    }
    const mod = this.modules.get(moduleId);
    if (!mod) return false;
    const allowedRoles = mod.permissions[action];
    return allowedRoles?.includes(role) ?? false;
  }

  /** What the static module def says (no overrides). For UI to show "default vs overridden". */
  defaultGranted(role: UserRole, moduleId: ModuleId, action: PermissionAction): boolean {
    if (role === UserRole.SUPER_ADMIN) return true;
    const mod = this.modules.get(moduleId);
    if (!mod) return false;
    return mod.permissions[action]?.includes(role) ?? false;
  }

  /**
   * Get modules that depend on a given module.
   */
  getDependents(moduleId: ModuleId): ModuleDefinition[] {
    return this.getAll().filter((mod) => mod.dependencies.includes(moduleId));
  }

  /**
   * Get all data connections for a module.
   */
  getConnections(moduleId: ModuleId): { module: ModuleDefinition; direction: "IN" | "OUT" | "BOTH"; entities: string[] }[] {
    const mod = this.modules.get(moduleId);
    if (!mod) return [];
    return mod.dataConnections
      .map((conn) => {
        const target = this.modules.get(conn.moduleId);
        if (!target) return null;
        return { module: target, direction: conn.direction, entities: conn.entities };
      })
      .filter(Boolean) as { module: ModuleDefinition; direction: "IN" | "OUT" | "BOTH"; entities: string[] }[];
  }
}

// Singleton
export const moduleRegistry = new ModuleRegistry();

// ---- Source of Truth Ownership ----

export const entityOwnership: EntityOwnership[] = [
  { entity: "Patient", sourceModule: "MOD-PATIENT", description: "Patient demographics, contact info, profile" },
  { entity: "PatientAllergy", sourceModule: "MOD-MEDICAL-HISTORY", description: "Allergy records" },
  { entity: "PatientMedication", sourceModule: "MOD-PRESCRIPTION", description: "Active medications list" },
  { entity: "MedicalHistory", sourceModule: "MOD-MEDICAL-HISTORY", description: "Conditions, diagnoses" },
  { entity: "SkinHistory", sourceModule: "MOD-SKIN-HISTORY", description: "Skin conditions, assessments" },
  { entity: "Insurance", sourceModule: "MOD-PATIENT", description: "Insurance policies" },
  { entity: "PatientTag", sourceModule: "MOD-PATIENT", description: "Patient tags/labels" },
  { entity: "Appointment", sourceModule: "MOD-APPOINTMENT", description: "Scheduling, status, workflow" },
  { entity: "Room", sourceModule: "MOD-ROOMS", description: "Room inventory and status" },
  { entity: "RoomAllocation", sourceModule: "MOD-ROOMS", description: "Patient-room assignments" },
  { entity: "ConsultationNote", sourceModule: "MOD-CONSULTATION", description: "Clinical notes, diagnoses" },
  { entity: "Treatment", sourceModule: "MOD-PROCEDURE", description: "Treatment catalog" },
  { entity: "Procedure", sourceModule: "MOD-PROCEDURE", description: "Performed treatments with images" },
  { entity: "Prescription", sourceModule: "MOD-PRESCRIPTION", description: "Medication orders" },
  { entity: "PrescriptionItem", sourceModule: "MOD-PRESCRIPTION", description: "Individual medicine entries" },
  { entity: "LabTest", sourceModule: "MOD-CONSULTATION", description: "Lab orders and results" },
  { entity: "Invoice", sourceModule: "MOD-BILLING", description: "Invoices, line items, totals" },
  { entity: "Payment", sourceModule: "MOD-PAYMENT", description: "Payment transactions" },
  { entity: "Refund", sourceModule: "MOD-PAYMENT", description: "Refund transactions" },
  { entity: "Package", sourceModule: "MOD-BILLING", description: "Treatment packages catalog" },
  { entity: "PatientPackage", sourceModule: "MOD-BILLING", description: "Patient package subscriptions" },
  { entity: "Lead", sourceModule: "MOD-COMMUNICATION", description: "Sales leads" },
  { entity: "CallLog", sourceModule: "MOD-COMMUNICATION", description: "Call records" },
  { entity: "CommunicationLog", sourceModule: "MOD-COMMUNICATION", description: "Multi-channel logs" },
  { entity: "FollowUp", sourceModule: "MOD-FOLLOWUP", description: "Follow-up scheduling" },
  { entity: "PatientDocument", sourceModule: "MOD-DOCUMENTS", description: "Documents and files" },
  { entity: "AITranscription", sourceModule: "MOD-AI-TRANSCRIPTION", description: "AI transcripts and summaries" },
  { entity: "Notification", sourceModule: "MOD-NOTIFICATIONS", description: "User notifications" },
  { entity: "Vitals", sourceModule: "MOD-APPOINTMENT", description: "Vital signs" },
  { entity: "User", sourceModule: "MOD-STAFF", description: "Staff profiles" },
  { entity: "Permission", sourceModule: "MOD-ADMIN", description: "Granular permissions" },
  { entity: "AuditLog", sourceModule: "MOD-ADMIN", description: "Audit trail" },
  { entity: "DoctorSchedule", sourceModule: "MOD-STAFF", description: "Doctor availability" },
  { entity: "DoctorLeave", sourceModule: "MOD-STAFF", description: "Leave records" },
  { entity: "Branch", sourceModule: "MOD-BRANCH", description: "Clinic branches" },
  { entity: "SystemSetting", sourceModule: "MOD-BRANCH", description: "System configuration" },
  { entity: "ConsentForm", sourceModule: "MOD-DOCUMENTS", description: "Patient consent records" },
  { entity: "Product", sourceModule: "MOD-BILLING", description: "Product inventory" },
  { entity: "Waitlist", sourceModule: "MOD-APPOINTMENT", description: "Appointment waitlist" },
];

// ---- Role Access Matrix ----

export const roleAccessMatrix: RoleModuleAccess[] = [
  {
    role: UserRole.SUPER_ADMIN,
    modules: [], // Super admin has access to everything — handled in canAccess()
  },
  {
    role: UserRole.ADMIN,
    modules: [
      { moduleId: "MOD-DASHBOARD", actions: ["VIEW"] },
      { moduleId: "MOD-PATIENT", actions: ["VIEW", "CREATE", "EDIT", "DELETE", "EXPORT"] },
      { moduleId: "MOD-APPOINTMENT", actions: ["VIEW", "CREATE", "EDIT", "DELETE"] },
      { moduleId: "MOD-CONSULTATION", actions: ["VIEW"] },
      { moduleId: "MOD-MEDICAL-HISTORY", actions: ["VIEW"] },
      { moduleId: "MOD-SKIN-HISTORY", actions: ["VIEW"] },
      { moduleId: "MOD-PROCEDURE", actions: ["VIEW", "CREATE", "EDIT"] },
      { moduleId: "MOD-PRESCRIPTION", actions: ["VIEW"] },
      { moduleId: "MOD-BILLING", actions: ["VIEW", "CREATE", "EDIT", "DELETE", "EXPORT"] },
      { moduleId: "MOD-PAYMENT", actions: ["VIEW", "CREATE", "EXPORT"] },
      { moduleId: "MOD-FOLLOWUP", actions: ["VIEW", "CREATE", "EDIT"] },
      { moduleId: "MOD-COMMUNICATION", actions: ["VIEW", "CREATE", "EDIT"] },
      { moduleId: "MOD-AI-TRANSCRIPTION", actions: ["VIEW"] },
      { moduleId: "MOD-DOCUMENTS", actions: ["VIEW", "CREATE", "DELETE"] },
      { moduleId: "MOD-IMAGES", actions: ["VIEW", "CREATE", "DELETE"] },
      { moduleId: "MOD-ADMIN", actions: ["VIEW", "CREATE", "EDIT", "DELETE"] },
      { moduleId: "MOD-STAFF", actions: ["VIEW", "CREATE", "EDIT", "DELETE"] },
      { moduleId: "MOD-BRANCH", actions: ["VIEW", "CREATE", "EDIT"] },
      { moduleId: "MOD-NOTIFICATIONS", actions: ["VIEW", "EDIT"] },
      { moduleId: "MOD-ROOMS", actions: ["VIEW", "CREATE", "EDIT", "DELETE"] },
    ],
  },
  {
    role: UserRole.DOCTOR,
    modules: [
      { moduleId: "MOD-DASHBOARD", actions: ["VIEW"] },
      { moduleId: "MOD-PATIENT", actions: ["VIEW", "EDIT"] },
      { moduleId: "MOD-APPOINTMENT", actions: ["VIEW", "EDIT"] },
      { moduleId: "MOD-CONSULTATION", actions: ["VIEW", "CREATE", "EDIT"] },
      { moduleId: "MOD-MEDICAL-HISTORY", actions: ["VIEW", "CREATE", "EDIT"] },
      { moduleId: "MOD-SKIN-HISTORY", actions: ["VIEW", "CREATE", "EDIT"] },
      { moduleId: "MOD-PROCEDURE", actions: ["VIEW", "CREATE", "EDIT"] },
      { moduleId: "MOD-PRESCRIPTION", actions: ["VIEW", "CREATE", "EDIT"] },
      { moduleId: "MOD-BILLING", actions: ["VIEW"] },
      { moduleId: "MOD-FOLLOWUP", actions: ["VIEW", "CREATE", "EDIT"] },
      { moduleId: "MOD-AI-TRANSCRIPTION", actions: ["VIEW", "CREATE"] },
      { moduleId: "MOD-DOCUMENTS", actions: ["VIEW", "CREATE"] },
      { moduleId: "MOD-IMAGES", actions: ["VIEW", "CREATE"] },
      { moduleId: "MOD-NOTIFICATIONS", actions: ["VIEW", "EDIT"] },
      { moduleId: "MOD-ROOMS", actions: ["VIEW"] },
    ],
  },
  {
    role: UserRole.RECEPTIONIST,
    modules: [
      { moduleId: "MOD-DASHBOARD", actions: ["VIEW"] },
      { moduleId: "MOD-PATIENT", actions: ["VIEW", "CREATE", "EDIT"] },
      { moduleId: "MOD-APPOINTMENT", actions: ["VIEW", "CREATE", "EDIT"] },
      { moduleId: "MOD-BILLING", actions: ["VIEW"] },
      { moduleId: "MOD-PAYMENT", actions: ["VIEW"] },
      { moduleId: "MOD-FOLLOWUP", actions: ["VIEW", "CREATE"] },
      { moduleId: "MOD-DOCUMENTS", actions: ["VIEW", "CREATE"] },
      { moduleId: "MOD-NOTIFICATIONS", actions: ["VIEW", "EDIT"] },
      { moduleId: "MOD-ROOMS", actions: ["VIEW", "EDIT"] },
    ],
  },
  {
    role: UserRole.BILLING,
    modules: [
      { moduleId: "MOD-DASHBOARD", actions: ["VIEW"] },
      { moduleId: "MOD-PATIENT", actions: ["VIEW"] },
      { moduleId: "MOD-APPOINTMENT", actions: ["VIEW"] },
      { moduleId: "MOD-BILLING", actions: ["VIEW", "CREATE", "EDIT", "DELETE", "EXPORT"] },
      { moduleId: "MOD-PAYMENT", actions: ["VIEW", "CREATE", "EDIT", "EXPORT"] },
      { moduleId: "MOD-NOTIFICATIONS", actions: ["VIEW", "EDIT"] },
    ],
  },
  {
    role: UserRole.CALL_CENTER,
    modules: [
      { moduleId: "MOD-DASHBOARD", actions: ["VIEW"] },
      { moduleId: "MOD-PATIENT", actions: ["VIEW"] },
      { moduleId: "MOD-APPOINTMENT", actions: ["VIEW", "CREATE"] },
      { moduleId: "MOD-COMMUNICATION", actions: ["VIEW", "CREATE", "EDIT"] },
      { moduleId: "MOD-FOLLOWUP", actions: ["VIEW"] },
      { moduleId: "MOD-NOTIFICATIONS", actions: ["VIEW", "EDIT"] },
    ],
  },
  {
    role: UserRole.ASSISTANT,
    modules: [
      { moduleId: "MOD-DASHBOARD", actions: ["VIEW"] },
      { moduleId: "MOD-PATIENT", actions: ["VIEW", "EDIT"] },
      { moduleId: "MOD-APPOINTMENT", actions: ["VIEW", "EDIT"] },
      { moduleId: "MOD-DOCUMENTS", actions: ["VIEW", "CREATE"] },
      { moduleId: "MOD-IMAGES", actions: ["VIEW", "CREATE"] },
      { moduleId: "MOD-PROCEDURE", actions: ["VIEW"] },
      { moduleId: "MOD-NOTIFICATIONS", actions: ["VIEW", "EDIT"] },
      { moduleId: "MOD-ROOMS", actions: ["VIEW", "EDIT"] },
    ],
  },
];
