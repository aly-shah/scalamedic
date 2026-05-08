"use client";

// ============================================================
// MediCore ERP — React Query Hooks
// Wraps api.ts methods with useQuery/useMutation for caching,
// loading states, error handling, and automatic refetching.
// ============================================================

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

// ---- Query Key Factory ----
export const queryKeys = {
  patients: {
    all: ["patients"] as const,
    list: (params?: Record<string, string>) => ["patients", "list", params] as const,
    detail: (id: string) => ["patients", id] as const,
    appointments: (id: string) => ["patients", id, "appointments"] as const,
    notes: (id: string) => ["patients", id, "notes"] as const,
    prescriptions: (id: string) => ["patients", id, "prescriptions"] as const,
    documents: (id: string) => ["patients", id, "documents"] as const,
    billing: (id: string) => ["patients", id, "billing"] as const,
    labTests: (id: string) => ["patients", id, "labTests"] as const,
    followUps: (id: string) => ["patients", id, "followUps"] as const,
    triage: (id: string) => ["patients", id, "triage"] as const,
    tags: (id: string) => ["patients", id, "tags"] as const,
  },
  appointments: {
    all: ["appointments"] as const,
    list: (params?: Record<string, string>) => ["appointments", "list", params] as const,
    detail: (id: string) => ["appointments", id] as const,
    calendar: (params?: Record<string, string>) => ["appointments", "calendar", params] as const,
  },
  billing: {
    invoices: (params?: Record<string, string>) => ["billing", "invoices", params] as const,
    invoice: (id: string) => ["billing", "invoices", id] as const,
    payments: (params?: Record<string, string>) => ["billing", "payments", params] as const,
  },
  treatments: {
    all: ["treatments"] as const,
    list: (params?: Record<string, string>) => ["treatments", "list", params] as const,
  },
  packages: {
    all: ["packages"] as const,
    list: () => ["packages", "list"] as const,
  },
  leads: {
    all: ["leads"] as const,
    list: (params?: Record<string, string>) => ["leads", "list", params] as const,
    detail: (id: string) => ["leads", id] as const,
  },
  callLogs: {
    list: () => ["callLogs", "list"] as const,
  },
  rooms: {
    all: ["rooms"] as const,
    list: (params?: Record<string, string>) => ["rooms", "list", params] as const,
  },
  labTests: {
    all: ["labTests"] as const,
    list: (params?: Record<string, string>) => ["labTests", "list", params] as const,
  },
  followUps: {
    all: ["followUps"] as const,
    list: (params?: Record<string, string>) => ["followUps", "list", params] as const,
  },
  dashboard: {
    stats: (role?: string) => ["dashboard", "stats", role] as const,
  },
  admin: {
    users: () => ["admin", "users"] as const,
    branches: () => ["admin", "branches"] as const,
    auditLog: (params?: Record<string, string>) => ["admin", "auditLog", params] as const,
  },
  notifications: {
    list: () => ["notifications"] as const,
  },
};

// ---- Patients ----

export function usePatients(params?: Record<string, string>) {
  return useQuery({
    queryKey: queryKeys.patients.list(params),
    queryFn: () => api.patients.list(params),
  });
}

export function usePatient(id: string) {
  return useQuery({
    queryKey: queryKeys.patients.detail(id),
    queryFn: () => api.patients.get(id),
    enabled: !!id,
  });
}

export function usePatientAppointments(id: string) {
  return useQuery({
    queryKey: queryKeys.patients.appointments(id),
    queryFn: () => api.patients.appointments(id),
    enabled: !!id,
  });
}

export function usePatientNotes(id: string) {
  return useQuery({
    queryKey: queryKeys.patients.notes(id),
    queryFn: () => api.patients.notes(id),
    enabled: !!id,
  });
}

export function usePatientPrescriptions(id: string) {
  return useQuery({
    queryKey: queryKeys.patients.prescriptions(id),
    queryFn: () => api.patients.prescriptions(id),
    enabled: !!id,
  });
}

export function usePatientDocuments(id: string) {
  return useQuery({
    queryKey: queryKeys.patients.documents(id),
    queryFn: () => api.patients.documents(id),
    enabled: !!id,
  });
}

export function usePatientBilling(id: string) {
  return useQuery({
    queryKey: queryKeys.patients.billing(id),
    queryFn: () => api.patients.billing(id),
    enabled: !!id,
  });
}

export function usePatientLabTests(id: string) {
  return useQuery({
    queryKey: queryKeys.patients.labTests(id),
    queryFn: () => api.patients.labTests(id),
    enabled: !!id,
  });
}

export function usePatientFollowUps(id: string) {
  return useQuery({
    queryKey: queryKeys.patients.followUps(id),
    queryFn: () => api.patients.followUps(id),
    enabled: !!id,
  });
}

export function usePatientTriage(id: string) {
  return useQuery({
    queryKey: queryKeys.patients.triage(id),
    queryFn: () => api.patients.triage(id),
    enabled: !!id,
  });
}

export function usePrescription(id: string) {
  return useQuery({
    queryKey: ["prescriptions", id] as const,
    queryFn: () => fetch(`/api/prescriptions/${id}`).then((r) => r.json()),
    enabled: !!id,
  });
}

export function useUpdatePrescription(patientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      fetch(`/api/prescriptions/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).then((r) => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.patients.prescriptions(patientId) });
    },
  });
}

export function useDeletePrescription(patientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/prescriptions/${id}`, { method: "DELETE" }).then((r) => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.patients.prescriptions(patientId) });
    },
  });
}

export function usePatientSkinHistory(id: string) {
  return useQuery({
    queryKey: ["patients", id, "skinHistory"] as const,
    queryFn: () => fetch(`/api/patients/${id}/skin-history`).then((r) => r.json()),
    enabled: !!id,
  });
}

export function usePatientProcedures(id: string) {
  return useQuery({
    queryKey: ["patients", id, "procedures"] as const,
    queryFn: () => fetch(`/api/patients/${id}/procedures`).then((r) => r.json()),
    enabled: !!id,
  });
}

export function usePatientPackages(id: string) {
  return useQuery({
    queryKey: ["patients", id, "packages"] as const,
    queryFn: () => fetch(`/api/patients/${id}/packages`).then((r) => r.json()),
    enabled: !!id,
  });
}

export function usePatientCommunications(id: string) {
  return useQuery({
    queryKey: ["patients", id, "communications"] as const,
    queryFn: () => fetch(`/api/patients/${id}/communications`).then((r) => r.json()),
    enabled: !!id,
  });
}

export function usePatientTranscriptions(id: string) {
  return useQuery({
    queryKey: ["patients", id, "transcriptions"] as const,
    queryFn: () => fetch(`/api/patients/${id}/transcriptions`).then((r) => r.json()),
    enabled: !!id,
  });
}

export function usePatientTags(id: string) {
  return useQuery({
    queryKey: queryKeys.patients.tags(id),
    queryFn: () =>
      fetch(`/api/patients/${id}/tags`).then((r) => r.json()),
    enabled: !!id,
  });
}

export function useAddPatientTag(patientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { tag: string; color?: string }) =>
      fetch(`/api/patients/${patientId}/tags`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).then((r) => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.patients.tags(patientId) });
    },
  });
}

export function useRemovePatientTag(patientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (tagId: string) =>
      fetch(`/api/patients/${patientId}/tags`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tagId }),
      }).then((r) => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.patients.tags(patientId) });
    },
  });
}

export function useCreatePatient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => api.patients.create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.patients.all }),
  });
}

export function useUpdatePatient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      api.patients.update(id, data),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: queryKeys.patients.detail(vars.id) });
      qc.invalidateQueries({ queryKey: queryKeys.patients.all });
    },
  });
}

export function useDeletePatient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.patients.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.patients.all }),
  });
}

export function useHardDeletePatient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.patients.hardDelete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.patients.all }),
  });
}

export function useRestorePatient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.patients.restore(id),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: queryKeys.patients.all });
      qc.invalidateQueries({ queryKey: queryKeys.patients.detail(id) });
    },
  });
}

// ---- Appointments ----

export function useAppointments(params?: Record<string, string>) {
  return useQuery({
    queryKey: queryKeys.appointments.list(params),
    queryFn: () => api.appointments.list(params),
  });
}

export function useAppointment(id: string) {
  return useQuery({
    queryKey: queryKeys.appointments.detail(id),
    queryFn: () => api.appointments.get(id),
    enabled: !!id,
  });
}

export function useAppointmentCalendar(params?: Record<string, string>) {
  return useQuery({
    queryKey: queryKeys.appointments.calendar(params),
    queryFn: () => api.appointments.calendar(params),
  });
}

export function useCreateAppointment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => api.appointments.create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.appointments.all }),
  });
}

export function useUpdateAppointment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      api.appointments.update(id, data),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: queryKeys.appointments.detail(vars.id) });
      qc.invalidateQueries({ queryKey: queryKeys.appointments.all });
      // Status / room changes affect Room.status, so refresh the rooms grid too.
      qc.invalidateQueries({ queryKey: queryKeys.rooms.all });
    },
  });
}

export function useCheckInAppointment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.appointments.checkIn(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.appointments.all });
      qc.invalidateQueries({ queryKey: queryKeys.rooms.all });
    },
  });
}

export function useCheckoutAppointment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.appointments.checkout(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.appointments.all });
      qc.invalidateQueries({ queryKey: queryKeys.rooms.all });
    },
  });
}

export function useNoShowAppointment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      fetch(`/api/appointments/${id}/no-show`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      }).then((r) => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.appointments.all });
      qc.invalidateQueries({ queryKey: queryKeys.rooms.all });
    },
  });
}

// ---- Billing ----

export function useInvoices(params?: Record<string, string>) {
  return useQuery({
    queryKey: queryKeys.billing.invoices(params),
    queryFn: () => api.billing.invoices(params),
  });
}

export function useInvoice(id: string) {
  return useQuery({
    queryKey: queryKeys.billing.invoice(id),
    queryFn: () => api.billing.invoice(id),
    enabled: !!id,
  });
}

export function useCreateInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => api.billing.createInvoice(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["billing"] }),
  });
}

export function usePayments(params?: Record<string, string>) {
  return useQuery({
    queryKey: queryKeys.billing.payments(params),
    queryFn: () => api.billing.payments(params),
  });
}

export function useRecordPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => api.billing.pay(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["billing"] }),
  });
}

export function useRefunds(params?: Record<string, string>) {
  return useQuery({
    queryKey: ["billing", "refunds", params] as const,
    queryFn: () => {
      const qs = params ? "?" + new URLSearchParams(params).toString() : "";
      return fetch(`/api/billing/refunds${qs}`).then((r) => r.json());
    },
  });
}

export function useCreateRefund() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      fetch("/api/billing/refunds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).then((r) => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["billing"] });
    },
  });
}

// ---- Treatments ----

export function useTreatments(params?: Record<string, string>) {
  return useQuery({
    queryKey: queryKeys.treatments.list(params),
    queryFn: () => api.treatments.list(params),
  });
}

export function useCreateTreatment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => api.treatments.create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.treatments.all }),
  });
}

export function useUpdateTreatment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      api.treatments.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.treatments.all }),
  });
}

export function useDeleteTreatment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.treatments.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.treatments.all }),
  });
}

// ---- Packages ----

export function usePackages() {
  return useQuery({
    queryKey: queryKeys.packages.list(),
    queryFn: () => api.packages.list(),
  });
}

export function useCreatePackage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => api.packages.create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.packages.all }),
  });
}

export function useUpdatePackage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      api.packages.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.packages.all }),
  });
}

export function useDeletePackage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.packages.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.packages.all }),
  });
}

// ---- Leads ----

export function useLeads(params?: Record<string, string>) {
  return useQuery({
    queryKey: queryKeys.leads.list(params),
    queryFn: () => api.leads.list(params),
  });
}

export function useLead(id: string) {
  return useQuery({
    queryKey: queryKeys.leads.detail(id),
    queryFn: () => api.leads.get(id),
    enabled: !!id,
  });
}

export function useCreateLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => api.leads.create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.leads.all }),
  });
}

export function useUpdateLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      api.leads.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.leads.all }),
  });
}

// ---- Call Logs ----

export function useCallLogs() {
  return useQuery({
    queryKey: queryKeys.callLogs.list(),
    queryFn: () => api.callLogs.list(),
  });
}

export function useCreateCallLog() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => api.callLogs.create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.callLogs.list() }),
  });
}

// ---- Rooms ----

export function useRooms(params?: Record<string, string>) {
  return useQuery({
    queryKey: queryKeys.rooms.list(params),
    queryFn: () => api.rooms.list(params),
  });
}

export function useUpdateRoom() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      api.rooms.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.rooms.all }),
  });
}

// ---- Lab Tests ----

export function useLabTests(params?: Record<string, string>) {
  return useQuery({
    queryKey: queryKeys.labTests.list(params),
    queryFn: () => api.labTests.list(params),
  });
}

export function useCreateLabTest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => api.labTests.create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.labTests.all }),
  });
}

export function useUpdateLabTest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      api.labTests.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.labTests.all }),
  });
}

// ---- Follow-Ups ----

export function useFollowUps(params?: Record<string, string>) {
  return useQuery({
    queryKey: queryKeys.followUps.list(params),
    queryFn: () => api.followUps.list(params),
  });
}

export function useCreateFollowUp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => api.followUps.create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.followUps.all }),
  });
}

export function useUpdateFollowUp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      api.followUps.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.followUps.all }),
  });
}

// ---- Dashboard ----

export function useDashboardStats(role?: string) {
  return useQuery({
    queryKey: queryKeys.dashboard.stats(role),
    queryFn: () => api.dashboard.stats(role),
    refetchInterval: 60 * 1000,
  });
}

// ---- Admin ----

/**
 * List active staff for any signed-in role. Hits the read-only /api/users
 * endpoint, NOT /api/admin/users — the latter is admin-only and would 401
 * for receptionists, doctors, etc. Use api.admin.users() directly if you
 * specifically need the full admin field set.
 */
export function useStaff() {
  return useQuery({
    queryKey: queryKeys.admin.users(),
    queryFn: () => api.users(),
    retry: 1,
  });
}

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => api.admin.createUser(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.admin.users() }),
  });
}

export function useUpdateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      api.admin.updateUser(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.admin.users() });
      qc.invalidateQueries({ queryKey: ["staff"] });
    },
  });
}

/**
 * List active branches for any authenticated role. Hits /api/branches
 * (read-only mirror), NOT /api/admin/branches — the admin one is
 * gated to ADMIN/SUPER_ADMIN only and would 403 for receptionists,
 * doctors, etc., breaking the appointment-modal branch picker.
 * Use api.admin.branches() directly only when you need the full admin
 * mutation surface (which goes through /api/admin/branches/[id]).
 */
export function useBranches() {
  return useQuery({
    queryKey: queryKeys.admin.branches(),
    queryFn: () => api.branches(),
  });
}

export function useCreateBranch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => api.admin.createBranch(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.admin.branches() }),
  });
}

export function useUpdateBranch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      api.admin.updateBranch(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.admin.branches() }),
  });
}

export function useDeleteBranch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.admin.deleteBranch(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.admin.branches() }),
  });
}

export function useAuditLog(params?: Record<string, string>) {
  return useQuery({
    queryKey: queryKeys.admin.auditLog(params),
    queryFn: () => api.admin.auditLog(params),
  });
}

// ---- Calendar ----

export function useCalendar(params?: Record<string, string>) {
  return useQuery({
    queryKey: ["calendar", params] as const,
    queryFn: () => {
      const qs = params ? "?" + new URLSearchParams(params).toString() : "";
      return fetch(`/api/calendar${qs}`).then((r) => r.json());
    },
    refetchInterval: 60 * 1000,
  });
}

export function useBlockSlot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      fetch("/api/calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["calendar"] }),
  });
}

export function useUnblockSlot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/calendar/block-slot/${id}`, { method: "DELETE" }).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["calendar"] }),
  });
}

export function useAvailableSlots(params?: Record<string, string>) {
  return useQuery({
    queryKey: ["calendar", "availability", params] as const,
    queryFn: () => {
      const qs = params ? "?" + new URLSearchParams(params).toString() : "";
      return fetch(`/api/calendar/availability${qs}`).then((r) => r.json());
    },
    enabled: !!params,
  });
}

// ---- Notifications ----

export function useNotifications() {
  return useQuery({
    queryKey: queryKeys.notifications.list(),
    queryFn: () => api.notifications.list(),
    refetchInterval: 30 * 1000,
  });
}

export function useMarkNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => api.notifications.markRead(ids),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.notifications.list() }),
  });
}

// ---- Patient Sub-Resource Mutations ----

export function useCreatePatientNote(patientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      api.patients.notes(patientId).then(() => {
        // POST to notes endpoint
        return fetch(`/api/patients/${patientId}/notes`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        }).then((r) => r.json());
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.patients.notes(patientId) });
    },
  });
}

export function useSignNote(patientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ noteId }: { noteId: string }) =>
      fetch(`/api/consultation-notes/${noteId}/sign`, {
        method: "POST",
      }).then((r) => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.patients.notes(patientId) });
    },
  });
}

export function useCreatePatientPrescription(patientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      fetch(`/api/patients/${patientId}/prescriptions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).then((r) => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.patients.prescriptions(patientId) });
    },
  });
}

export function useCreatePatientLabTest(patientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      fetch(`/api/patients/${patientId}/lab-tests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).then((r) => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.patients.labTests(patientId) });
    },
  });
}

export function useCreatePatientDocument(patientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      fetch(`/api/patients/${patientId}/documents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).then((r) => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.patients.documents(patientId) });
    },
  });
}

export function useCreatePatientFollowUp(patientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      fetch(`/api/patients/${patientId}/follow-ups`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).then((r) => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.patients.followUps(patientId) });
    },
  });
}

export function useCreatePatientTriage(patientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      fetch(`/api/patients/${patientId}/triage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).then((r) => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.patients.triage(patientId) });
    },
  });
}

// ---- AI ----

export function useTranscribe() {
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => api.ai.transcribe(data),
  });
}

export function useSummarize() {
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => api.ai.summarize(data),
  });
}
