import type { ModuleDefinition } from "@/modules/core/types";
import { moduleRegistry } from "@/modules/core/registry";
import { UserRole } from "@/types";

const definition: ModuleDefinition = {
  id: "MOD-DOCUMENTS",
  name: "Documents & Reports",
  purpose: "Centralized document management for patient files. Stores reports, lab results, consent forms, prescriptions, and other clinical documents. Handles consent tracking with digital signatures.",
  icon: "FileText",
  color: "#64748B",

  primaryRoles: [UserRole.ADMIN, UserRole.DOCTOR],
  permissions: {
    VIEW: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.DOCTOR, UserRole.RECEPTIONIST, UserRole.ASSISTANT],
    CREATE: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.DOCTOR, UserRole.RECEPTIONIST, UserRole.ASSISTANT],
    EDIT: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.DOCTOR],
    DELETE: [UserRole.SUPER_ADMIN, UserRole.ADMIN],
    EXPORT: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.DOCTOR],
  },

  sections: [
    { id: "DOCS-LIST", label: "Documents", description: "All patient documents" },
    { id: "DOCS-UPLOAD", label: "Upload", description: "Upload new document" },
    { id: "DOCS-CONSENT", label: "Consent Forms", description: "Digital consent management" },
  ],

  actions: [
    { id: "DOCS-UPLOAD-ACTION", label: "Upload Document", permission: "CREATE", emitsEvent: "documents.uploaded", description: "Upload file" },
    { id: "DOCS-DELETE-ACTION", label: "Delete Document", permission: "DELETE", emitsEvent: "documents.deleted", description: "Remove document" },
    { id: "DOCS-SIGN-CONSENT", label: "Sign Consent", permission: "EDIT", emitsEvent: "documents.consent_signed", description: "Record consent signature" },
  ],

  ownedEntities: ["PatientDocument", "ConsentForm"],
  dataConnections: [
    { moduleId: "MOD-PATIENT", entities: ["Patient"], direction: "IN", description: "Patient context" },
    { moduleId: "MOD-PROCEDURE", entities: ["Procedure"], direction: "IN", description: "Consent for procedures" },
    { moduleId: "MOD-CONSULTATION", entities: ["ConsultationNote"], direction: "IN", description: "Clinical reports" },
  ],

  emittedEvents: ["documents.uploaded", "documents.deleted", "documents.consent_signed"],
  subscribedEvents: ["procedure.scheduled", "consultation.completed", "lab.results_ready"],

  workflowPosition: "CONTINUOUS",
  dependencies: ["MOD-PATIENT"],

  isPatientSubmodule: true,
  navOrder: 14,
};

export function register() { moduleRegistry.register(definition); }
