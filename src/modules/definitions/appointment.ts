import type { ModuleDefinition } from "@/modules/core/types";
import { moduleRegistry } from "@/modules/core/registry";
import { UserRole } from "@/types";

const definition: ModuleDefinition = {
  id: "MOD-APPOINTMENT",
  name: "Appointments",
  purpose: "End-to-end appointment lifecycle: scheduling, calendar views, check-in, waiting queue, room assignment, workflow tracking, and checkout. Drives the patient visit context for all downstream modules.",
  icon: "Calendar",
  color: "#8B5CF6",

  primaryRoles: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.DOCTOR, UserRole.RECEPTIONIST, UserRole.ASSISTANT, UserRole.AESTHETICIAN],
  permissions: {
    VIEW: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.DOCTOR, UserRole.RECEPTIONIST, UserRole.BILLING, UserRole.CALL_CENTER, UserRole.ASSISTANT, UserRole.AESTHETICIAN, UserRole.OPERATOR],
    CREATE: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.RECEPTIONIST, UserRole.CALL_CENTER],
    EDIT: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.DOCTOR, UserRole.RECEPTIONIST, UserRole.ASSISTANT, UserRole.AESTHETICIAN],
    DELETE: [UserRole.SUPER_ADMIN, UserRole.ADMIN],
    EXPORT: [UserRole.SUPER_ADMIN, UserRole.ADMIN],
  },

  sections: [
    { id: "APPOINTMENT-LIST", label: "Appointment List", description: "Filterable list of all appointments" },
    { id: "APPOINTMENT-CALENDAR", label: "Calendar View", description: "Weekly/daily visual schedule" },
    { id: "APPOINTMENT-CHECKIN", label: "Check-In", description: "Patient arrival and check-in flow" },
    { id: "APPOINTMENT-QUEUE", label: "Waiting Queue", description: "Real-time waiting room status" },
    { id: "APPOINTMENT-DETAIL", label: "Appointment Detail", description: "Full appointment view with workflow" },
    { id: "APPOINTMENT-TRIAGE", label: "Vitals", description: "Record vitals at check-in" },
  ],

  actions: [
    { id: "APPOINTMENT-CREATE", label: "Book Appointment", permission: "CREATE", emitsEvent: "appointment.booked", description: "Schedule new appointment" },
    { id: "APPOINTMENT-CHECKIN-ACTION", label: "Check In", permission: "EDIT", emitsEvent: "appointment.checked_in", description: "Check in patient" },
    { id: "APPOINTMENT-START", label: "Start Consultation", permission: "EDIT", emitsEvent: "appointment.started", description: "Begin consultation" },
    { id: "APPOINTMENT-COMPLETE", label: "Complete Visit", permission: "EDIT", emitsEvent: "appointment.completed", description: "Mark visit as complete" },
    { id: "APPOINTMENT-CANCEL", label: "Cancel", permission: "DELETE", emitsEvent: "appointment.cancelled", description: "Cancel appointment" },
    { id: "APPOINTMENT-RESCHEDULE", label: "Reschedule", permission: "EDIT", emitsEvent: "appointment.rescheduled", description: "Reschedule appointment" },
    { id: "APPOINTMENT-RECORD-VITALS", label: "Record Vitals", permission: "EDIT", emitsEvent: "vitals.recorded", description: "Record vitals" },
  ],

  ownedEntities: ["Appointment", "Vitals", "Waitlist"],
  dataConnections: [
    { moduleId: "MOD-PATIENT", entities: ["Patient"], direction: "IN", description: "Patient info for scheduling" },
    { moduleId: "MOD-STAFF", entities: ["User", "DoctorSchedule"], direction: "IN", description: "Doctor availability" },
    { moduleId: "MOD-ROOMS", entities: ["Room"], direction: "BOTH", description: "Room assignment for appointments" },
    { moduleId: "MOD-CONSULTATION", entities: ["ConsultationNote"], direction: "OUT", description: "Creates visit context for consultation" },
    { moduleId: "MOD-BILLING", entities: ["Invoice"], direction: "OUT", description: "Triggers billing after visit" },
    { moduleId: "MOD-FOLLOWUP", entities: ["FollowUp"], direction: "OUT", description: "Follow-ups linked to appointments" },
  ],

  emittedEvents: [
    "appointment.booked", "appointment.confirmed", "appointment.checked_in",
    "appointment.started", "appointment.completed", "appointment.cancelled",
    "appointment.rescheduled", "appointment.no_show", "vitals.recorded",
  ],
  subscribedEvents: [
    "patient.created", "staff.schedule_updated", "staff.leave_approved",
    "rooms.status_changed", "consultation.completed", "payment.checkout_completed",
  ],

  workflowPosition: "BOOKING",
  dependencies: ["MOD-PATIENT", "MOD-STAFF"],

  route: "/appointments",
  navLabel: "Appointments",
  navOrder: 3,
};

export function register() { moduleRegistry.register(definition); }
