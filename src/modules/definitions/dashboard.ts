import type { ModuleDefinition } from "@/modules/core/types";
import { moduleRegistry } from "@/modules/core/registry";
import { UserRole } from "@/types";

const definition: ModuleDefinition = {
  id: "MOD-DASHBOARD",
  name: "Dashboard",
  purpose: "Role-specific command center showing key metrics, today's schedule, quick actions, and real-time activity feed. Each role sees a tailored view of the most relevant information.",
  icon: "LayoutDashboard",
  color: "#0D9488",

  primaryRoles: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.DOCTOR, UserRole.RECEPTIONIST, UserRole.BILLING, UserRole.CALL_CENTER, UserRole.ASSISTANT, UserRole.AESTHETICIAN, UserRole.OPERATOR],
  permissions: {
    VIEW: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.DOCTOR, UserRole.RECEPTIONIST, UserRole.BILLING, UserRole.CALL_CENTER, UserRole.ASSISTANT, UserRole.AESTHETICIAN, UserRole.OPERATOR],
    CREATE: [],
    EDIT: [],
    DELETE: [],
    EXPORT: [UserRole.SUPER_ADMIN, UserRole.ADMIN],
  },

  sections: [
    { id: "DASHBOARD-STATS", label: "Key Metrics", description: "Role-specific KPI cards" },
    { id: "DASHBOARD-SCHEDULE", label: "Today's Schedule", description: "Appointments and tasks for today" },
    { id: "DASHBOARD-ACTIONS", label: "Quick Actions", description: "Shortcuts to frequent operations" },
    { id: "DASHBOARD-ACTIVITY", label: "Activity Feed", description: "Real-time system activity" },
    { id: "DASHBOARD-ALERTS", label: "Alerts", description: "Outstanding items needing attention" },
  ],

  actions: [
    { id: "DASHBOARD-REFRESH", label: "Refresh", permission: "VIEW", description: "Refresh dashboard data" },
    { id: "DASHBOARD-EXPORT", label: "Export Report", permission: "EXPORT", description: "Export daily summary" },
  ],

  ownedEntities: [],
  dataConnections: [
    { moduleId: "MOD-APPOINTMENT", entities: ["Appointment"], direction: "IN", description: "Today's appointments for schedule view" },
    { moduleId: "MOD-PATIENT", entities: ["Patient"], direction: "IN", description: "Patient counts and recent registrations" },
    { moduleId: "MOD-BILLING", entities: ["Invoice"], direction: "IN", description: "Revenue metrics and pending bills" },
    { moduleId: "MOD-FOLLOWUP", entities: ["FollowUp"], direction: "IN", description: "Due follow-ups count" },
    { moduleId: "MOD-COMMUNICATION", entities: ["Lead"], direction: "IN", description: "New leads and conversion metrics" },
    { moduleId: "MOD-ROOMS", entities: ["Room"], direction: "IN", description: "Room availability status" },
    { moduleId: "MOD-NOTIFICATIONS", entities: ["Notification"], direction: "IN", description: "Unread notifications" },
  ],

  emittedEvents: [],
  subscribedEvents: [
    "appointment.booked", "appointment.checked_in", "appointment.completed",
    "patient.created", "billing.invoice_created", "payment.received",
    "followup.scheduled", "communication.lead_created", "lab.results_ready",
  ],

  workflowPosition: "SYSTEM",
  dependencies: [],

  route: "/dashboard",
  navLabel: "Dashboard",
  navOrder: 1,
};

export function register() { moduleRegistry.register(definition); }
