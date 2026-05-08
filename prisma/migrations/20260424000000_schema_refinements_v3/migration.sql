-- Schema Refinements v3:
--   1. PatientPackage.package → onDelete: Restrict (was implicit NoAction)
--   2. DoctorLeave: add approvedById FK to users + index (keep legacy approvedBy string)
--   3. PrescriptionItem: add createdAt + updatedAt audit fields
--   4. Appointment.checkinTime / checkoutTime → TIMESTAMPTZ(6) for timezone-aware storage

-- =============================================
-- 1. PatientPackage.package: add onDelete: Restrict
-- =============================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'patient_packages_packageId_fkey'
    AND table_name = 'patient_packages'
  ) THEN
    ALTER TABLE "patient_packages" DROP CONSTRAINT "patient_packages_packageId_fkey";
  END IF;
  ALTER TABLE "patient_packages"
    ADD CONSTRAINT "patient_packages_packageId_fkey"
    FOREIGN KEY ("packageId") REFERENCES "packages"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
END $$;

-- =============================================
-- 2. DoctorLeave: add approvedById FK column
-- =============================================
ALTER TABLE "doctor_leaves"
  ADD COLUMN IF NOT EXISTS "approvedById" UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'doctor_leaves_approvedById_fkey'
    AND table_name = 'doctor_leaves'
  ) THEN
    ALTER TABLE "doctor_leaves"
      ADD CONSTRAINT "doctor_leaves_approvedById_fkey"
      FOREIGN KEY ("approvedById") REFERENCES "users"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "doctor_leaves_approvedById_idx" ON "doctor_leaves"("approvedById");

-- =============================================
-- 3. PrescriptionItem: add audit timestamps
-- =============================================
ALTER TABLE "prescription_items"
  ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "prescription_items"
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- =============================================
-- 4. Appointment: checkinTime / checkoutTime → TIMESTAMPTZ(6)
-- =============================================
-- Safe conversion: existing naive TIMESTAMP values are interpreted as UTC
-- (matching how they were written by the app). If the values were written
-- in PKT, a post-migration correction would be needed; the app stores
-- Date().toISOString() which is always UTC, so UTC interpretation is correct.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'appointments'
    AND column_name = 'checkinTime'
    AND data_type = 'timestamp without time zone'
  ) THEN
    ALTER TABLE "appointments"
      ALTER COLUMN "checkinTime" TYPE TIMESTAMPTZ(6) USING "checkinTime" AT TIME ZONE 'UTC';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'appointments'
    AND column_name = 'checkoutTime'
    AND data_type = 'timestamp without time zone'
  ) THEN
    ALTER TABLE "appointments"
      ALTER COLUMN "checkoutTime" TYPE TIMESTAMPTZ(6) USING "checkoutTime" AT TIME ZONE 'UTC';
  END IF;
END $$;
