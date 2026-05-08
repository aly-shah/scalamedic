-- v20 — schema integrity refinements (round 10)
--
-- Pre-flight on prod confirmed every CHECK candidate had zero violations.
-- This pass closes a class of bugs that earlier rounds skipped: empty
-- strings stored in NULLABLE text columns. They look "set" to a query
-- (`WHERE notes IS NOT NULL` returns them) but contain no value, which
-- has bitten downstream code more than once. The rule applied here is:
-- "if you're going to set this column, put something real in it; if
-- there's nothing real, write NULL."
--
-- Summary:
--   Non-empty-when-set CHECKs (length(trim(col)) > 0 OR col IS NULL):
--     users.licenseNumber, users.speciality
--     patients.emergencyContact, patients.emergencyPhone
--     treatments.preInstructions, postInstructions, contraindications
--     procedures.outcome, procedures.complications
--     appointments.notes, appointments.cancellationNote
--     call_logs.notes
--     communication_logs.subject, communication_logs.content
--     lab_tests.notes, lab_tests.technician
--     prescriptions.notes
--     blocked_slots.reason
--     doctor_leaves.reason
--     notifications.link
--   (22 columns total, no exceptions found in prod data.)
--
--   Indexes:
--     - treatments(category, isActive)        — "active LASER" / "active FACIAL" lists
--     - users(role, branchId)                 — staff filter by role within a branch
--     - appointments(date, status)            — daily status breakdown reports
--     - patients(skinType)                    — skin-category demographic reports

BEGIN;

-- ─────────────────────────────────────────────────────────────────
-- Non-empty-when-set CHECKs
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE "users" ADD CONSTRAINT "users_licenseNumber_nonempty"
  CHECK ("licenseNumber" IS NULL OR length(trim("licenseNumber")) > 0);
ALTER TABLE "users" ADD CONSTRAINT "users_speciality_nonempty"
  CHECK (speciality IS NULL OR length(trim(speciality)) > 0);

ALTER TABLE "patients" ADD CONSTRAINT "patients_emergencyContact_nonempty"
  CHECK ("emergencyContact" IS NULL OR length(trim("emergencyContact")) > 0);
ALTER TABLE "patients" ADD CONSTRAINT "patients_emergencyPhone_nonempty"
  CHECK ("emergencyPhone" IS NULL OR length(trim("emergencyPhone")) > 0);

ALTER TABLE "treatments" ADD CONSTRAINT "treatments_preInstructions_nonempty"
  CHECK ("preInstructions" IS NULL OR length(trim("preInstructions")) > 0);
ALTER TABLE "treatments" ADD CONSTRAINT "treatments_postInstructions_nonempty"
  CHECK ("postInstructions" IS NULL OR length(trim("postInstructions")) > 0);
ALTER TABLE "treatments" ADD CONSTRAINT "treatments_contraindications_nonempty"
  CHECK (contraindications IS NULL OR length(trim(contraindications)) > 0);

ALTER TABLE "procedures" ADD CONSTRAINT "procedures_outcome_nonempty"
  CHECK (outcome IS NULL OR length(trim(outcome)) > 0);
ALTER TABLE "procedures" ADD CONSTRAINT "procedures_complications_nonempty"
  CHECK (complications IS NULL OR length(trim(complications)) > 0);

ALTER TABLE "appointments" ADD CONSTRAINT "appointments_notes_nonempty"
  CHECK (notes IS NULL OR length(trim(notes)) > 0);
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_cancellationNote_nonempty"
  CHECK ("cancellationNote" IS NULL OR length(trim("cancellationNote")) > 0);

ALTER TABLE "call_logs" ADD CONSTRAINT "call_logs_notes_nonempty"
  CHECK (notes IS NULL OR length(trim(notes)) > 0);

ALTER TABLE "communication_logs" ADD CONSTRAINT "communication_logs_subject_nonempty"
  CHECK (subject IS NULL OR length(trim(subject)) > 0);
ALTER TABLE "communication_logs" ADD CONSTRAINT "communication_logs_content_nonempty"
  CHECK (content IS NULL OR length(trim(content)) > 0);

ALTER TABLE "lab_tests" ADD CONSTRAINT "lab_tests_notes_nonempty"
  CHECK (notes IS NULL OR length(trim(notes)) > 0);
ALTER TABLE "lab_tests" ADD CONSTRAINT "lab_tests_technician_nonempty"
  CHECK (technician IS NULL OR length(trim(technician)) > 0);

ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_notes_nonempty"
  CHECK (notes IS NULL OR length(trim(notes)) > 0);

ALTER TABLE "blocked_slots" ADD CONSTRAINT "blocked_slots_reason_nonempty"
  CHECK (reason IS NULL OR length(trim(reason)) > 0);

ALTER TABLE "doctor_leaves" ADD CONSTRAINT "doctor_leaves_reason_nonempty"
  CHECK (reason IS NULL OR length(trim(reason)) > 0);

ALTER TABLE "notifications" ADD CONSTRAINT "notifications_link_nonempty"
  CHECK (link IS NULL OR length(trim(link)) > 0);

-- ─────────────────────────────────────────────────────────────────
-- Composite + targeted indexes
-- ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "treatments_category_isActive_idx"
  ON "treatments" ("category", "isActive");

CREATE INDEX IF NOT EXISTS "users_role_branchId_idx"
  ON "users" ("role", "branchId");

CREATE INDEX IF NOT EXISTS "appointments_date_status_idx"
  ON "appointments" ("date", "status");

CREATE INDEX IF NOT EXISTS "patients_skinType_idx"
  ON "patients" ("skinType");

COMMIT;
