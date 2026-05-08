import type { ModuleDefinition } from "@/modules/core/types";
import { moduleRegistry } from "@/modules/core/registry";
import { UserRole } from "@/types";

const definition: ModuleDefinition = {
  id: "MOD-MEDICAL-HISTORY",
  name: "Medical History",
  purpose: "Longitudinal record of patient medical conditions, allergies, chronic diseases, and diagnosis history. Updated by consultations and serves as clinical context for all future visits.",
  icon: "HeartPulse",
  color: "#EF4444",

  primaryRoles: [UserRole.DOCTOR],
  permissions: {
    VIEW: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.DOCTOR, UserRole.ASSISTANT],
    CREATE: [UserRole.DOCTOR],
    EDIT: [UserRole.DOCTOR],
    DELETE: [UserRole.SUPER_ADMIN],
    EXPORT: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.DOCTOR],
  },

  sections: [
    { id: "MEDHISTORY-CONDITIONS", label: "Conditions", description: "Active, resolved, and chronic conditions" },
    { id: "MEDHISTORY-ALLERGIES", label: "Allergies", description: "Allergens, severity, reactions" },
    { id: "MEDHISTORY-MEDICATIONS", label: "Current Medications", description: "Active medication list" },
    { id: "MEDHISTORY-TIMELINE", label: "Timeline", description: "Chronological medical events" },
  ],

  actions: [
    { id: "MEDHISTORY-ADD-CONDITION", label: "Add Condition", permission: "CREATE", emitsEvent: "medical_history.condition_added", description: "Record new condition" },
    { id: "MEDHISTORY-ADD-ALLERGY", label: "Add Allergy", permission: "CREATE", emitsEvent: "medical_history.allergy_added", description: "Record new allergy" },
    { id: "MEDHISTORY-UPDATE", label: "Update Record", permission: "EDIT", emitsEvent: "medical_history.updated", description: "Update existing record" },
  ],

  ownedEntities: ["MedicalHistory", "PatientAllergy", "PatientMedication"],
  dataConnections: [
    { moduleId: "MOD-PATIENT", entities: ["Patient"], direction: "IN", description: "Patient context" },
    { moduleId: "MOD-CONSULTATION", entities: ["ConsultationNote"], direction: "IN", description: "Diagnoses from consultations" },
    { moduleId: "MOD-PRESCRIPTION", entities: ["Prescription"], direction: "IN", description: "Medications from prescriptions" },
  ],

  emittedEvents: ["medical_history.updated", "medical_history.allergy_added", "medical_history.condition_added"],
  subscribedEvents: ["consultation.diagnosis_added", "prescription.created"],

  workflowPosition: "HISTORY_UPDATE",
  dependencies: ["MOD-PATIENT"],

  isPatientSubmodule: true,
  navOrder: 5,
};

export function register() { moduleRegistry.register(definition); }
