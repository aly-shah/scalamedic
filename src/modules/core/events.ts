// ============================================================
// MediCore ERP — Event Bus
// Inter-module communication via publish/subscribe
// ============================================================

import type { ModuleId, ModuleEvent, EventHandler, EventSubscription } from "./types";

type WildcardHandler = EventHandler;

class EventBus {
  private subscriptions = new Map<string, EventSubscription[]>();
  private wildcardSubs: { moduleId: ModuleId; handler: WildcardHandler }[] = [];
  private history: ModuleEvent[] = [];
  private maxHistory = 200;

  /**
   * Subscribe to a specific event type.
   * Returns an unsubscribe function.
   */
  on(eventType: string, moduleId: ModuleId, handler: EventHandler): () => void {
    const sub: EventSubscription = {
      id: `${moduleId}::${eventType}::${Date.now()}`,
      eventType,
      moduleId,
      handler,
    };

    const existing = this.subscriptions.get(eventType) || [];
    existing.push(sub);
    this.subscriptions.set(eventType, existing);

    return () => {
      const subs = this.subscriptions.get(eventType);
      if (subs) {
        this.subscriptions.set(
          eventType,
          subs.filter((s) => s.id !== sub.id)
        );
      }
    };
  }

  /**
   * Subscribe to a namespace of events (e.g., "patient.*").
   */
  onNamespace(namespace: string, moduleId: ModuleId, handler: EventHandler): () => void {
    const prefix = namespace.replace("*", "");
    const wrappedHandler: EventHandler = (event) => {
      if (event.type.startsWith(prefix)) handler(event);
    };
    this.wildcardSubs.push({ moduleId, handler: wrappedHandler });
    return () => {
      this.wildcardSubs = this.wildcardSubs.filter((s) => s.handler !== wrappedHandler);
    };
  }

  /**
   * Emit an event from a module.
   */
  emit<T = Record<string, unknown>>(
    type: string,
    sourceModule: ModuleId,
    payload: T,
    meta?: { entityId?: string; patientId?: string; appointmentId?: string }
  ): void {
    const event: ModuleEvent<T> = {
      type,
      sourceModule,
      payload,
      timestamp: Date.now(),
      ...meta,
    };

    // Store in history
    this.history.push(event as ModuleEvent);
    if (this.history.length > this.maxHistory) {
      this.history = this.history.slice(-this.maxHistory);
    }

    // Notify exact subscribers
    const subs = this.subscriptions.get(type) || [];
    for (const sub of subs) {
      try {
        sub.handler(event as ModuleEvent);
      } catch (err) {
        console.error(`[EventBus] Error in handler ${sub.id}:`, err);
      }
    }

    // Notify wildcard subscribers
    for (const wsub of this.wildcardSubs) {
      try {
        wsub.handler(event as ModuleEvent);
      } catch (err) {
        console.error(`[EventBus] Error in wildcard handler:`, err);
      }
    }
  }

  /**
   * Get recent event history, optionally filtered.
   */
  getHistory(filter?: { type?: string; moduleId?: ModuleId; patientId?: string }): ModuleEvent[] {
    if (!filter) return [...this.history];
    return this.history.filter((e) => {
      if (filter.type && e.type !== filter.type) return false;
      if (filter.moduleId && e.sourceModule !== filter.moduleId) return false;
      if (filter.patientId && e.patientId !== filter.patientId) return false;
      return true;
    });
  }

  /**
   * Clear all subscriptions (useful for cleanup).
   */
  clear(): void {
    this.subscriptions.clear();
    this.wildcardSubs = [];
  }
}

// Singleton instance
export const eventBus = new EventBus();

// ---- All System Events ----

export const SystemEvents = {
  // Patient Module
  PATIENT_CREATED: "patient.created",
  PATIENT_UPDATED: "patient.updated",
  PATIENT_DEACTIVATED: "patient.deactivated",

  // Appointment Module
  APPOINTMENT_BOOKED: "appointment.booked",
  APPOINTMENT_CONFIRMED: "appointment.confirmed",
  APPOINTMENT_CHECKED_IN: "appointment.checked_in",
  APPOINTMENT_STARTED: "appointment.started",
  APPOINTMENT_COMPLETED: "appointment.completed",
  APPOINTMENT_CANCELLED: "appointment.cancelled",
  APPOINTMENT_RESCHEDULED: "appointment.rescheduled",
  APPOINTMENT_NO_SHOW: "appointment.no_show",

  // Consultation Module
  CONSULTATION_STARTED: "consultation.started",
  CONSULTATION_NOTE_SAVED: "consultation.note_saved",
  CONSULTATION_COMPLETED: "consultation.completed",
  CONSULTATION_DIAGNOSIS_ADDED: "consultation.diagnosis_added",

  // Medical History Module
  MEDICAL_HISTORY_UPDATED: "medical_history.updated",
  ALLERGY_ADDED: "medical_history.allergy_added",
  CONDITION_ADDED: "medical_history.condition_added",

  // Skin History Module
  SKIN_CONDITION_ADDED: "skin_history.condition_added",
  SKIN_ASSESSMENT_COMPLETED: "skin_history.assessment_completed",

  // Procedure Module
  PROCEDURE_SCHEDULED: "procedure.scheduled",
  PROCEDURE_STARTED: "procedure.started",
  PROCEDURE_COMPLETED: "procedure.completed",
  PROCEDURE_IMAGES_UPLOADED: "procedure.images_uploaded",

  // Prescription Module
  PRESCRIPTION_CREATED: "prescription.created",
  PRESCRIPTION_UPDATED: "prescription.updated",

  // Billing Module
  INVOICE_CREATED: "billing.invoice_created",
  INVOICE_UPDATED: "billing.invoice_updated",
  INVOICE_SENT: "billing.invoice_sent",
  INVOICE_OVERDUE: "billing.invoice_overdue",

  // Payment Module
  PAYMENT_RECEIVED: "payment.received",
  PAYMENT_FAILED: "payment.failed",
  PAYMENT_REFUNDED: "payment.refunded",
  CHECKOUT_COMPLETED: "payment.checkout_completed",

  // Follow-Up Module
  FOLLOWUP_SCHEDULED: "followup.scheduled",
  FOLLOWUP_COMPLETED: "followup.completed",
  FOLLOWUP_MISSED: "followup.missed",
  FOLLOWUP_REMINDER_SENT: "followup.reminder_sent",

  // Communication Module
  LEAD_CREATED: "communication.lead_created",
  LEAD_CONVERTED: "communication.lead_converted",
  LEAD_UPDATED: "communication.lead_updated",
  CALL_LOGGED: "communication.call_logged",
  CALLBACK_SCHEDULED: "communication.callback_scheduled",
  MESSAGE_SENT: "communication.message_sent",

  // AI Transcription Module
  TRANSCRIPTION_STARTED: "ai.transcription_started",
  TRANSCRIPTION_COMPLETED: "ai.transcription_completed",
  TRANSCRIPTION_FAILED: "ai.transcription_failed",
  AI_SUMMARY_GENERATED: "ai.summary_generated",

  // Documents Module
  DOCUMENT_UPLOADED: "documents.uploaded",
  DOCUMENT_DELETED: "documents.deleted",
  CONSENT_SIGNED: "documents.consent_signed",

  // Images Module
  IMAGE_UPLOADED: "images.uploaded",
  BEFORE_AFTER_CREATED: "images.before_after_created",

  // Admin Module
  USER_CREATED: "admin.user_created",
  USER_UPDATED: "admin.user_updated",
  USER_DEACTIVATED: "admin.user_deactivated",
  PERMISSION_CHANGED: "admin.permission_changed",

  // Staff Module
  SCHEDULE_UPDATED: "staff.schedule_updated",
  LEAVE_REQUESTED: "staff.leave_requested",
  LEAVE_APPROVED: "staff.leave_approved",

  // Branch Module
  BRANCH_CREATED: "branch.created",
  BRANCH_UPDATED: "branch.updated",
  SETTINGS_CHANGED: "branch.settings_changed",

  // Notifications Module
  NOTIFICATION_CREATED: "notification.created",
  NOTIFICATION_READ: "notification.read",

  // Room Management
  ROOM_ASSIGNED: "rooms.assigned",
  ROOM_RELEASED: "rooms.released",
  ROOM_STATUS_CHANGED: "rooms.status_changed",

  // Vitals
  VITALS_RECORDED: "vitals.recorded",

  // Lab
  LAB_TEST_ORDERED: "lab.test_ordered",
  LAB_RESULTS_READY: "lab.results_ready",
} as const;

export type SystemEventType = (typeof SystemEvents)[keyof typeof SystemEvents];
