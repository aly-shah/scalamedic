import type { ModuleDefinition } from "@/modules/core/types";
import { moduleRegistry } from "@/modules/core/registry";
import { UserRole } from "@/types";

const definition: ModuleDefinition = {
  id: "MOD-SKIN-HISTORY",
  name: "Skin History",
  purpose: "Dermatology-specific clinical record tracking skin conditions, Fitzpatrick skin type, affected areas, severity, treatment responses, and before/after progression. Core to this skincare clinic ERP.",
  icon: "Sparkles",
  color: "#F59E0B",

  primaryRoles: [UserRole.DOCTOR],
  permissions: {
    VIEW: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.DOCTOR, UserRole.ASSISTANT],
    CREATE: [UserRole.DOCTOR],
    EDIT: [UserRole.DOCTOR],
    DELETE: [UserRole.SUPER_ADMIN],
    EXPORT: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.DOCTOR],
  },

  sections: [
    { id: "SKINHISTORY-CONDITIONS", label: "Skin Conditions", description: "Active and past skin conditions" },
    { id: "SKINHISTORY-ASSESSMENT", label: "Skin Assessment", description: "Fitzpatrick type, moisture, oiliness" },
    { id: "SKINHISTORY-AREAS", label: "Affected Areas", description: "Body map of affected regions" },
    { id: "SKINHISTORY-PROGRESS", label: "Treatment Progress", description: "Response to treatments over time" },
  ],

  actions: [
    { id: "SKINHISTORY-ADD-CONDITION", label: "Add Condition", permission: "CREATE", emitsEvent: "skin_history.condition_added", description: "Record skin condition" },
    { id: "SKINHISTORY-ASSESS", label: "Complete Assessment", permission: "EDIT", emitsEvent: "skin_history.assessment_completed", description: "Complete skin assessment" },
  ],

  ownedEntities: ["SkinHistory"],
  dataConnections: [
    { moduleId: "MOD-PATIENT", entities: ["Patient"], direction: "IN", description: "Patient skin type" },
    { moduleId: "MOD-CONSULTATION", entities: ["ConsultationNote"], direction: "IN", description: "Skin assessments from consults" },
    { moduleId: "MOD-PROCEDURE", entities: ["Procedure"], direction: "IN", description: "Treatment outcomes" },
    { moduleId: "MOD-IMAGES", entities: ["PatientDocument"], direction: "IN", description: "Before/after images" },
  ],

  emittedEvents: ["skin_history.condition_added", "skin_history.assessment_completed"],
  subscribedEvents: ["consultation.completed", "procedure.completed", "images.before_after_created"],

  workflowPosition: "HISTORY_UPDATE",
  dependencies: ["MOD-PATIENT"],

  isPatientSubmodule: true,
  navOrder: 6,
};

export function register() { moduleRegistry.register(definition); }
