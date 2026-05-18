// ============================================================
// MediCore ERP - Type Definitions
// ============================================================

export enum UserRole {
  SUPER_ADMIN = "SUPER_ADMIN",
  ADMIN = "ADMIN",
  DOCTOR = "DOCTOR",
  RECEPTIONIST = "RECEPTIONIST",
  BILLING = "BILLING",
  CALL_CENTER = "CALL_CENTER",
  ASSISTANT = "ASSISTANT",
  AESTHETICIAN = "AESTHETICIAN",
  OPERATOR = "OPERATOR",
}

export enum Gender {
  MALE = "MALE",
  FEMALE = "FEMALE",
  OTHER = "OTHER",
}

export enum AppointmentType {
  CONSULTATION = "CONSULTATION",
  PROCEDURE = "PROCEDURE",
  FOLLOW_UP = "FOLLOW_UP",
  REVIEW = "REVIEW",
  EMERGENCY = "EMERGENCY",
}

export enum AppointmentStatus {
  SCHEDULED = "SCHEDULED",
  CONFIRMED = "CONFIRMED",
  CHECKED_IN = "CHECKED_IN",
  WAITING = "WAITING",
  IN_PROGRESS = "IN_PROGRESS",
  COMPLETED = "COMPLETED",
  CANCELLED = "CANCELLED",
  NO_SHOW = "NO_SHOW",
  RESCHEDULED = "RESCHEDULED",
}

export enum Priority {
  NORMAL = "NORMAL",
  URGENT = "URGENT",
  EMERGENCY = "EMERGENCY",
}

export enum InvoiceStatus {
  DRAFT = "DRAFT",
  PENDING = "PENDING",
  PAID = "PAID",
  PARTIAL = "PARTIAL",
  OVERDUE = "OVERDUE",
  CANCELLED = "CANCELLED",
  REFUNDED = "REFUNDED",
}

export enum PaymentMethod {
  CASH = "CASH",
  CARD = "CARD",
  CHEQUE = "CHEQUE",
  BANK_TRANSFER = "BANK_TRANSFER",
  DIGITAL_WALLET = "DIGITAL_WALLET",
  INSURANCE = "INSURANCE",
  PACKAGE_DEDUCTION = "PACKAGE_DEDUCTION",
}

export enum LeadStatus {
  NEW = "NEW",
  CONTACTED = "CONTACTED",
  INTERESTED = "INTERESTED",
  BOOKED = "BOOKED",
  NOT_INTERESTED = "NOT_INTERESTED",
  FOLLOW_UP = "FOLLOW_UP",
}

export enum LeadSource {
  CALL = "CALL",
  WALK_IN = "WALK_IN",
  WEBSITE = "WEBSITE",
  SOCIAL_MEDIA = "SOCIAL_MEDIA",
  REFERRAL = "REFERRAL",
}

export enum TreatmentCategory {
  LASER = "LASER",
  CHEMICAL_PEEL = "CHEMICAL_PEEL",
  FACIAL = "FACIAL",
  INJECTABLE = "INJECTABLE",
  SURGICAL = "SURGICAL",
  OTHER = "OTHER",
}

export enum TaxCategory {
  MEDICAL = "MEDICAL",
  COSMETIC = "COSMETIC",
  SLIMMING = "SLIMMING",
}

export enum WorkflowStage {
  INQUIRY = "INQUIRY",
  BOOKED = "BOOKED",
  CHECKIN = "CHECKIN",
  WAITING = "WAITING",
  CONSULT = "CONSULT",
  DIAGNOSIS = "DIAGNOSIS",
  TREATMENT = "TREATMENT",
  PRESCRIPTION = "PRESCRIPTION",
  BILLING = "BILLING",
  PAYMENT = "PAYMENT",
  CHECKOUT = "CHECKOUT",
  FOLLOWUP = "FOLLOWUP",
  HISTORY_UPDATE = "HISTORY_UPDATE",
}

export enum LabTestStatus {
  REQUESTED = "REQUESTED",
  SAMPLE_COLLECTED = "SAMPLE_COLLECTED",
  PROCESSING = "PROCESSING",
  COMPLETED = "COMPLETED",
  CANCELLED = "CANCELLED",
}

export enum DocumentType {
  REPORT = "REPORT",
  IMAGE = "IMAGE",
  CONSENT = "CONSENT",
  PRESCRIPTION = "PRESCRIPTION",
  LAB_RESULT = "LAB_RESULT",
  BEFORE_AFTER = "BEFORE_AFTER",
  OTHER = "OTHER",
}

export enum RoomType {
  CONSULTATION = "CONSULTATION",
  PROCEDURE = "PROCEDURE",
  WAITING = "WAITING",
  RECOVERY = "RECOVERY",
}

export enum RoomStatus {
  AVAILABLE = "AVAILABLE",
  OCCUPIED = "OCCUPIED",
  CLEANING = "CLEANING",
  MAINTENANCE = "MAINTENANCE",
}

// ---- Interfaces ----

export interface Branch {
  id: string;
  name: string;
  // Short, unique branch identifier — surfaced on receipts and audit logs.
  code: string;
  address: string;
  phone: string;
  email: string;
  // IANA timezone string — defaults to Asia/Karachi at the schema level.
  timezone?: string;
  isActive: boolean;
  createdAt: string;
  // Joined by the admin list/get endpoints.
  _count?: {
    users?: number;
    patients?: number;
    rooms?: number;
    appointments?: number;
    invoices?: number;
  };
}

export interface User {
  id: string;
  email: string;
  name: string;
  phone?: string | null;
  avatar?: string | null;
  role: UserRole;
  branchId: string;
  // Doctor-only metadata.
  speciality?: string | null;
  licenseNumber?: string | null;
  // Prisma serializes Decimal as string over the wire — accept both.
  consultationFee?: number | string | null;
  isActive: boolean;
  // The API field name is lastLoginAt; keep the legacy lastLogin alias
  // optional so older code/mocks still typecheck.
  lastLoginAt?: string | null;
  /** @deprecated use lastLoginAt — older mock data still uses this name. */
  lastLogin?: string;
  createdAt: string;
  // Joined by /api/admin/users — the page should render branch.name + code,
  // not the legacy flat branchName.
  branch?: { id: string; name: string; code?: string | null } | null;
  /** @deprecated mock-data only; the API never returns this. Read branch.name instead. */
  branchName?: string;
}

export interface Patient {
  id: string;
  patientCode: string;
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
  // Optional at intake — walk-in / urgent registrations frequently come in
  // without confirmed DOB. Display sites use computeAge() which already
  // returns null for null/missing input.
  dateOfBirth?: string | null;
  // The API does not compute this — it's optional on the wire and pages
  // should derive it from dateOfBirth via lib/utils.computeAge() when shown.
  age?: number;
  gender: Gender;
  address?: string | null;
  city?: string | null;
  emergencyContact?: string | null;
  emergencyPhone?: string | null;
  bloodType?: string | null;
  branchId: string;
  // Joined by /api/patients/:id — render branch.name (+ optional code) here.
  branch?: { id: string; name: string; code?: string | null } | null;
  /** @deprecated API returns nested branch — kept for mocks. */
  branchName?: string;
  assignedDoctorId?: string | null;
  // Joined by /api/patients/:id — render assignedDoctor.name here.
  assignedDoctor?: { id: string; name: string; speciality?: string | null; avatar?: string | null } | null;
  /** @deprecated API returns nested assignedDoctor — kept for mocks. */
  assignedDoctorName?: string;
  profileImage?: string | null;
  notes?: string | null;
  isActive: boolean;
  // The API returns full PatientAllergy[] from the relation; older mock data
  // shipped flat strings. Accept both shapes — pages should defensively
  // normalize via the `.allergen` field when present.
  allergies?: Array<PatientAllergy | string> | null;
  medications?: PatientMedication[] | null;
  skinType?: string | null;
  lastVisit?: string;
  nextAppointment?: string;
  outstandingBalance?: number;
  createdAt: string;
}

export type Severity = "MILD" | "MODERATE" | "SEVERE";

export interface PatientAllergy {
  id: string;
  allergen: string;
  severity: Severity;
  reaction?: string | null;
  notes?: string | null;
}

export interface PatientMedication {
  id: string;
  name: string;
  dosage?: string | null;
  frequency?: string | null;
  prescriber?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  isActive: boolean;
}

export interface Appointment {
  id: string;
  appointmentCode: string;
  patientId: string;
  patientName: string;
  doctorId: string;
  doctorName: string;
  branchId: string;
  branchName?: string;
  roomId?: string;
  roomName?: string;
  date: string;
  startTime: string;
  endTime: string;
  type: AppointmentType;
  status: AppointmentStatus;
  notes?: string;
  priority: Priority;
  waitlistPosition?: number;
  checkinTime?: string;
  checkoutTime?: string;
  workflowStage: WorkflowStage;
  createdBy: string;
  createdAt: string;
}

export interface ConsultationNote {
  id: string;
  appointmentId: string;
  patientId: string;
  doctorId: string;
  doctorName: string;
  chiefComplaint: string;
  symptoms: string;
  examination: string;
  diagnosis: string;
  treatmentPlan: string;
  advice: string;
  followUpDate?: string;
  followUpNotes?: string;
  isSigned?: boolean;
  signedAt?: string;
  createdAt: string;
}

export interface Treatment {
  id: string;
  name: string;
  // Optional human-readable code from the catalog (e.g. TRT-001).
  code?: string | null;
  category: TreatmentCategory;
  // Tax bracket — drives the per-line tax rate at invoice time.
  taxCategory: TaxCategory;
  description?: string | null;
  duration: number;
  // Prisma serializes Decimal as string over the wire — accept both shapes.
  basePrice: number | string;
  preInstructions?: string | null;
  postInstructions?: string | null;
  contraindications?: string | null;
  isActive: boolean;
  // Branch availability — one row per (treatment, branch) pair from the
  // TreatmentBranch join. Empty array = "not offered anywhere" (degenerate);
  // the form UI guards against it but the schema allows it.
  branches?: Array<{ branchId: string }>;
  // Usage stats joined by the list/get endpoints; rendered in the catalog UI.
  _count?: {
    procedures?: number;
    invoiceItems?: number;
    packageTreatments?: number;
    appointments?: number;
  };
}

export interface Procedure {
  id: string;
  appointmentId: string;
  patientId: string;
  doctorId: string;
  doctorName: string;
  treatmentId: string;
  treatmentName: string;
  notes: string;
  outcome?: string;
  complications?: string;
  beforeImages: string[];
  afterImages: string[];
  performedAt?: string;
}

export interface Prescription {
  id: string;
  patientId: string;
  doctorId: string;
  doctorName: string;
  appointmentId?: string;
  items: PrescriptionItem[];
  notes?: string;
  createdAt: string;
}

export interface PrescriptionItem {
  id: string;
  medicineName: string;
  dosage: string;
  frequency: string;
  duration: string;
  instructions: string;
}

export interface LabTest {
  id: string;
  patientId: string;
  patientName?: string;
  doctorId: string;
  doctorName?: string;
  appointmentId?: string;
  testName: string;
  status: LabTestStatus;
  results?: Record<string, unknown>;
  technician?: string;
  collectedAt?: string;
  completedAt?: string;
  notes?: string;
  createdAt: string;
}

export interface PatientDocument {
  id: string;
  patientId: string;
  name: string;
  type: DocumentType;
  fileUrl: string;
  fileSize: number;
  uploadedById: string;
  uploadedByName?: string;
  notes?: string;
  createdAt: string;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  patientId: string;
  patientName: string;
  appointmentId?: string;
  branchId: string;
  items: InvoiceItem[];
  subtotal: number;
  discount: number;
  discountType: "PERCENTAGE" | "FIXED";
  tax: number;
  total: number;
  // Cumulative paid amount + remaining balance, both from prisma.invoice.
  // Type is `number | string` because Prisma serializes Decimal columns
  // as strings in the JSON response — callers should coerce.
  amountPaid?: number | string;
  balanceDue?: number | string;
  status: InvoiceStatus;
  dueDate: string;
  notes?: string;
  payments: Payment[];
  createdById: string;
  createdAt: string;
}

export interface InvoiceItem {
  id?: string; // populated by DB; not required on client-side mock
  description: string;
  quantity: number;
  unitPrice: number;
  discount?: number;
  tax?: number;
  total: number;
  treatmentId?: string | null;
  productId?: string | null;
  packageId?: string | null;
}

export interface Payment {
  id: string;
  invoiceId: string;
  amount: number;
  method: PaymentMethod;
  reference?: string;
  status: "PENDING" | "COMPLETED" | "FAILED" | "REFUNDED";
  processedById: string;
  processedByName?: string;
  processedAt: string;
  createdAt: string;
}

export interface Package {
  id: string;
  name: string;
  description?: string | null;
  treatments: PackageTreatment[];
  // Prisma serializes Decimal as a string over the wire — accept both.
  price: number | string;
  validityDays: number;
  maxRedemptions?: number | null;
  isActive: boolean;
  createdAt: string;
  // Branch availability — one row per (package, branch) pair from the
  // PackageBranch join.
  branches?: Array<{ branchId: string }>;
  // Joined by the list/get endpoints; rendered on the catalog UI.
  _count?: {
    patientPackages?: number;
    invoiceItems?: number;
  };
  /** @deprecated mock-data only; the API never returns this. Read _count.patientPackages instead. */
  subscriberCount?: number;
}

export interface PackageTreatment {
  id?: string; // populated by DB; not required on client-side mock
  name: string;
  sessions: number;
  treatmentId?: string | null;
  // Joined by the package endpoints when an underlying Treatment row exists.
  treatment?: { id: string; name: string; code?: string | null } | null;
}

export interface PatientPackage {
  id: string;
  patientId: string;
  packageId: string;
  packageName: string;
  purchaseDate: string;
  expiryDate: string;
  remainingSessions: Record<string, number>;
  status: "ACTIVE" | "EXPIRED" | "CANCELLED";
  invoiceId?: string;
}

export interface Lead {
  id: string;
  name: string;
  phone: string;
  email?: string;
  source: LeadSource;
  status: LeadStatus;
  interest?: string;
  assignedToId: string;
  assignedToName?: string;
  branchId: string;
  notes?: string;
  convertedPatientId?: string;
  callbackDate?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CallLog {
  id: string;
  leadId?: string;
  patientId?: string;
  callerName: string;
  userId: string;
  agentName: string;
  type: "INBOUND" | "OUTBOUND";
  duration: number;
  notes?: string;
  outcome: "BOOKED" | "CALLBACK" | "NOT_INTERESTED" | "NO_ANSWER" | "INFO_PROVIDED";
  createdAt: string;
}

export interface CommunicationLog {
  id: string;
  patientId: string;
  type: "CALL" | "SMS" | "EMAIL" | "WHATSAPP";
  direction: "INBOUND" | "OUTBOUND";
  subject: string;
  content: string;
  sentById: string;
  sentByName?: string;
  createdAt: string;
}

export interface FollowUp {
  id: string;
  patientId: string;
  patientName: string;
  doctorId: string;
  doctorName: string;
  appointmentId?: string;
  dueDate: string;
  reason: string;
  status: "PENDING" | "COMPLETED" | "MISSED" | "CANCELLED";
  notes?: string;
  completedAt?: string;
  createdAt: string;
}

export interface AITranscription {
  id: string;
  appointmentId: string;
  patientId: string;
  patientName: string;
  doctorId: string;
  doctorName: string;
  rawTranscript: string;
  structuredNote?: Record<string, unknown>;
  summary?: string;
  status: "RECORDING" | "PROCESSING" | "COMPLETED" | "FAILED";
  duration: number;
  createdAt: string;
}

export interface Notification {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: "APPOINTMENT" | "BILLING" | "LAB" | "FOLLOW_UP" | "SYSTEM" | "ALERT";
  isRead: boolean;
  link?: string;
  createdAt: string;
}

export interface Vitals {
  id: string;
  patientId: string;
  patientName?: string;
  appointmentId?: string;
  temperature?: number;
  systolicBP?: number;
  diastolicBP?: number;
  heartRate?: number;
  respiratoryRate?: number;
  weight?: number;
  height?: number;
  oxygenSaturation?: number;
  bmi?: string;
  notes?: string;
  skinObservations?: string;
  urgencyLevel?: "NORMAL" | "URGENT" | "EMERGENCY";
  recordedById: string;
  recordedByName?: string;
  createdAt: string;
}

export interface Room {
  id: string;
  branchId: string;
  name: string;
  type: RoomType;
  status: RoomStatus;
  isAvailable: boolean;
  capacity: number;
  currentPatientId?: string;
  currentPatientName?: string;
  currentDoctorName?: string;
  occupiedSince?: string;
}

export interface RoomAllocation {
  id: string;
  patientId: string;
  patientName: string;
  roomId: string;
  roomName: string;
  doctorId: string;
  doctorName: string;
  bedNumber?: string;
  admissionDate: string;
  dischargeDate?: string;
  status: "ACTIVE" | "DISCHARGED";
}

export interface AuditLog {
  id: string;
  userId: string;
  userName: string;
  action: string;
  module: string;
  entityType: string;
  entityId: string;
  details?: string;
  ipAddress: string;
  createdAt: string;
}

export interface SkinHistory {
  id: string;
  patientId: string;
  condition: string;
  affectedArea: string;
  severity: "MILD" | "MODERATE" | "SEVERE";
  onsetDate: string;
  treatmentHistory: string;
  notes: string;
  images: string[];
}

export interface MedicalHistory {
  id: string;
  patientId: string;
  condition: string;
  diagnosedDate: string;
  status: "ACTIVE" | "RESOLVED" | "CHRONIC";
  notes: string;
}

export interface Insurance {
  id: string;
  patientId: string;
  provider: string;
  policyNumber: string;
  coverageType: string;
  expiryDate: string;
  isActive: boolean;
}

// ---- Permission System ----
export interface Permission {
  id: string;
  module: string;
  action: "VIEW" | "CREATE" | "EDIT" | "DELETE" | "EXPORT";
  granted: boolean;
}

export interface RolePermissions {
  role: UserRole;
  permissions: Permission[];
}

// ---- Dashboard Types ----
export interface DashboardStat {
  id: string;
  label: string;
  value: string | number;
  icon: string;
  trend?: number;
  trendLabel?: string;
  color: "primary" | "success" | "warning" | "danger" | "info";
}

export interface ActivityItem {
  id: string;
  user: string;
  action: string;
  target: string;
  time: string;
  type: string;
}

// ---- API Response Types ----
export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
