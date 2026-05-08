import type { ModuleDefinition } from "@/modules/core/types";
import { moduleRegistry } from "@/modules/core/registry";
import { UserRole } from "@/types";

const definition: ModuleDefinition = {
  id: "MOD-PRESCRIPTION",
  name: "Prescriptions",
  purpose: "Manages medication orders created during consultations. Tracks medicine name, dosage, frequency, duration, route, and instructions. Updates the patient's active medication list in Medical History.",
  icon: "Pill",
  color: "#10B981",

  primaryRoles: [UserRole.DOCTOR],
  permissions: {
    VIEW: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.DOCTOR, UserRole.ASSISTANT],
    CREATE: [UserRole.DOCTOR],
    EDIT: [UserRole.DOCTOR],
    DELETE: [UserRole.SUPER_ADMIN],
    EXPORT: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.DOCTOR],
  },

  sections: [
    { id: "PRESCRIPTION-LIST", label: "Prescriptions", description: "Patient prescription history" },
    { id: "PRESCRIPTION-CREATE", label: "New Prescription", description: "Create prescription with items" },
    { id: "PRESCRIPTION-DETAIL", label: "Prescription Detail", description: "View prescription items and instructions" },
  ],

  actions: [
    { id: "PRESCRIPTION-CREATE-ACTION", label: "Create Prescription", permission: "CREATE", emitsEvent: "prescription.created", description: "Write new prescription" },
    { id: "PRESCRIPTION-UPDATE-ACTION", label: "Update Prescription", permission: "EDIT", emitsEvent: "prescription.updated", description: "Modify prescription" },
  ],

  ownedEntities: ["Prescription", "PrescriptionItem"],
  dataConnections: [
    { moduleId: "MOD-CONSULTATION", entities: ["ConsultationNote"], direction: "IN", description: "Prescription from treatment plan" },
    { moduleId: "MOD-PATIENT", entities: ["Patient"], direction: "IN", description: "Patient allergies for safety checks" },
    { moduleId: "MOD-MEDICAL-HISTORY", entities: ["PatientMedication", "PatientAllergy"], direction: "BOTH", description: "Updates active medications, reads allergies" },
    { moduleId: "MOD-BILLING", entities: ["Invoice"], direction: "OUT", description: "Medication charges" },
  ],

  emittedEvents: ["prescription.created", "prescription.updated"],
  subscribedEvents: ["consultation.completed"],

  workflowPosition: "PRESCRIPTION",
  dependencies: ["MOD-CONSULTATION", "MOD-PATIENT"],

  isPatientSubmodule: true,
  navOrder: 7,
};

export function register() { moduleRegistry.register(definition); }
