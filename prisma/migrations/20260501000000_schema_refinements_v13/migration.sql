-- v13 — schema integrity refinements (round 3)
--
-- Pre-flight on prod confirmed every CHECK candidate had zero violations
-- EXCEPT call_logs(duration < 0), where 2 rows had negative durations
-- written by the Android dialer bridge (likely a sync race). Migration
-- nulls those before adding the CHECK; "duration unknown" is more honest
-- than treating them as zero-second calls.
--
-- Summary of CHECKs:
--   - call_logs.duration NULL or >= 0
--   - doctor_schedules.maxPatients NULL or > 0
--   - treatments.duration <= 480  (already > 0 from v12; cap matches zod)
--   - lab_tests stage-timestamp consistency:
--       * status='COMPLETED' requires completedAt
--       * status in (SAMPLE_COLLECTED, PROCESSING, COMPLETED) requires
--         collectedAt
--       * completedAt >= collectedAt when both set
--   - email format on branches.email, users.email, and the optional
--     emails on patients and leads (basic shape: non-space token "@"
--     non-space token "." non-space token)
--
-- Indexes added for "expiring soon" / chronological dashboards:
--   - insurances(expiryDate)
--   - patient_packages(expiryDate)
--   - patient_documents(createdAt)

BEGIN;

-- ─────────────────────────────────────────────────────────────────
-- Data backfill: NULL out two known-bad negative-duration call_logs.
-- ─────────────────────────────────────────────────────────────────
UPDATE "call_logs" SET "duration" = NULL WHERE "duration" < 0;

-- ─────────────────────────────────────────────────────────────────
-- Sanity CHECKs
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE "call_logs" ADD CONSTRAINT "call_logs_duration_nonneg"
  CHECK ("duration" IS NULL OR "duration" >= 0);

ALTER TABLE "doctor_schedules" ADD CONSTRAINT "doctor_schedules_maxPatients_positive"
  CHECK ("maxPatients" IS NULL OR "maxPatients" > 0);

ALTER TABLE "treatments" ADD CONSTRAINT "treatments_duration_max"
  CHECK ("duration" <= 480);

-- ─────────────────────────────────────────────────────────────────
-- Lab test timestamps must follow the stage they're associated with.
-- A test in SAMPLE_COLLECTED or later must have a collectedAt; a
-- COMPLETED test must additionally have a completedAt; and the
-- completion can't have happened before collection.
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE "lab_tests" ADD CONSTRAINT "lab_tests_completedAt_when_completed"
  CHECK (status <> 'COMPLETED' OR "completedAt" IS NOT NULL);

ALTER TABLE "lab_tests" ADD CONSTRAINT "lab_tests_collectedAt_when_collected"
  CHECK (status NOT IN ('SAMPLE_COLLECTED', 'PROCESSING', 'COMPLETED') OR "collectedAt" IS NOT NULL);

ALTER TABLE "lab_tests" ADD CONSTRAINT "lab_tests_timestamp_order"
  CHECK ("completedAt" IS NULL OR "collectedAt" IS NULL OR "completedAt" >= "collectedAt");

-- ─────────────────────────────────────────────────────────────────
-- Email format — a deliberately permissive regex (token "@" token "."
-- token, no whitespace). Catches obvious garbage like "n/a" or empty
-- strings without rejecting plus-addressing or unusual TLDs.
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE "branches" ADD CONSTRAINT "branches_email_format"
  CHECK ("email" ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$');

ALTER TABLE "users" ADD CONSTRAINT "users_email_format"
  CHECK ("email" ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$');

ALTER TABLE "patients" ADD CONSTRAINT "patients_email_format"
  CHECK ("email" IS NULL OR "email" ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$');

ALTER TABLE "leads" ADD CONSTRAINT "leads_email_format"
  CHECK ("email" IS NULL OR "email" ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$');

-- ─────────────────────────────────────────────────────────────────
-- Indexes — drive "expiring soon" widgets without scanning the table.
-- ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "insurances_expiryDate_idx"
  ON "insurances" ("expiryDate");

CREATE INDEX IF NOT EXISTS "patient_packages_expiryDate_idx"
  ON "patient_packages" ("expiryDate");

CREATE INDEX IF NOT EXISTS "patient_documents_createdAt_idx"
  ON "patient_documents" ("createdAt");

COMMIT;
