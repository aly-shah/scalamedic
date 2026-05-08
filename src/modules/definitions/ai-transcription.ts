import type { ModuleDefinition } from "@/modules/core/types";
import { moduleRegistry } from "@/modules/core/registry";
import { UserRole } from "@/types";

const definition: ModuleDefinition = {
  id: "MOD-AI-TRANSCRIPTION",
  name: "AI Assistant",
  purpose: "AI-powered consultation transcription and note summarization. Records live consultations, generates structured clinical notes, extracts key points, and feeds structured data back into the Consultation module.",
  icon: "Brain",
  color: "#8B5CF6",

  primaryRoles: [UserRole.DOCTOR],
  permissions: {
    VIEW: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.DOCTOR],
    CREATE: [UserRole.DOCTOR],
    EDIT: [UserRole.DOCTOR],
    DELETE: [UserRole.SUPER_ADMIN],
    EXPORT: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.DOCTOR],
  },

  sections: [
    { id: "AI-TRANSCRIBE", label: "Transcribe", description: "Live consultation transcription" },
    { id: "AI-SUMMARIZE", label: "Summarize", description: "Summarize consultation notes" },
    { id: "AI-HISTORY", label: "Transcription History", description: "Past transcriptions" },
  ],

  actions: [
    { id: "AI-START-TRANSCRIPTION", label: "Start Recording", permission: "CREATE", emitsEvent: "ai.transcription_started", description: "Begin live transcription" },
    { id: "AI-COMPLETE-TRANSCRIPTION", label: "Stop & Process", permission: "EDIT", emitsEvent: "ai.transcription_completed", description: "Stop and process transcription" },
    { id: "AI-GENERATE-SUMMARY", label: "Generate Summary", permission: "CREATE", emitsEvent: "ai.summary_generated", description: "Summarize notes with AI" },
  ],

  ownedEntities: ["AITranscription"],
  dataConnections: [
    { moduleId: "MOD-CONSULTATION", entities: ["ConsultationNote"], direction: "BOTH", description: "Sends structured notes, receives text to summarize" },
    { moduleId: "MOD-APPOINTMENT", entities: ["Appointment"], direction: "IN", description: "Appointment context" },
    { moduleId: "MOD-PATIENT", entities: ["Patient"], direction: "IN", description: "Patient context" },
  ],

  emittedEvents: ["ai.transcription_started", "ai.transcription_completed", "ai.transcription_failed", "ai.summary_generated"],
  subscribedEvents: ["consultation.started", "appointment.started"],

  workflowPosition: "CONSULTATION",
  dependencies: ["MOD-CONSULTATION"],

  route: "/ai",
  navLabel: "AI Assistant",
  navOrder: 13,
  isPatientSubmodule: true,
};

export function register() { moduleRegistry.register(definition); }
