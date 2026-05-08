import type { ModuleDefinition } from "@/modules/core/types";
import { moduleRegistry } from "@/modules/core/registry";
import { UserRole } from "@/types";

const definition: ModuleDefinition = {
  id: "MOD-STAFF",
  name: "Staff Management",
  purpose: "Manages clinic staff: user accounts, doctor schedules, availability, leave management, and role assignments. Feeds doctor availability into the Appointment module for scheduling.",
  icon: "UserCog",
  color: "#0EA5E9",

  primaryRoles: [UserRole.SUPER_ADMIN, UserRole.ADMIN],
  permissions: {
    VIEW: [UserRole.SUPER_ADMIN, UserRole.ADMIN],
    CREATE: [UserRole.SUPER_ADMIN, UserRole.ADMIN],
    EDIT: [UserRole.SUPER_ADMIN, UserRole.ADMIN],
    DELETE: [UserRole.SUPER_ADMIN],
    EXPORT: [UserRole.SUPER_ADMIN, UserRole.ADMIN],
  },

  sections: [
    { id: "STAFF-LIST", label: "Staff Directory", description: "All staff members" },
    { id: "STAFF-SCHEDULES", label: "Schedules", description: "Doctor schedule management" },
    { id: "STAFF-LEAVES", label: "Leave Management", description: "Leave requests and approvals" },
    { id: "STAFF-CREATE", label: "Add Staff", description: "Create new user account" },
  ],

  actions: [
    { id: "STAFF-CREATE-USER", label: "Add Staff Member", permission: "CREATE", emitsEvent: "admin.user_created", description: "Create user account" },
    { id: "STAFF-UPDATE-SCHEDULE", label: "Update Schedule", permission: "EDIT", emitsEvent: "staff.schedule_updated", description: "Modify doctor schedule" },
    { id: "STAFF-APPROVE-LEAVE", label: "Approve Leave", permission: "EDIT", emitsEvent: "staff.leave_approved", description: "Approve leave request" },
  ],

  ownedEntities: ["User", "DoctorSchedule", "DoctorLeave"],
  dataConnections: [
    { moduleId: "MOD-ADMIN", entities: ["Permission"], direction: "OUT", description: "Permission assignment" },
    { moduleId: "MOD-APPOINTMENT", entities: ["Appointment"], direction: "OUT", description: "Doctor availability for scheduling" },
    { moduleId: "MOD-BRANCH", entities: ["Branch"], direction: "IN", description: "Branch assignment" },
  ],

  emittedEvents: ["admin.user_created", "admin.user_updated", "admin.user_deactivated", "staff.schedule_updated", "staff.leave_requested", "staff.leave_approved"],
  subscribedEvents: [],

  workflowPosition: "SYSTEM",
  dependencies: [],

  route: "/admin/users",
  navLabel: "Staff",
  navOrder: 16,
};

export function register() { moduleRegistry.register(definition); }
