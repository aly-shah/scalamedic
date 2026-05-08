import type { ModuleDefinition } from "@/modules/core/types";
import { moduleRegistry } from "@/modules/core/registry";
import { UserRole } from "@/types";

const definition: ModuleDefinition = {
  id: "MOD-FOLLOWUP",
  name: "Follow-Ups",
  purpose: "Manages post-visit follow-up scheduling and tracking. Created from consultations, procedures, or manually. Tracks due dates, completion status, and generates reminders. Links back to appointments for rebooking.",
  icon: "CalendarClock",
  color: "#A855F7",

  primaryRoles: [UserRole.DOCTOR, UserRole.RECEPTIONIST],
  permissions: {
    VIEW: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.DOCTOR, UserRole.RECEPTIONIST, UserRole.CALL_CENTER, UserRole.ASSISTANT],
    CREATE: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.DOCTOR, UserRole.RECEPTIONIST],
    EDIT: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.DOCTOR, UserRole.RECEPTIONIST],
    DELETE: [UserRole.SUPER_ADMIN, UserRole.ADMIN],
    EXPORT: [UserRole.SUPER_ADMIN, UserRole.ADMIN],
  },

  sections: [
    { id: "FOLLOWUP-DUE-TODAY", label: "Due Today", description: "Follow-ups due today" },
    { id: "FOLLOWUP-OVERDUE", label: "Overdue", description: "Missed follow-ups" },
    { id: "FOLLOWUP-UPCOMING", label: "Upcoming", description: "Scheduled follow-ups" },
    { id: "FOLLOWUP-COMPLETED", label: "Completed", description: "Past completed follow-ups" },
  ],

  actions: [
    { id: "FOLLOWUP-SCHEDULE", label: "Schedule Follow-Up", permission: "CREATE", emitsEvent: "followup.scheduled", description: "Create follow-up" },
    { id: "FOLLOWUP-COMPLETE", label: "Mark Complete", permission: "EDIT", emitsEvent: "followup.completed", description: "Complete follow-up" },
    { id: "FOLLOWUP-REBOOK", label: "Rebook as Appointment", permission: "EDIT", description: "Convert follow-up to appointment" },
    { id: "FOLLOWUP-SEND-REMINDER", label: "Send Reminder", permission: "EDIT", emitsEvent: "followup.reminder_sent", description: "Send reminder to patient" },
  ],

  ownedEntities: ["FollowUp"],
  dataConnections: [
    { moduleId: "MOD-CONSULTATION", entities: ["ConsultationNote"], direction: "IN", description: "Follow-up from consultation" },
    { moduleId: "MOD-APPOINTMENT", entities: ["Appointment"], direction: "BOTH", description: "Linked appointment, rebook" },
    { moduleId: "MOD-PATIENT", entities: ["Patient"], direction: "IN", description: "Patient contact for reminders" },
    { moduleId: "MOD-NOTIFICATIONS", entities: ["Notification"], direction: "OUT", description: "Reminder notifications" },
    { moduleId: "MOD-COMMUNICATION", entities: ["CommunicationLog"], direction: "OUT", description: "Follow-up calls/messages" },
  ],

  emittedEvents: ["followup.scheduled", "followup.completed", "followup.missed", "followup.reminder_sent"],
  subscribedEvents: ["consultation.completed", "procedure.completed", "appointment.completed"],

  workflowPosition: "FOLLOW_UP",
  dependencies: ["MOD-PATIENT"],

  route: "/follow-ups",
  navLabel: "Follow-Ups",
  navOrder: 11,
  isPatientSubmodule: true,
};

export function register() { moduleRegistry.register(definition); }
