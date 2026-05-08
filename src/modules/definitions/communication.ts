import type { ModuleDefinition } from "@/modules/core/types";
import { moduleRegistry } from "@/modules/core/registry";
import { UserRole } from "@/types";

const definition: ModuleDefinition = {
  id: "MOD-COMMUNICATION",
  name: "Call Center & Communication",
  purpose: "Lead management and multi-channel patient communication. Handles inbound/outbound calls, lead creation, callback scheduling, lead-to-patient conversion, SMS, email, and WhatsApp logs.",
  icon: "Phone",
  color: "#6366F1",

  primaryRoles: [UserRole.CALL_CENTER],
  permissions: {
    VIEW: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.CALL_CENTER, UserRole.RECEPTIONIST],
    CREATE: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.CALL_CENTER],
    EDIT: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.CALL_CENTER],
    DELETE: [UserRole.SUPER_ADMIN, UserRole.ADMIN],
    EXPORT: [UserRole.SUPER_ADMIN, UserRole.ADMIN],
  },

  sections: [
    { id: "COMM-LEADS", label: "Leads", description: "Sales leads pipeline" },
    { id: "COMM-CALLBACKS", label: "Callbacks", description: "Scheduled callback queue" },
    { id: "COMM-CALL-LOG", label: "Call Log", description: "Inbound/outbound call records" },
    { id: "COMM-MESSAGES", label: "Messages", description: "SMS, email, WhatsApp logs" },
    { id: "COMM-PATIENT-COMMS", label: "Patient Communication", description: "Per-patient communication history" },
  ],

  actions: [
    { id: "COMM-CREATE-LEAD", label: "Create Lead", permission: "CREATE", emitsEvent: "communication.lead_created", description: "Register new lead" },
    { id: "COMM-CONVERT-LEAD", label: "Convert to Patient", permission: "EDIT", emitsEvent: "communication.lead_converted", description: "Convert lead to patient" },
    { id: "COMM-LOG-CALL", label: "Log Call", permission: "CREATE", emitsEvent: "communication.call_logged", description: "Record call" },
    { id: "COMM-SCHEDULE-CALLBACK", label: "Schedule Callback", permission: "EDIT", emitsEvent: "communication.callback_scheduled", description: "Schedule callback" },
    { id: "COMM-SEND-MESSAGE", label: "Send Message", permission: "CREATE", emitsEvent: "communication.message_sent", description: "Send SMS/email/WhatsApp" },
  ],

  ownedEntities: ["Lead", "CallLog", "CommunicationLog"],
  dataConnections: [
    { moduleId: "MOD-PATIENT", entities: ["Patient"], direction: "BOTH", description: "Convert leads to patients, patient lookup" },
    { moduleId: "MOD-APPOINTMENT", entities: ["Appointment"], direction: "OUT", description: "Book appointments for leads" },
    { moduleId: "MOD-FOLLOWUP", entities: ["FollowUp"], direction: "IN", description: "Follow-up reminders trigger calls" },
    { moduleId: "MOD-NOTIFICATIONS", entities: ["Notification"], direction: "OUT", description: "Callback reminders" },
  ],

  emittedEvents: [
    "communication.lead_created", "communication.lead_converted", "communication.lead_updated",
    "communication.call_logged", "communication.callback_scheduled", "communication.message_sent",
  ],
  subscribedEvents: ["followup.reminder_sent", "appointment.booked", "patient.created"],

  workflowPosition: "INQUIRY",
  dependencies: [],

  route: "/call-center",
  navLabel: "Call Center",
  navOrder: 12,
  isPatientSubmodule: true,
};

export function register() { moduleRegistry.register(definition); }
