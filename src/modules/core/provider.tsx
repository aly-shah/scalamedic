"use client";

// ============================================================
// MediCore ERP — Module Provider
// Initializes module system, wires event handlers to real state
// ============================================================

import { createContext, useContext, useEffect, useRef, type ReactNode } from "react";
import { registerAllModules } from "@/modules/definitions";
import { moduleRegistry } from "./registry";
import { eventBus, SystemEvents } from "./events";
import { useModuleStore } from "./store";
import { hydrateStore } from "./hydrate";
import type { ModuleDefinition } from "./types";
import { WorkflowStage } from "@/types";

interface ModuleContextValue {
  ready: boolean;
  modules: ModuleDefinition[];
}

const ModuleContext = createContext<ModuleContextValue>({ ready: false, modules: [] });

let initialized = false;
function ensureInitialized() {
  if (initialized) return;
  initialized = true;
  registerAllModules();
  wireEventHandlers();
}

export function ModuleProvider({ children }: { children: ReactNode }) {
  ensureInitialized();
  const didHydrate = useRef(false);

  useEffect(() => {
    if (!didHydrate.current) {
      didHydrate.current = true;
      hydrateStore();
      // Pull runtime permission overrides so the registry's canAccess
      // checks reflect any admin-toggled grants/denials. Best-effort —
      // a 401 (logged out) just means we use static defaults.
      fetch("/api/admin/role-permissions", { credentials: "include" })
        .then((r) => r.json())
        .then((d) => {
          if (d.success && Array.isArray(d.data)) {
            moduleRegistry.setOverrides(d.data);
          }
        })
        .catch(() => { /* ignore — fall back to defaults */ });
    }
  }, []);

  const modules = moduleRegistry.getAll();

  return (
    <ModuleContext.Provider value={{ ready: true, modules }}>
      {children}
    </ModuleContext.Provider>
  );
}

export function useModuleContext() {
  return useContext(ModuleContext);
}

// ---- Helper to build notification message from event ----

function eventLabel(type: string): string {
  const labels: Record<string, string> = {
    [SystemEvents.APPOINTMENT_BOOKED]: "New appointment booked",
    [SystemEvents.APPOINTMENT_CHECKED_IN]: "Patient checked in",
    [SystemEvents.APPOINTMENT_COMPLETED]: "Visit completed",
    [SystemEvents.APPOINTMENT_CANCELLED]: "Appointment cancelled",
    [SystemEvents.APPOINTMENT_NO_SHOW]: "Patient no-show",
    [SystemEvents.CONSULTATION_STARTED]: "Consultation started",
    [SystemEvents.CONSULTATION_COMPLETED]: "Consultation completed",
    [SystemEvents.CONSULTATION_NOTE_SAVED]: "Consultation note saved",
    [SystemEvents.PROCEDURE_COMPLETED]: "Procedure completed",
    [SystemEvents.PRESCRIPTION_CREATED]: "Prescription created",
    [SystemEvents.INVOICE_CREATED]: "Invoice generated",
    [SystemEvents.INVOICE_OVERDUE]: "Invoice overdue",
    [SystemEvents.PAYMENT_RECEIVED]: "Payment received",
    [SystemEvents.PAYMENT_FAILED]: "Payment failed",
    [SystemEvents.PAYMENT_REFUNDED]: "Payment refunded",
    [SystemEvents.CHECKOUT_COMPLETED]: "Patient checked out",
    [SystemEvents.FOLLOWUP_SCHEDULED]: "Follow-up scheduled",
    [SystemEvents.FOLLOWUP_COMPLETED]: "Follow-up completed",
    [SystemEvents.FOLLOWUP_MISSED]: "Follow-up missed",
    [SystemEvents.LEAD_CREATED]: "New lead created",
    [SystemEvents.LEAD_CONVERTED]: "Lead converted to patient",
    [SystemEvents.CALLBACK_SCHEDULED]: "Callback scheduled",
    [SystemEvents.TRANSCRIPTION_COMPLETED]: "AI transcription ready",
    [SystemEvents.LAB_RESULTS_READY]: "Lab results available",
    [SystemEvents.VITALS_RECORDED]: "Vitals recorded",
    [SystemEvents.DOCUMENT_UPLOADED]: "Document uploaded",
    [SystemEvents.CONSENT_SIGNED]: "Consent signed",
    [SystemEvents.ROOM_ASSIGNED]: "Room assigned",
    [SystemEvents.ROOM_RELEASED]: "Room released",
  };
  return labels[type] || type.replace(/[._]/g, " ");
}

// ---- Inter-Module Event Wiring (real state mutations) ----

function wireEventHandlers() {
  const store = useModuleStore.getState;

  // ================================================
  // 1. ACTIVITY FEED — All significant events log to the feed
  // ================================================
  const activityEvents = [
    SystemEvents.PATIENT_CREATED, SystemEvents.PATIENT_UPDATED,
    SystemEvents.APPOINTMENT_BOOKED, SystemEvents.APPOINTMENT_CHECKED_IN,
    SystemEvents.APPOINTMENT_COMPLETED, SystemEvents.APPOINTMENT_CANCELLED,
    SystemEvents.CONSULTATION_STARTED, SystemEvents.CONSULTATION_COMPLETED,
    SystemEvents.CONSULTATION_NOTE_SAVED,
    SystemEvents.PROCEDURE_COMPLETED, SystemEvents.PRESCRIPTION_CREATED,
    SystemEvents.INVOICE_CREATED, SystemEvents.PAYMENT_RECEIVED,
    SystemEvents.CHECKOUT_COMPLETED,
    SystemEvents.FOLLOWUP_SCHEDULED, SystemEvents.FOLLOWUP_COMPLETED,
    SystemEvents.LEAD_CREATED, SystemEvents.LEAD_CONVERTED,
    SystemEvents.TRANSCRIPTION_COMPLETED, SystemEvents.LAB_RESULTS_READY,
    SystemEvents.VITALS_RECORDED, SystemEvents.DOCUMENT_UPLOADED,
  ];

  for (const eventType of activityEvents) {
    eventBus.on(eventType, "MOD-DASHBOARD", (event) => {
      const payload = event.payload as Record<string, unknown>;
      const patientName = (payload.patientName as string) || "";
      const message = patientName
        ? `${eventLabel(event.type)} — ${patientName}`
        : eventLabel(event.type);

      store().addActivity({
        event: event.type,
        message,
        moduleId: event.sourceModule,
        patientId: event.patientId,
        appointmentId: event.appointmentId,
      });
    });
  }

  // ================================================
  // 2. NOTIFICATIONS — Key events create user notifications
  // ================================================
  const notifEvents = [
    SystemEvents.APPOINTMENT_BOOKED,
    SystemEvents.APPOINTMENT_CANCELLED,
    SystemEvents.APPOINTMENT_NO_SHOW,
    SystemEvents.FOLLOWUP_SCHEDULED,
    SystemEvents.FOLLOWUP_MISSED,
    SystemEvents.INVOICE_CREATED,
    SystemEvents.INVOICE_OVERDUE,
    SystemEvents.PAYMENT_RECEIVED,
    SystemEvents.PAYMENT_FAILED,
    SystemEvents.LAB_RESULTS_READY,
    SystemEvents.CALLBACK_SCHEDULED,
    SystemEvents.LEAD_CREATED,
    SystemEvents.TRANSCRIPTION_COMPLETED,
  ];

  for (const eventType of notifEvents) {
    eventBus.on(eventType, "MOD-NOTIFICATIONS", (event) => {
      const payload = event.payload as Record<string, unknown>;
      store().addNotification({
        title: eventLabel(event.type),
        message: (payload.patientName as string) || (payload.details as string) || "",
        type: event.type.split(".")[0],
        moduleId: event.sourceModule,
        link: event.patientId ? `/patients/${event.patientId}` : undefined,
      });
    });
  }

  // ================================================
  // 3. PATIENT JOURNEY — Track visit stages through the workflow
  // ================================================

  // Check-in → start visit + add to waiting queue
  eventBus.on(SystemEvents.APPOINTMENT_CHECKED_IN, "MOD-APPOINTMENT", (event) => {
    const payload = event.payload as Record<string, unknown>;
    if (event.patientId && event.appointmentId) {
      store().startVisit(event.patientId, event.appointmentId);
      store().addToQueue({
        appointmentId: event.appointmentId,
        patientId: event.patientId,
        patientName: (payload.patientName as string) || "Patient",
        doctorName: (payload.doctorName as string) || "Doctor",
        checkinTime: Date.now(),
        stage: WorkflowStage.CHECKIN,
      });
      store().incrementCounter("waitingCount");
    }
  });

  // Consultation started → advance visit
  eventBus.on(SystemEvents.CONSULTATION_STARTED, "MOD-CONSULTATION", (event) => {
    if (event.patientId) {
      store().advanceVisit(event.patientId, WorkflowStage.CONSULT);
      if (event.appointmentId) {
        store().updateQueueStage(event.appointmentId, WorkflowStage.CONSULT);
      }
    }
  });

  // Consultation completed → advance to billing stage
  eventBus.on(SystemEvents.CONSULTATION_COMPLETED, "MOD-BILLING", (event) => {
    if (event.patientId) {
      store().advanceVisit(event.patientId, WorkflowStage.BILLING);
      if (event.appointmentId) {
        store().updateQueueStage(event.appointmentId, WorkflowStage.BILLING);
      }
    }
    store().incrementCounter("pendingInvoices");
  });

  // Procedure completed → send charges to billing
  eventBus.on(SystemEvents.PROCEDURE_COMPLETED, "MOD-BILLING", (event) => {
    store().incrementCounter("pendingCharges");
  });

  // Invoice created
  eventBus.on(SystemEvents.INVOICE_CREATED, "MOD-PAYMENT", (event) => {
    if (event.patientId) {
      store().advanceVisit(event.patientId, WorkflowStage.PAYMENT);
      if (event.appointmentId) {
        store().updateQueueStage(event.appointmentId, WorkflowStage.PAYMENT);
      }
    }
  });

  // Payment received → advance toward checkout
  eventBus.on(SystemEvents.PAYMENT_RECEIVED, "MOD-BILLING", (event) => {
    store().decrementCounter("pendingInvoices");
    store().incrementCounter("paymentsToday");
  });

  // Checkout → end visit, release room, remove from queue
  eventBus.on(SystemEvents.CHECKOUT_COMPLETED, "MOD-ROOMS", (event) => {
    if (event.patientId) {
      store().endVisit(event.patientId);
    }
    if (event.appointmentId) {
      store().removeFromQueue(event.appointmentId);
      store().decrementCounter("waitingCount");
    }
  });

  // Appointment completed (same as checkout for queue purposes)
  eventBus.on(SystemEvents.APPOINTMENT_COMPLETED, "MOD-FOLLOWUP", (event) => {
    if (event.appointmentId) {
      store().removeFromQueue(event.appointmentId);
    }
  });

  // ================================================
  // 4. CROSS-MODULE DATA FLOWS
  // ================================================

  // Prescription → medical history (active medications)
  eventBus.on(SystemEvents.PRESCRIPTION_CREATED, "MOD-MEDICAL-HISTORY", (event) => {
    store().incrementCounter("activePrescriptions");
  });

  // Procedure completed → skin history
  eventBus.on(SystemEvents.PROCEDURE_COMPLETED, "MOD-SKIN-HISTORY", (event) => {
    store().incrementCounter("completedProcedures");
  });

  // Lead converted → patient module
  eventBus.on(SystemEvents.LEAD_CONVERTED, "MOD-PATIENT", (event) => {
    store().incrementCounter("convertedLeads");
    store().decrementCounter("activeLeads");
  });

  // New lead
  eventBus.on(SystemEvents.LEAD_CREATED, "MOD-COMMUNICATION", (event) => {
    store().incrementCounter("activeLeads");
  });

  // AI transcription → consultation
  eventBus.on(SystemEvents.TRANSCRIPTION_COMPLETED, "MOD-CONSULTATION", (event) => {
    store().incrementCounter("transcriptionsReady");
  });

  // Lab results → consultation
  eventBus.on(SystemEvents.LAB_RESULTS_READY, "MOD-CONSULTATION", (event) => {
    store().incrementCounter("labResultsReady");
  });

  // Vitals recorded → advance queue stage
  eventBus.on(SystemEvents.VITALS_RECORDED, "MOD-APPOINTMENT", (event) => {
    if (event.appointmentId) {
      store().updateQueueStage(event.appointmentId, WorkflowStage.WAITING);
    }
    if (event.patientId) {
      store().advanceVisit(event.patientId, WorkflowStage.WAITING);
    }
  });

  // Follow-up scheduled
  eventBus.on(SystemEvents.FOLLOWUP_SCHEDULED, "MOD-FOLLOWUP", (event) => {
    store().incrementCounter("pendingFollowUps");
  });

  eventBus.on(SystemEvents.FOLLOWUP_COMPLETED, "MOD-FOLLOWUP", (event) => {
    store().decrementCounter("pendingFollowUps");
  });

  // Room events
  eventBus.on(SystemEvents.ROOM_ASSIGNED, "MOD-ROOMS", (event) => {
    store().decrementCounter("availableRooms");
  });

  eventBus.on(SystemEvents.ROOM_RELEASED, "MOD-ROOMS", (event) => {
    store().incrementCounter("availableRooms");
  });

  // New patient
  eventBus.on(SystemEvents.PATIENT_CREATED, "MOD-PATIENT", (event) => {
    store().incrementCounter("totalPatients");
  });

  // New appointment
  eventBus.on(SystemEvents.APPOINTMENT_BOOKED, "MOD-APPOINTMENT", (event) => {
    store().incrementCounter("todayAppointments");
  });
}
