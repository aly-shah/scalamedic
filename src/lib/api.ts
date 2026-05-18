/**
 * API client helpers for frontend data fetching.
 */

const BASE = "";

function buildQuery(params?: Record<string, string | undefined>): string {
  if (!params) return "";
  const clean: Record<string, string> = {};
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "" && v !== "undefined") clean[k] = v;
  }
  const qs = new URLSearchParams(clean).toString();
  return qs ? `?${qs}` : "";
}

interface ApiResponse<T> {
  success: boolean;
  data: T;
  error?: string;
  total?: number;
  page?: number;
  pageSize?: number;
}

async function apiFetch<T>(url: string, options?: RequestInit): Promise<ApiResponse<T>> {
  const res = await fetch(BASE + url, {
    headers: { "Content-Type": "application/json", ...options?.headers },
    ...options,
  });

  if (res.status === 401) {
    // Session expired — redirect to login
    if (typeof window !== "undefined") {
      window.location.href = "/login";
    }
    throw new Error("Unauthorized");
  }

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error || `API error: ${res.status}`);
  }

  return data;
}

// ---- GET helpers ----
export const api = {
  // Auth
  me: () => apiFetch<unknown>("/api/auth/me"),

  // Patients
  patients: {
    list: (params?: Record<string, string>) => {
      const qs = buildQuery(params);
      return apiFetch<unknown[]>(`/api/patients${qs}`);
    },
    get: (id: string) => apiFetch<unknown>(`/api/patients/${id}`),
    create: (data: Record<string, unknown>) => apiFetch<unknown>("/api/patients", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: Record<string, unknown>) => apiFetch<unknown>(`/api/patients/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    // delete = soft-deactivate (sets isActive=false, keeps the row).
    // Use hardDelete for the irreversible variant — only succeeds when
    // patient has no clinical history.
    delete: (id: string) => apiFetch<unknown>(`/api/patients/${id}`, { method: "DELETE" }),
    hardDelete: (id: string) => apiFetch<unknown>(`/api/patients/${id}?hard=true`, { method: "DELETE" }),
    restore: (id: string) => apiFetch<unknown>(`/api/patients/${id}/restore`, { method: "POST" }),
    appointments: (id: string) => apiFetch<unknown[]>(`/api/patients/${id}/appointments`),
    notes: (id: string) => apiFetch<unknown[]>(`/api/patients/${id}/notes`),
    prescriptions: (id: string) => apiFetch<unknown[]>(`/api/patients/${id}/prescriptions`),
    documents: (id: string) => apiFetch<unknown[]>(`/api/patients/${id}/documents`),
    billing: (id: string) => apiFetch<unknown[]>(`/api/patients/${id}/billing`),
    labTests: (id: string) => apiFetch<unknown[]>(`/api/patients/${id}/lab-tests`),
    followUps: (id: string) => apiFetch<unknown[]>(`/api/patients/${id}/follow-ups`),
    vitals: (id: string) => apiFetch<unknown[]>(`/api/patients/${id}/vitals`),
  },

  // Appointments
  appointments: {
    list: (params?: Record<string, string>) => {
      const qs = buildQuery(params);
      return apiFetch<unknown[]>(`/api/appointments${qs}`);
    },
    get: (id: string) => apiFetch<unknown>(`/api/appointments/${id}`),
    create: (data: Record<string, unknown>) => apiFetch<unknown>("/api/appointments", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: Record<string, unknown>) => apiFetch<unknown>(`/api/appointments/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    checkIn: (id: string) => apiFetch<unknown>(`/api/appointments/${id}/check-in`, { method: "POST" }),
    checkInPayment: (
      appointmentId: string,
      payload: {
        mode: "pay" | "skip" | "draft";
        items?: Array<{ description: string; quantity: number; unitPrice: number; treatmentId?: string | null }>;
        discount?: number;
        tax?: number;
        amountPaid?: number;
        paymentMethod?: "CASH" | "CARD" | "CHEQUE" | "BANK_TRANSFER" | "DIGITAL_WALLET" | "INSURANCE";
        paymentReference?: string;
        notes?: string;
      },
    ) =>
      apiFetch<unknown>(`/api/appointments/${appointmentId}/check-in-payment`, {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    checkout: (id: string) => apiFetch<unknown>(`/api/appointments/${id}/checkout`, { method: "POST" }),
    calendar: (params?: Record<string, string>) => {
      const qs = buildQuery(params);
      return apiFetch<unknown>(`/api/appointments/calendar${qs}`);
    },
  },

  // Billing
  billing: {
    invoices: (params?: Record<string, string>) => {
      const qs = buildQuery(params);
      return apiFetch<unknown[]>(`/api/billing/invoices${qs}`);
    },
    invoice: (id: string) => apiFetch<unknown>(`/api/billing/invoices/${id}`),
    createInvoice: (data: Record<string, unknown>) => apiFetch<unknown>("/api/billing/invoices", { method: "POST", body: JSON.stringify(data) }),
    payments: (params?: Record<string, string>) => {
      const qs = buildQuery(params);
      return apiFetch<unknown[]>(`/api/billing/payments${qs}`);
    },
    pay: (data: Record<string, unknown>) => apiFetch<unknown>("/api/billing/payments", { method: "POST", body: JSON.stringify(data) }),

    // Petty cash + closings + reports — power the daily/monthly billing
    // report flow under /billing/reports.
    pettyCash: {
      list: (params?: Record<string, string>) => {
        const qs = buildQuery(params);
        return apiFetch<unknown[]>(`/api/billing/petty-cash${qs}`);
      },
      create: (data: Record<string, unknown>) =>
        apiFetch<unknown>("/api/billing/petty-cash", { method: "POST", body: JSON.stringify(data) }),
      remove: (id: string) =>
        apiFetch<unknown>(`/api/billing/petty-cash/${id}`, { method: "DELETE" }),
    },
    closings: {
      list: (params?: Record<string, string>) => {
        const qs = buildQuery(params);
        return apiFetch<unknown[]>(`/api/billing/closings${qs}`);
      },
      get: (id: string) => apiFetch<unknown>(`/api/billing/closings/${id}`),
      close: (data: Record<string, unknown>) =>
        apiFetch<unknown>("/api/billing/closings", { method: "POST", body: JSON.stringify(data) }),
      reopen: (id: string) =>
        apiFetch<unknown>(`/api/billing/closings/${id}`, { method: "DELETE" }),
    },
    reports: {
      daily: (params: Record<string, string>) => {
        const qs = buildQuery(params);
        return apiFetch<unknown>(`/api/billing/reports/daily${qs}`);
      },
      monthly: (params: Record<string, string>) => {
        const qs = buildQuery(params);
        return apiFetch<unknown>(`/api/billing/reports/monthly${qs}`);
      },
    },
  },

  // Treatments & Packages
  treatments: {
    list: (params?: Record<string, string>) => {
      const qs = buildQuery(params);
      return apiFetch<unknown[]>(`/api/treatments${qs}`);
    },
    get: (id: string) => apiFetch<unknown>(`/api/treatments/${id}`),
    create: (data: Record<string, unknown>) => apiFetch<unknown>("/api/treatments", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: Record<string, unknown>) =>
      apiFetch<unknown>(`/api/treatments/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    remove: (id: string) =>
      apiFetch<unknown>(`/api/treatments/${id}`, { method: "DELETE" }),
  },
  packages: {
    list: () => apiFetch<unknown[]>("/api/packages"),
    get: (id: string) => apiFetch<unknown>(`/api/packages/${id}`),
    create: (data: Record<string, unknown>) => apiFetch<unknown>("/api/packages", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: Record<string, unknown>) =>
      apiFetch<unknown>(`/api/packages/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    remove: (id: string) =>
      apiFetch<unknown>(`/api/packages/${id}`, { method: "DELETE" }),
  },

  // Call Center
  leads: {
    list: (params?: Record<string, string>) => {
      const qs = buildQuery(params);
      return apiFetch<unknown[]>(`/api/leads${qs}`);
    },
    get: (id: string) => apiFetch<unknown>(`/api/leads/${id}`),
    create: (data: Record<string, unknown>) => apiFetch<unknown>("/api/leads", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: Record<string, unknown>) => apiFetch<unknown>(`/api/leads/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  },
  callLogs: {
    list: () => apiFetch<unknown[]>("/api/call-logs"),
    create: (data: Record<string, unknown>) => apiFetch<unknown>("/api/call-logs", { method: "POST", body: JSON.stringify(data) }),
  },

  // Rooms
  rooms: {
    list: (params?: Record<string, string>) => {
      const qs = buildQuery(params);
      return apiFetch<unknown[]>(`/api/rooms${qs}`);
    },
    create: (data: Record<string, unknown>) =>
      apiFetch<unknown>("/api/rooms", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: Record<string, unknown>) =>
      apiFetch<unknown>(`/api/rooms/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    delete: (id: string) =>
      apiFetch<unknown>(`/api/rooms/${id}`, { method: "DELETE" }),
  },

  // Lab Tests
  labTests: {
    list: (params?: Record<string, string>) => {
      const qs = buildQuery(params);
      return apiFetch<unknown[]>(`/api/lab-tests${qs}`);
    },
    get: (id: string) => apiFetch<unknown>(`/api/lab-tests/${id}`),
    create: (data: Record<string, unknown>) => apiFetch<unknown>("/api/lab-tests", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: Record<string, unknown>) =>
      apiFetch<unknown>(`/api/lab-tests/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  },

  // Follow-ups
  followUps: {
    list: (params?: Record<string, string>) => {
      const qs = buildQuery(params);
      return apiFetch<unknown[]>(`/api/follow-ups${qs}`);
    },
    update: (id: string, data: Record<string, unknown>) => apiFetch<unknown>(`/api/follow-ups/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    create: (data: Record<string, unknown>) => apiFetch<unknown>("/api/follow-ups", { method: "POST", body: JSON.stringify(data) }),
  },

  // Dashboard
  dashboard: {
    stats: (role?: string) => apiFetch<unknown>(`/api/dashboard/stats${role ? "?role=" + role : ""}`),
  },

  // Read-only staff list for any authenticated role (filters, booking pickers).
  // Use api.admin.users() instead when you need full admin fields.
  users: (params?: Record<string, string>) => {
    const qs = buildQuery(params);
    return apiFetch<unknown[]>(`/api/users${qs}`);
  },

  // Read-only branch list, same role-permissive pattern as users().
  // /api/admin/branches is the admin-mutation surface; /api/branches is
  // the public-read mirror used by booking pickers, branch filters, etc.
  branches: (params?: Record<string, string>) => {
    const qs = buildQuery(params);
    return apiFetch<unknown[]>(`/api/branches${qs}`);
  },

  // Phone control: dashboard sends Answer / Hang up / Click-to-dial
  // commands to a logged-in agent's companion phone via the per-agent
  // queue at /api/calls/control/[agentId]. The phone short-polls
  // /api/calls/control/poll and dispatches to TelecomManager.
  calls: {
    control: (agentId: string, action: "answer" | "hangup" | "dial", number?: string) =>
      apiFetch<unknown>(`/api/calls/control/${agentId}`, {
        method: "POST",
        body: JSON.stringify(number ? { action, number } : { action }),
      }),
  },

  // Self-service (the bare `me` above is the cookie-session getter)
  account: {
    changePassword: (currentPassword: string, newPassword: string) =>
      apiFetch<unknown>("/api/users/me/password", {
        method: "POST",
        body: JSON.stringify({ currentPassword, newPassword }),
      }),
  },

  // Admin
  admin: {
    users: () => apiFetch<unknown[]>("/api/admin/users"),
    createUser: (data: Record<string, unknown>) => apiFetch<unknown>("/api/admin/users", { method: "POST", body: JSON.stringify(data) }),
    resetUserPassword: (userId: string, newPassword: string) =>
      apiFetch<unknown>(`/api/admin/users/${userId}/password`, {
        method: "POST",
        body: JSON.stringify({ newPassword }),
      }),
    setUserActive: (userId: string, isActive: boolean) =>
      apiFetch<unknown>(`/api/admin/users/${userId}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive }),
      }),
    updateUser: (userId: string, data: Record<string, unknown>) =>
      apiFetch<unknown>(`/api/admin/users/${userId}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    branches: () => apiFetch<unknown[]>("/api/admin/branches"),
    getBranch: (id: string) => apiFetch<unknown>(`/api/admin/branches/${id}`),
    createBranch: (data: Record<string, unknown>) => apiFetch<unknown>("/api/admin/branches", { method: "POST", body: JSON.stringify(data) }),
    updateBranch: (id: string, data: Record<string, unknown>) =>
      apiFetch<unknown>(`/api/admin/branches/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    deleteBranch: (id: string) =>
      apiFetch<unknown>(`/api/admin/branches/${id}`, { method: "DELETE" }),
    auditLog: (params?: Record<string, string>) => {
      const qs = buildQuery(params);
      return apiFetch<unknown[]>(`/api/admin/audit-log${qs}`);
    },
  },

  // Notifications
  notifications: {
    list: () => apiFetch<unknown>("/api/notifications"),
    markRead: (ids: string[]) => apiFetch<unknown>("/api/notifications", { method: "PUT", body: JSON.stringify({ ids }) }),
  },

  // AI
  ai: {
    transcribe: (data: Record<string, unknown>) => apiFetch<unknown>("/api/ai/transcribe", { method: "POST", body: JSON.stringify(data) }),
    summarize: (data: Record<string, unknown>) => apiFetch<unknown>("/api/ai/summarize", { method: "POST", body: JSON.stringify(data) }),
  },
};
