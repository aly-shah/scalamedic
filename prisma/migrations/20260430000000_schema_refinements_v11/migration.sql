-- v11 — schema integrity refinements
--
-- This migration addresses findings from the schema audit (Critical + High +
-- selected Medium-severity items). Pre-flight data check confirmed zero
-- existing rows would violate any of the new constraints, so the migration
-- can run forward without quarantine.
--
-- Bigger items (timezone strategy on Appointment.date / @db.Time for HH:MM,
-- patient anonymisation FK plan, PatientPackage.remainingSessions →
-- relational) are intentionally deferred — each needs a design call.

BEGIN;

-- ─────────────────────────────────────────────────────────────────
-- C3 — six optional `appointmentId` FKs change Restrict → SetNull.
-- Lets an appointment be deleted without purging clinical/financial
-- history; the FK column on the historical row is set NULL instead.
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE "invoices"        DROP CONSTRAINT "invoices_appointmentId_fkey";
ALTER TABLE "invoices"        ADD  CONSTRAINT "invoices_appointmentId_fkey"
  FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id") ON DELETE SET NULL;

ALTER TABLE "lab_tests"       DROP CONSTRAINT "lab_tests_appointmentId_fkey";
ALTER TABLE "lab_tests"       ADD  CONSTRAINT "lab_tests_appointmentId_fkey"
  FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id") ON DELETE SET NULL;

ALTER TABLE "prescriptions"   DROP CONSTRAINT "prescriptions_appointmentId_fkey";
ALTER TABLE "prescriptions"   ADD  CONSTRAINT "prescriptions_appointmentId_fkey"
  FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id") ON DELETE SET NULL;

ALTER TABLE "follow_ups"      DROP CONSTRAINT "follow_ups_appointmentId_fkey";
ALTER TABLE "follow_ups"      ADD  CONSTRAINT "follow_ups_appointmentId_fkey"
  FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id") ON DELETE SET NULL;

ALTER TABLE "consent_forms"   DROP CONSTRAINT "consent_forms_appointmentId_fkey";
ALTER TABLE "consent_forms"   ADD  CONSTRAINT "consent_forms_appointmentId_fkey"
  FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id") ON DELETE SET NULL;

-- NB: Triage model maps to "triage_records" via @@map.
ALTER TABLE "triage_records" DROP CONSTRAINT "triage_records_appointmentId_fkey";
ALTER TABLE "triage_records" ADD  CONSTRAINT "triage_records_appointmentId_fkey"
  FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id") ON DELETE SET NULL;

-- ─────────────────────────────────────────────────────────────────
-- C5 — InvoiceItem catalog FKs change SetNull → Restrict.
-- Treatments / products / packages must be soft-deactivated
-- (isActive=false) rather than hard-deleted; preserves the audit
-- trail on every printed receipt.
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE "invoice_items" DROP CONSTRAINT "invoice_items_treatmentId_fkey";
ALTER TABLE "invoice_items" ADD  CONSTRAINT "invoice_items_treatmentId_fkey"
  FOREIGN KEY ("treatmentId") REFERENCES "treatments"("id") ON DELETE RESTRICT;

ALTER TABLE "invoice_items" DROP CONSTRAINT "invoice_items_productId_fkey";
ALTER TABLE "invoice_items" ADD  CONSTRAINT "invoice_items_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT;

ALTER TABLE "invoice_items" DROP CONSTRAINT "invoice_items_packageId_fkey";
ALTER TABLE "invoice_items" ADD  CONSTRAINT "invoice_items_packageId_fkey"
  FOREIGN KEY ("packageId") REFERENCES "packages"("id") ON DELETE RESTRICT;

-- ─────────────────────────────────────────────────────────────────
-- C6 — widen Invoice money columns 10,2 → 14,2.
-- Single-row totals can hit 8 digits during multi-treatment
-- packages; (14,2) gives room without affecting the per-line
-- (10,2) used elsewhere.
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE "invoices"
  ALTER COLUMN "subtotal"   TYPE DECIMAL(14,2),
  ALTER COLUMN "discount"   TYPE DECIMAL(14,2),
  ALTER COLUMN "tax"        TYPE DECIMAL(14,2),
  ALTER COLUMN "total"      TYPE DECIMAL(14,2),
  ALTER COLUMN "amountPaid" TYPE DECIMAL(14,2),
  ALTER COLUMN "balanceDue" TYPE DECIMAL(14,2);

-- ─────────────────────────────────────────────────────────────────
-- H2 — phone columns standardise on VARCHAR(32) (matches the
-- existing CallLog.phone width). E.164 with formatting + extensions
-- can run past the old 20.
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE "users"    ALTER COLUMN "phone"          TYPE VARCHAR(32);
ALTER TABLE "patients" ALTER COLUMN "phone"          TYPE VARCHAR(32);
ALTER TABLE "patients" ALTER COLUMN "emergencyPhone" TYPE VARCHAR(32);
ALTER TABLE "branches" ALTER COLUMN "phone"          TYPE VARCHAR(32);
ALTER TABLE "leads"    ALTER COLUMN "phone"          TYPE VARCHAR(32);
-- NB: Waitlist model maps to "waitlist" (singular) via @@map.
ALTER TABLE "waitlist" ALTER COLUMN "phone"          TYPE VARCHAR(32);

-- ─────────────────────────────────────────────────────────────────
-- C2 — Patient.phone is no longer unique (family members share
-- numbers in PK clinics; soft-deleted rows used to lock numbers
-- forever). Email keeps the dedup intent via a partial unique that
-- excludes soft-deleted rows.
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE "patients" DROP CONSTRAINT IF EXISTS "patients_phone_key";
ALTER TABLE "patients" DROP CONSTRAINT IF EXISTS "patients_email_key";
DROP INDEX  IF EXISTS "patients_phone_idx";
DROP INDEX  IF EXISTS "patients_email_idx";
DROP INDEX  IF EXISTS "patients_patientCode_idx";       -- redundant with @unique on patientCode
CREATE INDEX IF NOT EXISTS "patients_phone_idx" ON "patients"("phone");
CREATE UNIQUE INDEX IF NOT EXISTS "patients_email_active_unique"
  ON "patients"("email") WHERE "email" IS NOT NULL AND "deletedAt" IS NULL;

-- ─────────────────────────────────────────────────────────────────
-- M1 — drop indexes that are prefixes of larger composites (write
-- amplification with no read benefit).
-- ─────────────────────────────────────────────────────────────────
DROP INDEX IF EXISTS "appointments_patientId_idx";   -- subset of (patientId, date)
DROP INDEX IF EXISTS "appointments_doctorId_idx";    -- subset of (doctorId, date)
DROP INDEX IF EXISTS "appointments_branchId_idx";    -- subset of (branchId, date)
DROP INDEX IF EXISTS "rooms_branchId_idx";           -- subset of (branchId, type)
DROP INDEX IF EXISTS "room_allocations_roomId_idx";  -- subset of (roomId, status)

-- ─────────────────────────────────────────────────────────────────
-- M2 — composite indexes for the queries the dashboard runs daily.
-- ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "invoices_patientId_createdAt_idx"
  ON "invoices"("patientId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "invoices_patientId_status_idx"
  ON "invoices"("patientId", "status");
CREATE INDEX IF NOT EXISTS "payments_invoiceId_status_idx"
  ON "payments"("invoiceId", "status");
CREATE INDEX IF NOT EXISTS "procedures_patientId_performedAt_idx"
  ON "procedures"("patientId", "performedAt" DESC);
CREATE INDEX IF NOT EXISTS "triage_records_patientId_createdAt_idx"
  ON "triage_records"("patientId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "appointments_patientId_status_idx"
  ON "appointments"("patientId", "status");
-- CallLog.phone — currently the dialer/Android bridge does an
-- unindexed scan to match incoming numbers against history.
CREATE INDEX IF NOT EXISTS "call_logs_phone_idx" ON "call_logs"("phone");

-- ─────────────────────────────────────────────────────────────────
-- H3 — Product.barcode @unique (NULLs already allowed multiple
-- times in PostgreSQL, so the standard UNIQUE works without a
-- partial predicate).
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE "products" ADD CONSTRAINT "products_barcode_key" UNIQUE("barcode");

-- ─────────────────────────────────────────────────────────────────
-- M10 — User.licenseNumber @unique (PMC license numbers are unique
-- by definition).
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE "users" ADD CONSTRAINT "users_licenseNumber_key" UNIQUE("licenseNumber");

-- ─────────────────────────────────────────────────────────────────
-- H8 — drop legacy DoctorLeave.approvedBy (text). approvedById is
-- the canonical column.
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE "doctor_leaves" DROP COLUMN IF EXISTS "approvedBy";

-- ─────────────────────────────────────────────────────────────────
-- H9 — AuditLog.userId becomes nullable + SetNull. System jobs and
-- webhook events have no real user; deleted users shouldn't blow
-- up the audit log when they leave.
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE "audit_logs" ALTER COLUMN "userId" DROP NOT NULL;
ALTER TABLE "audit_logs" DROP CONSTRAINT "audit_logs_userId_fkey";
ALTER TABLE "audit_logs" ADD  CONSTRAINT "audit_logs_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL;

-- ─────────────────────────────────────────────────────────────────
-- M9 — InvoiceItem at-most-one catalog FK. Custom line items
-- (pure description + price) keep all three NULL; can't have
-- conflicting catalog refs.
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE "invoice_items"
  ADD CONSTRAINT "invoice_items_one_catalog_link"
  CHECK (
    (("treatmentId" IS NOT NULL)::int +
     ("productId"   IS NOT NULL)::int +
     ("packageId"   IS NOT NULL)::int) <= 1
  );

-- ─────────────────────────────────────────────────────────────────
-- M5 — BlockedSlot must scope to at least one of doctor/room/branch.
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE "blocked_slots"
  ADD CONSTRAINT "blocked_slots_scope"
  CHECK ("doctorId" IS NOT NULL OR "roomId" IS NOT NULL OR "branchId" IS NOT NULL);

-- ─────────────────────────────────────────────────────────────────
-- H4 — appointments.startTime / endTime format guard. We keep the
-- VarChar(5) representation (full @db.Time migration deferred), but
-- block "9:00" / "25:99" type entries that silently break range
-- queries elsewhere.
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE "appointments"
  ADD CONSTRAINT "appointments_startTime_format"
  CHECK ("startTime" ~ '^[0-2][0-9]:[0-5][0-9]$');
ALTER TABLE "appointments"
  ADD CONSTRAINT "appointments_endTime_format"
  CHECK ("endTime" ~ '^[0-2][0-9]:[0-5][0-9]$');

COMMIT;
