import type { ModuleDefinition } from "@/modules/core/types";
import { moduleRegistry } from "@/modules/core/registry";
import { UserRole } from "@/types";

const definition: ModuleDefinition = {
  id: "MOD-CONSULTATION",
  name: "Consultation",
  purpose: "Doctor's clinical workspace for patient visits. Captures chief complaint, symptoms, examination, skin assessment, diagnosis, treatment plan, and clinical advice. Serves as the bridge between appointment check-in and treatment/billing.",
  icon: "Stethoscope",
  color: "#059669",

  primaryRoles: [UserRole.DOCTOR],
  permissions: {
    VIEW: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.DOCTOR],
    CREATE: [UserRole.DOCTOR],
    EDIT: [UserRole.DOCTOR],
    DELETE: [UserRole.SUPER_ADMIN],
    EXPORT: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.DOCTOR],
  },

  sections: [
    { id: "CONSULTATION-WORKSPACE", label: "Consultation Workspace", description: "Main clinical form with patient context" },
    { id: "CONSULTATION-NOTES", label: "Notes", description: "Chief complaint, symptoms, examination" },
    { id: "CONSULTATION-DIAGNOSIS", label: "Diagnosis", description: "Diagnosis and differential" },
    { id: "CONSULTATION-PLAN", label: "Treatment Plan", description: "Treatment plan and advice" },
    { id: "CONSULTATION-HISTORY", label: "Past Notes", description: "Previous consultation history" },
  ],

  actions: [
    { id: "CONSULTATION-START", label: "Start Consultation", permission: "CREATE", emitsEvent: "consultation.started", description: "Begin consultation for appointment" },
    { id: "CONSULTATION-SAVE-NOTE", label: "Save Note", permission: "EDIT", emitsEvent: "consultation.note_saved", description: "Save consultation note" },
    { id: "CONSULTATION-COMPLETE", label: "Complete", permission: "EDIT", emitsEvent: "consultation.completed", description: "Finalize consultation" },
    { id: "CONSULTATION-ADD-DIAGNOSIS", label: "Add Diagnosis", permission: "CREATE", emitsEvent: "consultation.diagnosis_added", description: "Record diagnosis" },
    { id: "CONSULTATION-ORDER-LAB", label: "Order Lab Test", permission: "CREATE", emitsEvent: "lab.test_ordered", description: "Order lab test during consultation" },
  ],

  ownedEntities: ["ConsultationNote", "LabTest"],
  dataConnections: [
    { moduleId: "MOD-APPOINTMENT", entities: ["Appointment", "Triage"], direction: "IN", description: "Visit context and vitals" },
    { moduleId: "MOD-PATIENT", entities: ["Patient"], direction: "IN", description: "Patient demographics and allergies" },
    { moduleId: "MOD-MEDICAL-HISTORY", entities: ["MedicalHistory", "PatientAllergy"], direction: "BOTH", description: "Read history, write new diagnoses" },
    { moduleId: "MOD-SKIN-HISTORY", entities: ["SkinHistory"], direction: "BOTH", description: "Read/update skin conditions" },
    { moduleId: "MOD-PRESCRIPTION", entities: ["Prescription"], direction: "OUT", description: "Generate prescriptions from plan" },
    { moduleId: "MOD-PROCEDURE", entities: ["Procedure"], direction: "OUT", description: "Schedule procedures from plan" },
    { moduleId: "MOD-FOLLOWUP", entities: ["FollowUp"], direction: "OUT", description: "Schedule follow-up from consultation" },
    { moduleId: "MOD-AI-TRANSCRIPTION", entities: ["AITranscription"], direction: "BOTH", description: "Receive AI transcripts, send notes for summarization" },
    { moduleId: "MOD-BILLING", entities: ["Invoice"], direction: "OUT", description: "Consultation fee to billing" },
  ],

  emittedEvents: [
    "consultation.started", "consultation.note_saved", "consultation.completed",
    "consultation.diagnosis_added", "lab.test_ordered",
  ],
  subscribedEvents: [
    "appointment.started", "ai.transcription_completed", "lab.results_ready",
  ],

  workflowPosition: "CONSULTATION",
  dependencies: ["MOD-APPOINTMENT", "MOD-PATIENT"],

  route: "/consultation",
  navLabel: "Consultation",
  navOrder: 4,
  isPatientSubmodule: true,
};

export function register() { moduleRegistry.register(definition); }
