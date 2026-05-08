-- Schema Refinements v5:
--   1. BlockedSlot.branchId — add FK to branches (was orphan column)
--   2. Bare DateTime → TIMESTAMPTZ(6) on completion/collection fields
--      (FollowUp.completedAt, LabTest.collectedAt/completedAt,
--       AITranscription.completedAt [new], Lead.callbackDate)
--   3. Procedure.performedAt — nullable, drop @default(now())
--   4. DoctorSchedule.doctor / DoctorLeave.doctor — onDelete Cascade → Restrict
--      (protects historical schedule/leave records from doctor deactivation)
--   5. ConsentStatus — add WITHDRAWN

-- =============================================
-- 1. BlockedSlot.branchId → FK on branches
-- =============================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'blocked_slots_branchId_fkey'
    AND table_name = 'blocked_slots'
  ) THEN
    ALTER TABLE "blocked_slots"
      ADD CONSTRAINT "blocked_slots_branchId_fkey"
      FOREIGN KEY ("branchId") REFERENCES "branches"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- =============================================
-- 2. Bare DateTime → TIMESTAMPTZ(6) on completion/collection fields
--    Existing naive values interpreted as UTC (matches how app writes via toISOString).
-- =============================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'follow_ups' AND column_name = 'completedAt'
    AND data_type = 'timestamp without time zone'
  ) THEN
    ALTER TABLE "follow_ups"
      ALTER COLUMN "completedAt" TYPE TIMESTAMPTZ(6) USING "completedAt" AT TIME ZONE 'UTC';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lab_tests' AND column_name = 'collectedAt'
    AND data_type = 'timestamp without time zone'
  ) THEN
    ALTER TABLE "lab_tests"
      ALTER COLUMN "collectedAt" TYPE TIMESTAMPTZ(6) USING "collectedAt" AT TIME ZONE 'UTC';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lab_tests' AND column_name = 'completedAt'
    AND data_type = 'timestamp without time zone'
  ) THEN
    ALTER TABLE "lab_tests"
      ALTER COLUMN "completedAt" TYPE TIMESTAMPTZ(6) USING "completedAt" AT TIME ZONE 'UTC';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'leads' AND column_name = 'callbackDate'
    AND data_type = 'timestamp without time zone'
  ) THEN
    ALTER TABLE "leads"
      ALTER COLUMN "callbackDate" TYPE TIMESTAMPTZ(6) USING "callbackDate" AT TIME ZONE 'UTC';
  END IF;
END $$;

-- AITranscription.completedAt — new column
ALTER TABLE "ai_transcriptions"
  ADD COLUMN IF NOT EXISTS "completedAt" TIMESTAMPTZ(6);

-- =============================================
-- 3. Procedure.performedAt → nullable + drop default(now())
--    Existing rows keep their current timestamp; just remove the default
--    so new rows can be created without a perform time.
-- =============================================
ALTER TABLE "procedures" ALTER COLUMN "performedAt" DROP DEFAULT;
ALTER TABLE "procedures" ALTER COLUMN "performedAt" DROP NOT NULL;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'procedures' AND column_name = 'performedAt'
    AND data_type = 'timestamp without time zone'
  ) THEN
    ALTER TABLE "procedures"
      ALTER COLUMN "performedAt" TYPE TIMESTAMPTZ(6) USING "performedAt" AT TIME ZONE 'UTC';
  END IF;
END $$;

-- =============================================
-- 4. DoctorSchedule.doctor, DoctorLeave.doctor: Cascade → Restrict
-- =============================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'doctor_schedules_doctorId_fkey'
    AND table_name = 'doctor_schedules'
  ) THEN
    ALTER TABLE "doctor_schedules" DROP CONSTRAINT "doctor_schedules_doctorId_fkey";
  END IF;
  ALTER TABLE "doctor_schedules"
    ADD CONSTRAINT "doctor_schedules_doctorId_fkey"
    FOREIGN KEY ("doctorId") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'doctor_leaves_doctorId_fkey'
    AND table_name = 'doctor_leaves'
  ) THEN
    ALTER TABLE "doctor_leaves" DROP CONSTRAINT "doctor_leaves_doctorId_fkey";
  END IF;
  ALTER TABLE "doctor_leaves"
    ADD CONSTRAINT "doctor_leaves_doctorId_fkey"
    FOREIGN KEY ("doctorId") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
END $$;

-- =============================================
-- 5. ConsentStatus: add WITHDRAWN
--    Postgres allows adding enum values without table rewrite.
--    Position BEFORE EXPIRED to preserve schema ordering.
-- =============================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'ConsentStatus' AND e.enumlabel = 'WITHDRAWN'
  ) THEN
    ALTER TYPE "ConsentStatus" ADD VALUE 'WITHDRAWN' BEFORE 'EXPIRED';
  END IF;
END $$;
