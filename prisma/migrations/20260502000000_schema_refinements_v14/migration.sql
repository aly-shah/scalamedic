-- v14 — schema integrity refinements (round 4)
--
-- Pre-flight on prod confirmed every CHECK candidate had zero violations.
-- The CURRENT_DATE comparisons below are allowed in PG 12+ even though
-- CURRENT_DATE is STABLE rather than IMMUTABLE. Like all CHECK
-- constraints they're enforced at write-time only — the goal is to
-- reject obvious caller mistakes (DOB in the future, package purchased
-- next week), not to maintain global temporal consistency.
--
-- Summary:
--   CHECKs:
--     - patients.dateOfBirth not in the future
--     - patient_packages.purchaseDate not in the future
--     - invoices.dueDate >= createdAt date when set
--     - consultation_notes: isSigned=true requires signedAt
--     - consent_forms: status=SIGNED requires signedAt
--     - follow_ups: status=COMPLETED requires completedAt
--     - patients: soft-delete mutual exclusion — isActive=true and
--       deletedAt IS NOT NULL can't both hold (illegal "active but
--       deleted" state)
--   Indexes:
--     - lab_tests(priority) — "urgent first" lab queue sort
--     - lab_tests(completedAt) — "completed in last week" analytics
--     - ai_transcriptions(completedAt) — recent transcriptions list
--     - room_allocations(admissionDate) — current-admissions dashboard

BEGIN;

-- ─────────────────────────────────────────────────────────────────
-- Date sanity
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE "patients" ADD CONSTRAINT "patients_dob_not_future"
  CHECK ("dateOfBirth" <= CURRENT_DATE);

ALTER TABLE "patient_packages" ADD CONSTRAINT "patient_packages_purchase_not_future"
  CHECK ("purchaseDate" <= CURRENT_DATE);

ALTER TABLE "invoices" ADD CONSTRAINT "invoices_dueDate_after_created"
  CHECK ("dueDate" IS NULL OR "dueDate" >= "createdAt"::date);

-- ─────────────────────────────────────────────────────────────────
-- Stage-timestamp consistency — when the workflow says something was
-- signed/completed, the corresponding timestamp must be set.
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE "consultation_notes" ADD CONSTRAINT "consultation_notes_signedAt_when_signed"
  CHECK ("isSigned" = false OR "signedAt" IS NOT NULL);

ALTER TABLE "consent_forms" ADD CONSTRAINT "consent_forms_signedAt_when_signed"
  CHECK (status <> 'SIGNED' OR "signedAt" IS NOT NULL);

ALTER TABLE "follow_ups" ADD CONSTRAINT "follow_ups_completedAt_when_completed"
  CHECK (status <> 'COMPLETED' OR "completedAt" IS NOT NULL);

-- ─────────────────────────────────────────────────────────────────
-- Soft-delete mutual exclusion on Patient. The schema has both
-- isActive (boolean) and deletedAt (timestamp) — they should not
-- disagree. A row marked active can't simultaneously have deletedAt set.
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE "patients" ADD CONSTRAINT "patients_active_xor_deleted"
  CHECK (NOT ("isActive" = true AND "deletedAt" IS NOT NULL));

-- ─────────────────────────────────────────────────────────────────
-- Indexes — drive specific dashboard queries.
-- ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "lab_tests_priority_idx"
  ON "lab_tests" ("priority");

CREATE INDEX IF NOT EXISTS "lab_tests_completedAt_idx"
  ON "lab_tests" ("completedAt");

CREATE INDEX IF NOT EXISTS "ai_transcriptions_completedAt_idx"
  ON "ai_transcriptions" ("completedAt");

CREATE INDEX IF NOT EXISTS "room_allocations_admissionDate_idx"
  ON "room_allocations" ("admissionDate");

COMMIT;
