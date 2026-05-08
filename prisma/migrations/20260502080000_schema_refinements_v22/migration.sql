-- v22 — schema integrity refinements (round 12)
--
-- Pre-flight on prod confirmed every candidate had zero violations.
-- One candidate (prescription_items dedup by medicine name) was tried
-- and rejected: tapering schedules legitimately list the same medicine
-- twice at different dosages/frequencies, so a UNIQUE there would be
-- too aggressive.
--
-- Summary:
--   Uniqueness:
--     - package_treatments(packageId, treatmentId) UNIQUE — prevents the
--       same Treatment row appearing twice in one Package. NULL treatmentId
--       (custom snapshot rows) is unaffected because PG treats multiple
--       NULLs as distinct in a UNIQUE by default.
--   Schedule sanity:
--     - doctor_schedules: when both break times are set, breakStart must
--       be ≥ startTime and breakEnd must be ≤ endTime.
--     - appointments: checkoutTime ≥ checkinTime when both are set.
--   Triage range:
--     - weight in [0.5, 500] kg when set
--     - height in [25, 250] cm when set
--     - bmi in [5, 100] when set
--   Non-empty-when-set on remaining text fields:
--     - patients.middleName, patients.profileImage
--     - users.avatar
--     - system_settings.value (NOT NULL but no length bound until now)
--   Stage-stamp temporal sanity (the timestamp can't precede the row):
--     - consultation_notes.signedAt
--     - consent_forms.signedAt
--     - follow_ups.completedAt

BEGIN;

-- ─────────────────────────────────────────────────────────────────
-- Uniqueness
-- ─────────────────────────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS "package_treatments_packageId_treatmentId_key"
  ON "package_treatments" ("packageId", "treatmentId");

-- ─────────────────────────────────────────────────────────────────
-- Schedule sanity
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE "doctor_schedules" ADD CONSTRAINT "doctor_schedules_break_within_hours"
  CHECK (
    "breakStart" IS NULL OR "breakEnd" IS NULL
    OR ("breakStart" >= "startTime" AND "breakEnd" <= "endTime")
  );

ALTER TABLE "appointments" ADD CONSTRAINT "appointments_checkout_after_checkin"
  CHECK (
    "checkinTime" IS NULL OR "checkoutTime" IS NULL
    OR "checkoutTime" >= "checkinTime"
  );

-- ─────────────────────────────────────────────────────────────────
-- Triage range bounds (NULL-safe)
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE "triage_records" ADD CONSTRAINT "triage_weight_range"
  CHECK (weight IS NULL OR (weight >= 0.5 AND weight <= 500));

ALTER TABLE "triage_records" ADD CONSTRAINT "triage_height_range"
  CHECK (height IS NULL OR (height >= 25 AND height <= 250));

ALTER TABLE "triage_records" ADD CONSTRAINT "triage_bmi_range"
  CHECK (bmi IS NULL OR (bmi >= 5 AND bmi <= 100));

-- ─────────────────────────────────────────────────────────────────
-- Non-empty when set
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE "patients" ADD CONSTRAINT "patients_middleName_nonempty"
  CHECK ("middleName" IS NULL OR length(trim("middleName")) > 0);

ALTER TABLE "patients" ADD CONSTRAINT "patients_profileImage_nonempty"
  CHECK ("profileImage" IS NULL OR length(trim("profileImage")) > 0);

ALTER TABLE "users" ADD CONSTRAINT "users_avatar_nonempty"
  CHECK (avatar IS NULL OR length(trim(avatar)) > 0);

ALTER TABLE "system_settings" ADD CONSTRAINT "system_settings_value_nonempty"
  CHECK (length(trim(value)) > 0);

-- ─────────────────────────────────────────────────────────────────
-- Stage-stamp temporal sanity
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE "consultation_notes" ADD CONSTRAINT "consultation_notes_signedAt_after_created"
  CHECK ("signedAt" IS NULL OR "signedAt" >= "createdAt");

ALTER TABLE "consent_forms" ADD CONSTRAINT "consent_forms_signedAt_after_created"
  CHECK ("signedAt" IS NULL OR "signedAt" >= "createdAt");

ALTER TABLE "follow_ups" ADD CONSTRAINT "follow_ups_completedAt_after_created"
  CHECK ("completedAt" IS NULL OR "completedAt" >= "createdAt");

COMMIT;
