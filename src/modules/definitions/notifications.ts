import type { ModuleDefinition } from "@/modules/core/types";
import { moduleRegistry } from "@/modules/core/registry";
import { UserRole } from "@/types";

const definition: ModuleDefinition = {
  id: "MOD-NOTIFICATIONS",
  name: "Notifications & Reminders",
  purpose: "Cross-module notification hub. Listens to events from appointments, follow-ups, billing, labs, and communication modules. Generates user-targeted notifications and patient reminders. Delivers via in-app alerts.",
  icon: "Bell",
  color: "#F59E0B",

  primaryRoles: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.DOCTOR, UserRole.RECEPTIONIST, UserRole.BILLING, UserRole.CALL_CENTER, UserRole.ASSISTANT],
  permissions: {
    VIEW: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.DOCTOR, UserRole.RECEPTIONIST, UserRole.BILLING, UserRole.CALL_CENTER, UserRole.ASSISTANT],
    CREATE: [UserRole.SUPER_ADMIN, UserRole.ADMIN],
    EDIT: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.DOCTOR, UserRole.RECEPTIONIST, UserRole.BILLING, UserRole.CALL_CENTER, UserRole.ASSISTANT],
    DELETE: [UserRole.SUPER_ADMIN, UserRole.ADMIN],
    EXPORT: [],
  },

  sections: [
    { id: "NOTIF-ALL", label: "All Notifications", description: "Full notification list" },
    { id: "NOTIF-UNREAD", label: "Unread", description: "Unread notifications" },
    { id: "NOTIF-SETTINGS", label: "Preferences", description: "Notification preferences" },
  ],

  actions: [
    { id: "NOTIF-MARK-READ", label: "Mark as Read", permission: "EDIT", emitsEvent: "notification.read", description: "Mark notification read" },
    { id: "NOTIF-MARK-ALL-READ", label: "Mark All Read", permission: "EDIT", description: "Clear all unread" },
  ],

  ownedEntities: ["Notification"],
  dataConnections: [
    { moduleId: "MOD-APPOINTMENT", entities: ["Appointment"], direction: "IN", description: "Appointment reminders" },
    { moduleId: "MOD-FOLLOWUP", entities: ["FollowUp"], direction: "IN", description: "Follow-up reminders" },
    { moduleId: "MOD-BILLING", entities: ["Invoice"], direction: "IN", description: "Payment due alerts" },
    { moduleId: "MOD-COMMUNICATION", entities: ["Lead"], direction: "IN", description: "Callback reminders" },
  ],

  emittedEvents: ["notification.created", "notification.read"],
  subscribedEvents: [
    "appointment.booked", "appointment.checked_in", "appointment.cancelled",
    "followup.scheduled", "followup.missed", "followup.reminder_sent",
    "billing.invoice_created", "billing.invoice_overdue",
    "payment.received", "payment.failed",
    "lab.results_ready", "communication.callback_scheduled",
    "admin.user_created", "admin.permission_changed",
  ],

  workflowPosition: "SYSTEM",
  dependencies: [],

  navOrder: 19,
};

export function register() { moduleRegistry.register(definition); }
