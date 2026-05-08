-- Schema Refinements v4:
--   1. Compound indexes for common query paths
--   2. RoomAllocation.admissionDate / dischargeDate → DATE (drop time component)
--   3. Triage.temperatureUnit → NOT NULL with default 'C' (backfill nulls first)
--   4. Merge UrgencyLevel into Priority (rename ROUTINE → NORMAL, drop duplicate enum)

-- =============================================
-- 1. Compound indexes (idempotent)
-- =============================================
CREATE INDEX IF NOT EXISTS "prescriptions_doctorId_createdAt_idx"
  ON "prescriptions"("doctorId", "createdAt");

CREATE INDEX IF NOT EXISTS "consultation_notes_appointmentId_createdAt_idx"
  ON "consultation_notes"("appointmentId", "createdAt");

CREATE INDEX IF NOT EXISTS "blocked_slots_branchId_date_idx"
  ON "blocked_slots"("branchId", "date");

CREATE INDEX IF NOT EXISTS "patients_isActive_deletedAt_idx"
  ON "patients"("isActive", "deletedAt");

CREATE INDEX IF NOT EXISTS "follow_ups_dueDate_status_idx"
  ON "follow_ups"("dueDate", "status");

-- =============================================
-- 2. RoomAllocation date columns → DATE
--    Existing TIMESTAMP values cast to DATE (drops time portion).
-- =============================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'room_allocations'
    AND column_name = 'admissionDate'
    AND data_type = 'timestamp without time zone'
  ) THEN
    ALTER TABLE "room_allocations"
      ALTER COLUMN "admissionDate" TYPE DATE USING "admissionDate"::DATE;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'room_allocations'
    AND column_name = 'dischargeDate'
    AND data_type = 'timestamp without time zone'
  ) THEN
    ALTER TABLE "room_allocations"
      ALTER COLUMN "dischargeDate" TYPE DATE USING "dischargeDate"::DATE;
  END IF;
END $$;

-- =============================================
-- 3. Triage.temperatureUnit → NOT NULL with default 'C'
--    Backfill any NULL rows first so NOT NULL can apply cleanly.
-- =============================================
UPDATE "triage_records" SET "temperatureUnit" = 'C' WHERE "temperatureUnit" IS NULL;
ALTER TABLE "triage_records" ALTER COLUMN "temperatureUnit" SET DEFAULT 'C';
ALTER TABLE "triage_records" ALTER COLUMN "temperatureUnit" SET NOT NULL;

-- =============================================
-- 4. UrgencyLevel → Priority merge
--    Steps: cast column to text, remap ROUTINE → NORMAL, cast to Priority,
--    reset default, drop the now-unused UrgencyLevel enum.
--    Wrapped in existence checks so the migration is idempotent.
-- =============================================
DO $$
BEGIN
  -- Only run the conversion if the column is still typed as UrgencyLevel
  IF EXISTS (
    SELECT 1 FROM information_schema.columns c
    JOIN pg_type t ON t.typname = c.udt_name
    WHERE c.table_name = 'triage_records'
    AND c.column_name = 'urgencyLevel'
    AND c.udt_name = 'UrgencyLevel'
  ) THEN
    -- Drop default so ALTER TYPE can proceed
    ALTER TABLE "triage_records" ALTER COLUMN "urgencyLevel" DROP DEFAULT;
    -- Cast to text, remap, cast to Priority
    ALTER TABLE "triage_records"
      ALTER COLUMN "urgencyLevel" TYPE TEXT USING "urgencyLevel"::TEXT;
    UPDATE "triage_records" SET "urgencyLevel" = 'NORMAL' WHERE "urgencyLevel" = 'ROUTINE';
    ALTER TABLE "triage_records"
      ALTER COLUMN "urgencyLevel" TYPE "Priority" USING "urgencyLevel"::"Priority";
    ALTER TABLE "triage_records" ALTER COLUMN "urgencyLevel" SET DEFAULT 'NORMAL';
  END IF;

  -- Drop the enum if it exists and is no longer referenced
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'UrgencyLevel') THEN
    DROP TYPE "UrgencyLevel";
  END IF;
END $$;
