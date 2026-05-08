import type { ModuleDefinition } from "@/modules/core/types";
import { moduleRegistry } from "@/modules/core/registry";
import { UserRole } from "@/types";

const definition: ModuleDefinition = {
  id: "MOD-IMAGES",
  name: "Clinical Images",
  purpose: "Before/after photo management for dermatology treatments. Captures clinical images, organizes by treatment date, enables side-by-side comparison, and feeds into skin history for treatment progress tracking.",
  icon: "Camera",
  color: "#EC4899",

  primaryRoles: [UserRole.DOCTOR, UserRole.ASSISTANT],
  permissions: {
    VIEW: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.DOCTOR, UserRole.ASSISTANT],
    CREATE: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.DOCTOR, UserRole.ASSISTANT],
    EDIT: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.DOCTOR],
    DELETE: [UserRole.SUPER_ADMIN, UserRole.ADMIN],
    EXPORT: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.DOCTOR],
  },

  sections: [
    { id: "IMAGES-GALLERY", label: "Photo Gallery", description: "All clinical images" },
    { id: "IMAGES-COMPARE", label: "Before/After", description: "Side-by-side comparison" },
    { id: "IMAGES-UPLOAD", label: "Capture", description: "Upload or capture new images" },
  ],

  actions: [
    { id: "IMAGES-UPLOAD-ACTION", label: "Upload Image", permission: "CREATE", emitsEvent: "images.uploaded", description: "Upload clinical image" },
    { id: "IMAGES-CREATE-COMPARISON", label: "Create Comparison", permission: "CREATE", emitsEvent: "images.before_after_created", description: "Create before/after set" },
  ],

  ownedEntities: [],
  dataConnections: [
    { moduleId: "MOD-PATIENT", entities: ["Patient"], direction: "IN", description: "Patient context" },
    { moduleId: "MOD-PROCEDURE", entities: ["Procedure"], direction: "IN", description: "Procedure before/after images" },
    { moduleId: "MOD-SKIN-HISTORY", entities: ["SkinHistory"], direction: "OUT", description: "Progress images for skin history" },
    { moduleId: "MOD-DOCUMENTS", entities: ["PatientDocument"], direction: "OUT", description: "Stored as patient documents" },
  ],

  emittedEvents: ["images.uploaded", "images.before_after_created"],
  subscribedEvents: ["procedure.completed", "procedure.images_uploaded"],

  workflowPosition: "CONTINUOUS",
  dependencies: ["MOD-PATIENT"],

  isPatientSubmodule: true,
  navOrder: 15,
};

export function register() { moduleRegistry.register(definition); }
