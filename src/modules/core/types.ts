// ============================================================
// MediCore ERP — Module System Type Definitions
// ============================================================

import { UserRole } from "@/types";

// ---- Module IDs ----

export type ModuleId =
  | "MOD-DASHBOARD"
  | "MOD-PATIENT"
  | "MOD-APPOINTMENT"
  | "MOD-CONSULTATION"
  | "MOD-MEDICAL-HISTORY"
  | "MOD-SKIN-HISTORY"
  | "MOD-PROCEDURE"
  | "MOD-PRESCRIPTION"
  | "MOD-BILLING"
  | "MOD-PAYMENT"
  | "MOD-FOLLOWUP"
  | "MOD-COMMUNICATION"
  | "MOD-AI-TRANSCRIPTION"
  | "MOD-DOCUMENTS"
  | "MOD-IMAGES"
  | "MOD-ADMIN"
  | "MOD-STAFF"
  | "MOD-BRANCH"
  | "MOD-NOTIFICATIONS"
  | "MOD-ROOMS";

// ---- Permission Actions ----

export type PermissionAction = "VIEW" | "CREATE" | "EDIT" | "DELETE" | "EXPORT";

// ---- Workflow Stage ----

export type WorkflowPosition =
  | "INQUIRY"
  | "REGISTRATION"
  | "BOOKING"
  | "CHECK_IN"
  | "WAITING"
  | "CONSULTATION"
  | "DIAGNOSIS"
  | "TREATMENT"
  | "PRESCRIPTION"
  | "BILLING"
  | "PAYMENT"
  | "CHECKOUT"
  | "FOLLOW_UP"
  | "HISTORY_UPDATE"
  | "SYSTEM"       // for non-journey modules (admin, notifications)
  | "CONTINUOUS";   // for modules active throughout (communication, documents)

// ---- Module Section ----

export interface ModuleSection {
  id: string;
  label: string;
  description: string;
  icon?: string;
}

// ---- Module Action ----

export interface ModuleAction {
  id: string;
  label: string;
  permission: PermissionAction;
  emitsEvent?: string;
  description: string;
}

// ---- Data Dependency ----

export interface DataConnection {
  moduleId: ModuleId;
  entities: string[];
  direction: "IN" | "OUT" | "BOTH";
  description: string;
}

// ---- Module Definition ----

export interface ModuleDefinition {
  id: ModuleId;
  name: string;
  purpose: string;
  icon: string;
  color: string;

  // Access
  primaryRoles: UserRole[];
  permissions: Record<PermissionAction, UserRole[]>;

  // Structure
  sections: ModuleSection[];
  actions: ModuleAction[];

  // Data Ownership
  ownedEntities: string[];
  dataConnections: DataConnection[];

  // Events
  emittedEvents: string[];
  subscribedEvents: string[];

  // Workflow
  workflowPosition: WorkflowPosition;
  dependencies: ModuleId[];

  // Navigation
  route?: string;
  navLabel?: string;
  navOrder?: number;
  isPatientSubmodule?: boolean;
}

// ---- Module Events ----

export interface ModuleEvent<T = Record<string, unknown>> {
  type: string;
  sourceModule: ModuleId;
  payload: T;
  timestamp: number;
  entityId?: string;
  patientId?: string;
  appointmentId?: string;
}

// ---- Event Handler ----

export type EventHandler<T = Record<string, unknown>> = (event: ModuleEvent<T>) => void;

// ---- Event Subscription ----

export interface EventSubscription {
  id: string;
  eventType: string;
  moduleId: ModuleId;
  handler: EventHandler;
}

// ---- Source of Truth Map ----

export interface EntityOwnership {
  entity: string;
  sourceModule: ModuleId;
  description: string;
}

// ---- Role Module Access ----

export interface RoleModuleAccess {
  role: UserRole;
  modules: {
    moduleId: ModuleId;
    actions: PermissionAction[];
  }[];
}
