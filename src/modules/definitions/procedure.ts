import type { ModuleDefinition } from "@/modules/core/types";
import { moduleRegistry } from "@/modules/core/registry";
import { UserRole } from "@/types";

const definition: ModuleDefinition = {
  id: "MOD-PROCEDURE",
  name: "Procedures & Treatments",
  purpose: "Manages the treatment catalog and execution of clinical procedures. Tracks areas treated, device settings, before/after images, outcomes, complications, and consent. Sends charges to billing.",
  icon: "FlaskConical",
  color: "#06B6D4",

  primaryRoles: [UserRole.DOCTOR, UserRole.ADMIN, UserRole.AESTHETICIAN],
  permissions: {
    VIEW: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.DOCTOR, UserRole.ASSISTANT, UserRole.AESTHETICIAN, UserRole.OPERATOR],
    CREATE: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.DOCTOR, UserRole.AESTHETICIAN],
    EDIT: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.DOCTOR, UserRole.AESTHETICIAN],
    DELETE: [UserRole.SUPER_ADMIN, UserRole.ADMIN],
    EXPORT: [UserRole.SUPER_ADMIN, UserRole.ADMIN],
  },

  sections: [
    { id: "PROCEDURE-CATALOG", label: "Treatment Catalog", description: "Master list of available treatments" },
    { id: "PROCEDURE-EXECUTION", label: "Procedure Execution", description: "Active procedure form with settings and images" },
    { id: "PROCEDURE-HISTORY", label: "Patient Procedures", description: "Past procedures for a patient" },
    { id: "PROCEDURE-CONSENT", label: "Consent", description: "Consent verification before treatment" },
  ],

  actions: [
    { id: "PROCEDURE-CREATE-TREATMENT", label: "Add Treatment", permission: "CREATE", description: "Add to treatment catalog" },
    { id: "PROCEDURE-START", label: "Start Procedure", permission: "CREATE", emitsEvent: "procedure.started", description: "Begin procedure execution" },
    { id: "PROCEDURE-COMPLETE", label: "Complete Procedure", permission: "EDIT", emitsEvent: "procedure.completed", description: "Finalize procedure with outcome" },
    { id: "PROCEDURE-UPLOAD-IMAGES", label: "Upload Images", permission: "EDIT", emitsEvent: "procedure.images_uploaded", description: "Add before/after images" },
  ],

  ownedEntities: ["Treatment", "Procedure"],
  dataConnections: [
    { moduleId: "MOD-CONSULTATION", entities: ["ConsultationNote"], direction: "IN", description: "Treatment plan from consultation" },
    { moduleId: "MOD-PATIENT", entities: ["Patient"], direction: "IN", description: "Patient context" },
    { moduleId: "MOD-APPOINTMENT", entities: ["Appointment"], direction: "IN", description: "Appointment context" },
    { moduleId: "MOD-BILLING", entities: ["Invoice"], direction: "OUT", description: "Procedure charges to billing" },
    { moduleId: "MOD-IMAGES", entities: ["PatientDocument"], direction: "OUT", description: "Before/after images" },
    { moduleId: "MOD-SKIN-HISTORY", entities: ["SkinHistory"], direction: "OUT", description: "Updates skin treatment history" },
    { moduleId: "MOD-DOCUMENTS", entities: ["ConsentForm"], direction: "IN", description: "Consent forms" },
  ],

  emittedEvents: ["procedure.scheduled", "procedure.started", "procedure.completed", "procedure.images_uploaded"],
  subscribedEvents: ["consultation.completed", "documents.consent_signed", "appointment.started"],

  workflowPosition: "TREATMENT",
  dependencies: ["MOD-CONSULTATION", "MOD-PATIENT"],

  route: "/admin/treatments",
  navLabel: "Treatments",
  navOrder: 10,
  isPatientSubmodule: true,
};

export function register() { moduleRegistry.register(definition); }
