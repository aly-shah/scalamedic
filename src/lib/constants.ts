// ============================================================
// MediCore ERP - System Constants & IDs
// ============================================================

// ---- Design Tokens (Warm Clinic Palette) ----
export const colors = {
  primary: "#0D9488",       // Teal-600
  primaryLight: "#CCFBF1",  // Teal-100
  accent: "#6366F1",        // Indigo (AI features)
  accentLight: "#EEF2FF",
  success: "#10B981",       // Emerald
  successLight: "#ECFDF5",
  warning: "#F59E0B",       // Amber
  warningLight: "#FFFBEB",
  danger: "#EF4444",        // Red
  dangerLight: "#FEF2F2",
  info: "#3B82F6",          // Sky
  infoLight: "#EFF6FF",
  bg: "#FAFAF9",            // Stone-50 (warm off-white)
  surface: "#FFFFFF",
  textPrimary: "#1C1917",   // Stone-900
  textSecondary: "#78716C", // Stone-500
  textMuted: "#A8A29E",     // Stone-400
  border: "#E7E5E4",        // Stone-200
  borderLight: "#F5F5F4",   // Stone-100
  sidebar: "#FFFFFF",
  sidebarHover: "#F0FDFA",  // Teal-50
  sidebarActive: "#0D9488", // Teal-600
} as const;

// ---- System Module IDs ----
export const MODULE_IDS = {
  // Auth
  AUTH_LOGIN: "AUTH-LOGIN",
  AUTH_ROLE_MGMT: "AUTH-ROLE-MGMT",
  AUTH_PERMISSION_MGMT: "AUTH-PERMISSION-MGMT",
  AUTH_AUDIT_LOG: "AUTH-AUDIT-LOG",

  // Dashboards
  DASH_ADMIN: "DASH-ADMIN",
  DASH_DOCTOR: "DASH-DOCTOR",
  DASH_RECEPTION: "DASH-RECEPTION",
  DASH_BILLING: "DASH-BILLING",
  DASH_CALLCENTER: "DASH-CALLCENTER",
  DASH_ASSISTANT: "DASH-ASSISTANT",

  // Patient
  PATIENT_LIST: "PATIENT-LIST",
  PATIENT_PROFILE: "PATIENT-PROFILE",
  PATIENT_PROFILE_CREATE: "PATIENT-PROFILE-CREATE",
  PATIENT_PROFILE_EDIT: "PATIENT-PROFILE-EDIT",
  PATIENT_TAB_OVERVIEW: "PATIENT-TAB-OVERVIEW",
  PATIENT_TAB_APPOINTMENTS: "PATIENT-TAB-APPOINTMENTS",
  PATIENT_TAB_MEDICAL_HISTORY: "PATIENT-TAB-MEDICAL-HISTORY",
  PATIENT_TAB_SKIN_HISTORY: "PATIENT-TAB-SKIN-HISTORY",
  PATIENT_TAB_NOTES: "PATIENT-TAB-NOTES",
  PATIENT_TAB_PROCEDURES: "PATIENT-TAB-PROCEDURES",
  PATIENT_TAB_PRESCRIPTIONS: "PATIENT-TAB-PRESCRIPTIONS",
  PATIENT_TAB_IMAGES: "PATIENT-TAB-IMAGES",
  PATIENT_TAB_LABS: "PATIENT-TAB-LABS",
  PATIENT_TAB_DOCS: "PATIENT-TAB-DOCS",
  PATIENT_TAB_BILLING: "PATIENT-TAB-BILLING",
  PATIENT_TAB_PACKAGES: "PATIENT-TAB-PACKAGES",
  PATIENT_TAB_COMMS: "PATIENT-TAB-COMMS",
  PATIENT_TAB_FOLLOWUPS: "PATIENT-TAB-FOLLOWUPS",
  PATIENT_TAB_AI_TRANSCRIPTS: "PATIENT-TAB-AI-TRANSCRIPTS",

  // Appointments
  APPT_LIST: "APPT-LIST",
  APPT_CALENDAR: "APPT-CALENDAR",
  APPT_CREATE: "APPT-CREATE",
  APPT_CHECKIN: "APPT-CHECKIN",
  APPT_RESCHEDULE: "APPT-RESCHEDULE",
  APPT_CANCEL: "APPT-CANCEL",
  APPT_WAITLIST: "APPT-WAITLIST",
  APPT_ROOM_ALLOCATE: "APPT-ROOM-ALLOCATE",
  APPT_CHECKOUT: "APPT-CHECKOUT",

  // Workflow
  FLOW_INQUIRY: "FLOW-INQUIRY",
  FLOW_BOOKED: "FLOW-BOOKED",
  FLOW_CHECKIN: "FLOW-CHECKIN",
  FLOW_WAITING: "FLOW-WAITING",
  FLOW_CONSULT: "FLOW-CONSULT",
  FLOW_DIAGNOSIS: "FLOW-DIAGNOSIS",
  FLOW_TREATMENT: "FLOW-TREATMENT",
  FLOW_PRESCRIPTION: "FLOW-PRESCRIPTION",
  FLOW_BILLING: "FLOW-BILLING",
  FLOW_PAYMENT: "FLOW-PAYMENT",
  FLOW_CHECKOUT: "FLOW-CHECKOUT",
  FLOW_FOLLOWUP: "FLOW-FOLLOWUP",
  FLOW_HISTORY_UPDATE: "FLOW-HISTORY-UPDATE",

  // Billing
  BILL_INVOICE: "BILL-INVOICE",
  BILL_CREATE: "BILL-CREATE",
  BILL_PAYMENT: "BILL-PAYMENT",
  BILL_RECEIPT: "BILL-RECEIPT",
  BILL_DISCOUNT: "BILL-DISCOUNT",
  BILL_REFUND: "BILL-REFUND",
  BILL_PACKAGE: "BILL-PACKAGE",
  BILL_INSURANCE: "BILL-INSURANCE",
  BILL_DUE: "BILL-DUE",

  // AI
  AI_TRANSCRIBE: "AI-TRANSCRIBE",
  AI_TRANSCRIBE_START: "AI-TRANSCRIBE-START",
  AI_NOTE_SUMMARY: "AI-NOTE-SUMMARY",
  AI_HISTORY_SUMMARY: "AI-HISTORY-SUMMARY",
  AI_FOLLOWUP_SUGGEST: "AI-FOLLOWUP-SUGGEST",
  AI_SCHEDULE_OPTIMIZER: "AI-SCHEDULE-OPTIMIZER",
  AI_RECORD_SEARCH: "AI-RECORD-SEARCH",
  AI_VOICE_TO_NOTE: "AI-VOICE-TO-NOTE",

  // History
  HIST_MEDICAL: "HIST-MEDICAL",
  HIST_SKIN: "HIST-SKIN",
  HIST_PROCEDURE: "HIST-PROCEDURE",
  HIST_ALLERGY: "HIST-ALLERGY",
  HIST_MEDS: "HIST-MEDS",
  HIST_IMAGES: "HIST-IMAGES",
  HIST_CONSENTS: "HIST-CONSENTS",
  HIST_PROGRESS: "HIST-PROGRESS",

  // Call Center
  CALL_LOOKUP: "CALL-LOOKUP",
  CALL_NEW_LEAD: "CALL-NEW-LEAD",
  CALL_CALLBACK: "CALL-CALLBACK",
  CALL_BOOKING: "CALL-BOOKING",
  CALL_CONVERSION: "CALL-CONVERSION",
  CALL_NOTES: "CALL-NOTES",

  // Admin
  ADMIN_USERS: "ADMIN-USERS",
  ADMIN_ROLES: "ADMIN-ROLES",
  ADMIN_BRANCHES: "ADMIN-BRANCHES",
  ADMIN_TREATMENTS: "ADMIN-TREATMENTS",
  ADMIN_SCHEDULES: "ADMIN-SCHEDULES",
  ADMIN_BILLING_RULES: "ADMIN-BILLING-RULES",
  ADMIN_PACKAGES: "ADMIN-PACKAGES",
  ADMIN_NOTIFICATIONS: "ADMIN-NOTIFICATIONS",
  ADMIN_AUDIT: "ADMIN-AUDIT",
  ADMIN_SETTINGS: "ADMIN-SETTINGS",
  ADMIN_REPORTS: "ADMIN-REPORTS",

  // Mobile App
  APP_DOCTOR: "APP-DOCTOR",
  APP_RECEPTION: "APP-RECEPTION",
  APP_PATIENT: "APP-PATIENT",
  APP_NOTIFICATIONS: "APP-NOTIFICATIONS",
  APP_REMINDERS: "APP-REMINDERS",
} as const;

// ---- Status Mappings ----
export const appointmentStatusColors: Record<string, string> = {
  SCHEDULED: "default",
  CONFIRMED: "info",
  CHECKED_IN: "success",
  WAITING: "warning",
  IN_PROGRESS: "info",
  COMPLETED: "success",
  CANCELLED: "danger",
  NO_SHOW: "danger",
  RESCHEDULED: "warning",
};

export const invoiceStatusColors: Record<string, string> = {
  DRAFT: "default",
  PENDING: "warning",
  PAID: "success",
  PARTIAL: "info",
  OVERDUE: "danger",
  CANCELLED: "default",
  REFUNDED: "danger",
};

export const leadStatusColors: Record<string, string> = {
  NEW: "info",
  CONTACTED: "warning",
  INTERESTED: "success",
  BOOKED: "success",
  NOT_INTERESTED: "default",
  FOLLOW_UP: "warning",
};

export const priorityColors: Record<string, string> = {
  NORMAL: "default",
  URGENT: "warning",
  EMERGENCY: "danger",
};

// ---- Role Labels ----
export const roleLabels: Record<string, string> = {
  SUPER_ADMIN: "Super Admin",
  ADMIN: "Admin",
  DOCTOR: "Doctor",
  RECEPTIONIST: "Receptionist",
  BILLING: "Billing & Accounts",
  CALL_CENTER: "Call Center",
  ASSISTANT: "Assistant / Nurse",
};

export const roleDashboardLabels: Record<string, string> = {
  SUPER_ADMIN: "Super Admin Panel",
  ADMIN: "Admin Panel",
  DOCTOR: "Doctor Panel",
  RECEPTIONIST: "Front Desk",
  BILLING: "Billing Panel",
  CALL_CENTER: "Call Center",
  ASSISTANT: "Clinical Assistant",
};

// ---- Appointment Types ----
export const appointmentTypeLabels: Record<string, string> = {
  CONSULTATION: "Consultation",
  PROCEDURE: "Procedure",
  FOLLOW_UP: "Follow-Up",
  REVIEW: "Review",
  EMERGENCY: "Emergency",
};

// ---- Treatment Categories ----
export const treatmentCategories = [
  { value: "LASER", label: "Laser Treatment" },
  { value: "CHEMICAL_PEEL", label: "Chemical Peel" },
  { value: "FACIAL", label: "Facial" },
  { value: "INJECTABLE", label: "Injectable" },
  { value: "SURGICAL", label: "Surgical" },
  { value: "OTHER", label: "Other" },
] as const;

// ---- Skin Types (Fitzpatrick Scale) ----
export const skinTypes = [
  { value: "TYPE_I", label: "Type I - Very Fair" },
  { value: "TYPE_II", label: "Type II - Fair" },
  { value: "TYPE_III", label: "Type III - Medium" },
  { value: "TYPE_IV", label: "Type IV - Olive" },
  { value: "TYPE_V", label: "Type V - Brown" },
  { value: "TYPE_VI", label: "Type VI - Dark" },
] as const;

// ---- Common Skin Conditions ----
export const skinConditions = [
  "Acne Vulgaris",
  "Melasma",
  "Rosacea",
  "Eczema",
  "Psoriasis",
  "Hyperpigmentation",
  "Fine Lines & Wrinkles",
  "Sun Damage",
  "Scarring",
  "Hair Loss (Alopecia)",
  "Dermatitis",
  "Vitiligo",
  "Keratosis",
  "Skin Tags",
  "Moles",
  "Warts",
] as const;

// ---- Visit Reasons ----
export const visitReasons = [
  "Acne Treatment",
  "Anti-aging Consultation",
  "Pigmentation Treatment",
  "Hair Loss Treatment",
  "Scar Treatment",
  "Skin Check / Screening",
  "Laser Treatment Session",
  "Chemical Peel Session",
  "Botox / Filler",
  "General Dermatology",
  "Follow-up Visit",
  "Post-procedure Review",
  "Other",
] as const;

// ---- Workflow Stages ----
export const workflowStages = [
  { id: "FLOW-INQUIRY", label: "Inquiry", icon: "phone" },
  { id: "FLOW-BOOKED", label: "Booked", icon: "calendar" },
  { id: "FLOW-CHECKIN", label: "Check-In", icon: "log-in" },
  { id: "FLOW-WAITING", label: "Waiting", icon: "clock" },
  { id: "FLOW-CONSULT", label: "Consultation", icon: "stethoscope" },
  { id: "FLOW-DIAGNOSIS", label: "Diagnosis", icon: "clipboard" },
  { id: "FLOW-TREATMENT", label: "Treatment", icon: "activity" },
  { id: "FLOW-PRESCRIPTION", label: "Prescription", icon: "pill" },
  { id: "FLOW-BILLING", label: "Billing", icon: "receipt" },
  { id: "FLOW-PAYMENT", label: "Payment", icon: "credit-card" },
  { id: "FLOW-CHECKOUT", label: "Checkout", icon: "log-out" },
  { id: "FLOW-FOLLOWUP", label: "Follow-Up", icon: "repeat" },
  { id: "FLOW-HISTORY-UPDATE", label: "Updated", icon: "check-circle" },
] as const;
