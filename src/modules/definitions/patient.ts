import type { ModuleDefinition } from "@/modules/core/types";
import { moduleRegistry } from "@/modules/core/registry";
import { UserRole } from "@/types";

const definition: ModuleDefinition = {
  id: "MOD-PATIENT",
  name: "Patients",
  purpose: "Central patient management hub. Handles registration, demographics, insurance, contact info, and serves as the unified workspace that pulls data from all other clinical modules via the patient profile.",
  icon: "Users",
  color: "#3B82F6",

  primaryRoles: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.DOCTOR, UserRole.RECEPTIONIST, UserRole.ASSISTANT, UserRole.AESTHETICIAN],
  permissions: {
    VIEW: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.DOCTOR, UserRole.RECEPTIONIST, UserRole.BILLING, UserRole.CALL_CENTER, UserRole.ASSISTANT, UserRole.AESTHETICIAN, UserRole.OPERATOR],
    CREATE: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.RECEPTIONIST],
    EDIT: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.DOCTOR, UserRole.RECEPTIONIST, UserRole.ASSISTANT, UserRole.AESTHETICIAN],
    DELETE: [UserRole.SUPER_ADMIN, UserRole.ADMIN],
    EXPORT: [UserRole.SUPER_ADMIN, UserRole.ADMIN],
  },

  sections: [
    { id: "PATIENT-LIST", label: "Patient List", description: "Searchable, filterable patient directory" },
    { id: "PATIENT-REGISTRATION", label: "Registration", description: "New patient intake form" },
    { id: "PATIENT-PROFILE", label: "Patient Profile", description: "Unified workspace pulling from all modules" },
    { id: "PATIENT-OVERVIEW", label: "Overview", description: "Quick summary: vitals, next appointment, balance, allergies" },
    { id: "PATIENT-INSURANCE", label: "Insurance", description: "Insurance policies and coverage" },
    { id: "PATIENT-TAGS", label: "Tags", description: "Patient labels and categories" },
  ],

  actions: [
    { id: "PATIENT-CREATE", label: "Register Patient", permission: "CREATE", emitsEvent: "patient.created", description: "Register new patient" },
    { id: "PATIENT-EDIT", label: "Edit Patient", permission: "EDIT", emitsEvent: "patient.updated", description: "Update patient details" },
    { id: "PATIENT-DEACTIVATE", label: "Deactivate Patient", permission: "DELETE", emitsEvent: "patient.deactivated", description: "Soft-delete patient" },
    { id: "PATIENT-EXPORT", label: "Export Patients", permission: "EXPORT", description: "Export patient list" },
  ],

  ownedEntities: ["Patient", "Insurance", "PatientTag"],
  dataConnections: [
    { moduleId: "MOD-APPOINTMENT", entities: ["Appointment"], direction: "BOTH", description: "Patient appointments" },
    { moduleId: "MOD-CONSULTATION", entities: ["ConsultationNote"], direction: "IN", description: "Consultation history for profile" },
    { moduleId: "MOD-MEDICAL-HISTORY", entities: ["MedicalHistory", "PatientAllergy"], direction: "IN", description: "Medical records for profile" },
    { moduleId: "MOD-SKIN-HISTORY", entities: ["SkinHistory"], direction: "IN", description: "Skin conditions for profile" },
    { moduleId: "MOD-PROCEDURE", entities: ["Procedure"], direction: "IN", description: "Treatment history" },
    { moduleId: "MOD-PRESCRIPTION", entities: ["Prescription"], direction: "IN", description: "Active medications" },
    { moduleId: "MOD-BILLING", entities: ["Invoice"], direction: "IN", description: "Outstanding balance" },
    { moduleId: "MOD-DOCUMENTS", entities: ["PatientDocument"], direction: "IN", description: "Patient files" },
    { moduleId: "MOD-IMAGES", entities: ["PatientDocument"], direction: "IN", description: "Clinical images" },
    { moduleId: "MOD-FOLLOWUP", entities: ["FollowUp"], direction: "IN", description: "Upcoming follow-ups" },
    { moduleId: "MOD-COMMUNICATION", entities: ["CommunicationLog", "Lead"], direction: "IN", description: "Communication history, lead conversion" },
    { moduleId: "MOD-AI-TRANSCRIPTION", entities: ["AITranscription"], direction: "IN", description: "AI transcripts" },
  ],

  emittedEvents: ["patient.created", "patient.updated", "patient.deactivated"],
  subscribedEvents: [
    "appointment.booked", "consultation.completed", "billing.invoice_created",
    "payment.received", "followup.scheduled", "communication.lead_converted",
  ],

  workflowPosition: "REGISTRATION",
  dependencies: [],

  route: "/patients",
  navLabel: "Patients",
  navOrder: 2,
};

export function register() { moduleRegistry.register(definition); }
