"use client";

import { useModuleStore } from "./store";
import { getClinicToday } from "@/lib/utils";
import type { WorkflowStage } from "@/types";

let hydrated = false;

export async function hydrateStore() {
  if (hydrated) return;
  hydrated = true;

  const store = useModuleStore.getState();
  const today = getClinicToday();

  try {
    // Hydrate waiting queue from today's checked-in/waiting appointments
    const aptsRes = await fetch(`/api/appointments?date=${today}`);
    if (aptsRes.ok) {
      const aptsData = await aptsRes.json();
      const apts = (aptsData.data || []) as Array<Record<string, unknown>>;

      const queueStatuses = new Set(["CHECKED_IN", "WAITING", "IN_PROGRESS"]);
      for (const apt of apts) {
        if (!queueStatuses.has(apt.status as string)) continue;

        const patient = apt.patient as { firstName?: string; lastName?: string } | undefined;
        const doctor = apt.doctor as { name?: string } | undefined;
        const patientName = [patient?.firstName, patient?.lastName].filter(Boolean).join(" ") || "Patient";
        const doctorName = doctor?.name || "Doctor";

        // Map appointment status to workflow stage
        let stage: WorkflowStage = "CHECKIN" as WorkflowStage;
        if (apt.workflowStage) stage = apt.workflowStage as WorkflowStage;

        store.addToQueue({
          appointmentId: apt.id as string,
          patientId: apt.patientId as string,
          patientName,
          doctorName,
          checkinTime: apt.checkinTime ? new Date(apt.checkinTime as string).getTime() : Date.now(),
          stage,
        });
      }
    }

    // Hydrate recent activities from audit log
    const auditRes = await fetch("/api/admin/audit-log?limit=20");
    if (auditRes.ok) {
      const auditData = await auditRes.json();
      const logs = (auditData.data || []) as Array<Record<string, unknown>>;

      for (const log of logs.reverse()) {
        store.addActivity({
          event: `${log.module}.${log.action}`.toLowerCase(),
          message: `${log.action} ${log.entityType}${log.details ? ` — ${JSON.stringify(log.details).slice(0, 80)}` : ""}`,
          moduleId: (log.module as string || "system").toLowerCase(),
        });
      }
    }
  } catch {
    // Hydration failure is non-fatal — store works empty
  }
}

export function resetHydration() {
  hydrated = false;
}
