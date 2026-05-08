import type { ModuleDefinition } from "@/modules/core/types";
import { moduleRegistry } from "@/modules/core/registry";
import { UserRole } from "@/types";

const definition: ModuleDefinition = {
  id: "MOD-ROOMS",
  name: "Rooms",
  purpose: "Physical space management. Tracks room inventory, type (consultation/procedure/waiting/recovery), real-time availability, patient-room assignments, and capacity. Integrates with appointments for room scheduling.",
  icon: "DoorOpen",
  color: "#14B8A6",

  primaryRoles: [UserRole.ADMIN, UserRole.RECEPTIONIST],
  permissions: {
    VIEW: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.DOCTOR, UserRole.RECEPTIONIST, UserRole.ASSISTANT, UserRole.AESTHETICIAN, UserRole.OPERATOR],
    CREATE: [UserRole.SUPER_ADMIN, UserRole.ADMIN],
    EDIT: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.RECEPTIONIST, UserRole.ASSISTANT, UserRole.AESTHETICIAN],
    DELETE: [UserRole.SUPER_ADMIN, UserRole.ADMIN],
    EXPORT: [UserRole.SUPER_ADMIN, UserRole.ADMIN],
  },

  sections: [
    { id: "ROOMS-LIST", label: "Room List", description: "All rooms with status" },
    { id: "ROOMS-MAP", label: "Room Map", description: "Visual room availability" },
    { id: "ROOMS-ALLOCATIONS", label: "Allocations", description: "Current patient-room assignments" },
  ],

  actions: [
    { id: "ROOMS-ASSIGN", label: "Assign Room", permission: "EDIT", emitsEvent: "rooms.assigned", description: "Assign patient to room" },
    { id: "ROOMS-RELEASE", label: "Release Room", permission: "EDIT", emitsEvent: "rooms.released", description: "Release room" },
    { id: "ROOMS-UPDATE-STATUS", label: "Update Status", permission: "EDIT", emitsEvent: "rooms.status_changed", description: "Change room status" },
  ],

  ownedEntities: ["Room", "RoomAllocation"],
  dataConnections: [
    { moduleId: "MOD-APPOINTMENT", entities: ["Appointment"], direction: "IN", description: "Room assignment for appointments" },
    { moduleId: "MOD-BRANCH", entities: ["Branch"], direction: "IN", description: "Branch-level room inventory" },
    { moduleId: "MOD-PATIENT", entities: ["Patient"], direction: "IN", description: "Patient in room" },
  ],

  emittedEvents: ["rooms.assigned", "rooms.released", "rooms.status_changed"],
  subscribedEvents: ["appointment.checked_in", "appointment.completed", "payment.checkout_completed"],

  workflowPosition: "CHECK_IN",
  dependencies: ["MOD-BRANCH"],

  route: "/rooms",
  navLabel: "Rooms",
  navOrder: 15,
};

export function register() { moduleRegistry.register(definition); }
