-- Schema Refinements v2: onDelete rules, missing indexes, blocked_slots relation, default timezone

-- =============================================
-- DEFAULT TIMEZONE: Asia/Karachi for Pakistan
-- =============================================
ALTER TABLE "branches" ALTER COLUMN "timezone" SET DEFAULT 'Asia/Karachi';

-- =============================================
-- MISSING INDEXES
-- =============================================

-- Payment: status and processedAt for billing queries
CREATE INDEX IF NOT EXISTS "payments_status_idx" ON "payments"("status");
CREATE INDEX IF NOT EXISTS "payments_processedAt_idx" ON "payments"("processedAt");

-- Product: expiryDate for expiry alerts
CREATE INDEX IF NOT EXISTS "products_expiryDate_idx" ON "products"("expiryDate");

-- =============================================
-- BLOCKED SLOTS: Add createdBy relation (was orphan FK)
-- =============================================

-- BlockedSlot.createdById FK (if table exists but FK missing)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'blocked_slots_createdById_fkey'
    AND table_name = 'blocked_slots'
  ) THEN
    ALTER TABLE "blocked_slots"
      ADD CONSTRAINT "blocked_slots_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "users"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- =============================================
-- ON DELETE RULES: Add FK constraints where missing
-- These use DO blocks to be idempotent (skip if FK already exists)
-- Strategy:
--   RESTRICT: clinical/financial records (prevent accidental cascade)
--   SET NULL: optional FKs
--   CASCADE: child records that should die with parent
-- =============================================

-- Helper: drop existing FK and re-create with onDelete rule
-- We only touch relations that don't have an explicit onDelete yet
-- Prisma's default is Restrict (no action), so we only need to add
-- SET NULL and CASCADE rules for optional/child FKs.

-- Appointment.roomId -> SET NULL (if room deleted, null out the FK)
ALTER TABLE "appointments" DROP CONSTRAINT IF EXISTS "appointments_roomId_fkey";
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_roomId_fkey"
  FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Prescription.appointmentId -> SET NULL
ALTER TABLE "prescriptions" DROP CONSTRAINT IF EXISTS "prescriptions_appointmentId_fkey";
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_appointmentId_fkey"
  FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- LabTest.appointmentId -> SET NULL
ALTER TABLE "lab_tests" DROP CONSTRAINT IF EXISTS "lab_tests_appointmentId_fkey";
ALTER TABLE "lab_tests" ADD CONSTRAINT "lab_tests_appointmentId_fkey"
  FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Invoice.appointmentId -> SET NULL
ALTER TABLE "invoices" DROP CONSTRAINT IF EXISTS "invoices_appointmentId_fkey";
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_appointmentId_fkey"
  FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- FollowUp.appointmentId -> SET NULL
ALTER TABLE "follow_ups" DROP CONSTRAINT IF EXISTS "follow_ups_appointmentId_fkey";
ALTER TABLE "follow_ups" ADD CONSTRAINT "follow_ups_appointmentId_fkey"
  FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Triage.appointmentId -> SET NULL
ALTER TABLE "triage_records" DROP CONSTRAINT IF EXISTS "triage_records_appointmentId_fkey";
ALTER TABLE "triage_records" ADD CONSTRAINT "triage_records_appointmentId_fkey"
  FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ConsentForm.appointmentId -> SET NULL
ALTER TABLE "consent_forms" DROP CONSTRAINT IF EXISTS "consent_forms_appointmentId_fkey";
ALTER TABLE "consent_forms" ADD CONSTRAINT "consent_forms_appointmentId_fkey"
  FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CallLog.leadId -> SET NULL
ALTER TABLE "call_logs" DROP CONSTRAINT IF EXISTS "call_logs_leadId_fkey";
ALTER TABLE "call_logs" ADD CONSTRAINT "call_logs_leadId_fkey"
  FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CallLog.patientId -> SET NULL
ALTER TABLE "call_logs" DROP CONSTRAINT IF EXISTS "call_logs_patientId_fkey";
ALTER TABLE "call_logs" ADD CONSTRAINT "call_logs_patientId_fkey"
  FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Lead.convertedPatientId -> SET NULL
ALTER TABLE "leads" DROP CONSTRAINT IF EXISTS "leads_convertedPatientId_fkey";
ALTER TABLE "leads" ADD CONSTRAINT "leads_convertedPatientId_fkey"
  FOREIGN KEY ("convertedPatientId") REFERENCES "patients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Waitlist.doctorId -> SET NULL
ALTER TABLE "waitlist" DROP CONSTRAINT IF EXISTS "waitlist_doctorId_fkey";
ALTER TABLE "waitlist" ADD CONSTRAINT "waitlist_doctorId_fkey"
  FOREIGN KEY ("doctorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Waitlist.bookedAppointmentId -> SET NULL
ALTER TABLE "waitlist" DROP CONSTRAINT IF EXISTS "waitlist_bookedAppointmentId_fkey";
ALTER TABLE "waitlist" ADD CONSTRAINT "waitlist_bookedAppointmentId_fkey"
  FOREIGN KEY ("bookedAppointmentId") REFERENCES "appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- PatientPackage.invoiceId -> SET NULL
ALTER TABLE "patient_packages" DROP CONSTRAINT IF EXISTS "patient_packages_invoiceId_fkey";
ALTER TABLE "patient_packages" ADD CONSTRAINT "patient_packages_invoiceId_fkey"
  FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Refund.approvedById -> SET NULL
ALTER TABLE "refunds" DROP CONSTRAINT IF EXISTS "refunds_approvedById_fkey";
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_approvedById_fkey"
  FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Refund.processedById -> SET NULL
ALTER TABLE "refunds" DROP CONSTRAINT IF EXISTS "refunds_processedById_fkey";
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_processedById_fkey"
  FOREIGN KEY ("processedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Patient.assignedDoctorId -> SET NULL
ALTER TABLE "patients" DROP CONSTRAINT IF EXISTS "patients_assignedDoctorId_fkey";
ALTER TABLE "patients" ADD CONSTRAINT "patients_assignedDoctorId_fkey"
  FOREIGN KEY ("assignedDoctorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- BlockedSlot.doctorId -> SET NULL
ALTER TABLE "blocked_slots" DROP CONSTRAINT IF EXISTS "blocked_slots_doctorId_fkey";
ALTER TABLE "blocked_slots" ADD CONSTRAINT "blocked_slots_doctorId_fkey"
  FOREIGN KEY ("doctorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- BlockedSlot.roomId -> SET NULL
ALTER TABLE "blocked_slots" DROP CONSTRAINT IF EXISTS "blocked_slots_roomId_fkey";
ALTER TABLE "blocked_slots" ADD CONSTRAINT "blocked_slots_roomId_fkey"
  FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE SET NULL ON UPDATE CASCADE;
