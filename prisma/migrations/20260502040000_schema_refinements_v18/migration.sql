-- v18 — schema integrity refinements (round 8)
--
-- Pre-flight on prod confirmed every CHECK candidate had zero violations.
-- This pass plugs the remaining "required text but never length-checked"
-- gaps and replaces a v15 CHECK that assumed Celsius regardless of
-- temperatureUnit.
--
-- Summary:
--   Replaced CHECK:
--     - triage_records.temperature: now unit-aware. v15 enforced [25,45]
--       blindly, which would reject any legitimate Fahrenheit reading
--       (a 98.6 °F body temp would fail the C range). New form:
--         temp NULL OK, OR (unit=C AND 25≤t≤45) OR (unit=F AND 77≤t≤113).
--   New non-empty CHECKs (length(trim) > 0):
--     - patient_allergies.allergen
--     - patient_medications.name
--     - medical_histories.condition
--     - skin_histories.condition + affectedArea
--     - insurances.provider + policyNumber
--     - prescription_items.medicineName
--     - lab_tests.testName
--     - patient_documents.name
--     - notifications.title + message
--     - audit_logs.action / module / entityType / entityId
--     - refunds.reason
--     - follow_ups.reason
--     - consent_forms.title + content
--   Format CHECK:
--     - patients.bloodType: ^(A|B|AB|O)[+-]$ when set (e.g. "A+", "O-")
--   Indexes:
--     - triage_records(urgencyLevel) — urgent-triage queue sort
--     - leads(source) — lead-source breakdown reports
--     - patient_packages(purchaseDate) — "packages sold this month"
--     - invoices(branchId, createdAt) — branch-scoped revenue reports
--     - procedures(consentSigned) — consent-compliance audit

BEGIN;

-- ─────────────────────────────────────────────────────────────────
-- Replace v15's unit-blind temperature CHECK with a unit-aware one.
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE "triage_records" DROP CONSTRAINT IF EXISTS "triage_temperature_range";
ALTER TABLE "triage_records" ADD CONSTRAINT "triage_temperature_range"
  CHECK (
    temperature IS NULL
    OR ("temperatureUnit" = 'C' AND temperature >= 25 AND temperature <= 45)
    OR ("temperatureUnit" = 'F' AND temperature >= 77 AND temperature <= 113)
  );

-- ─────────────────────────────────────────────────────────────────
-- Non-empty CHECKs on required text columns
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE "patient_allergies"    ADD CONSTRAINT "patient_allergies_allergen_nonempty"
  CHECK (length(trim(allergen)) > 0);
ALTER TABLE "patient_medications"  ADD CONSTRAINT "patient_medications_name_nonempty"
  CHECK (length(trim(name)) > 0);
ALTER TABLE "medical_histories"    ADD CONSTRAINT "medical_histories_condition_nonempty"
  CHECK (length(trim(condition)) > 0);

ALTER TABLE "skin_histories"       ADD CONSTRAINT "skin_histories_condition_nonempty"
  CHECK (length(trim(condition)) > 0);
ALTER TABLE "skin_histories"       ADD CONSTRAINT "skin_histories_affectedArea_nonempty"
  CHECK (length(trim("affectedArea")) > 0);

ALTER TABLE "insurances"           ADD CONSTRAINT "insurances_provider_nonempty"
  CHECK (length(trim(provider)) > 0);
ALTER TABLE "insurances"           ADD CONSTRAINT "insurances_policyNumber_nonempty"
  CHECK (length(trim("policyNumber")) > 0);

ALTER TABLE "prescription_items"   ADD CONSTRAINT "prescription_items_medicineName_nonempty"
  CHECK (length(trim("medicineName")) > 0);

ALTER TABLE "lab_tests"            ADD CONSTRAINT "lab_tests_testName_nonempty"
  CHECK (length(trim("testName")) > 0);

ALTER TABLE "patient_documents"    ADD CONSTRAINT "patient_documents_name_nonempty"
  CHECK (length(trim(name)) > 0);

ALTER TABLE "notifications"        ADD CONSTRAINT "notifications_title_nonempty"
  CHECK (length(trim(title)) > 0);
ALTER TABLE "notifications"        ADD CONSTRAINT "notifications_message_nonempty"
  CHECK (length(trim(message)) > 0);

ALTER TABLE "audit_logs"           ADD CONSTRAINT "audit_logs_action_nonempty"
  CHECK (length(trim(action)) > 0);
ALTER TABLE "audit_logs"           ADD CONSTRAINT "audit_logs_module_nonempty"
  CHECK (length(trim(module)) > 0);
ALTER TABLE "audit_logs"           ADD CONSTRAINT "audit_logs_entityType_nonempty"
  CHECK (length(trim("entityType")) > 0);
ALTER TABLE "audit_logs"           ADD CONSTRAINT "audit_logs_entityId_nonempty"
  CHECK (length(trim("entityId")) > 0);

ALTER TABLE "refunds"              ADD CONSTRAINT "refunds_reason_nonempty"
  CHECK (length(trim(reason)) > 0);

ALTER TABLE "follow_ups"           ADD CONSTRAINT "follow_ups_reason_nonempty"
  CHECK (length(trim(reason)) > 0);

ALTER TABLE "consent_forms"        ADD CONSTRAINT "consent_forms_title_nonempty"
  CHECK (length(trim(title)) > 0);
ALTER TABLE "consent_forms"        ADD CONSTRAINT "consent_forms_content_nonempty"
  CHECK (length(trim(content)) > 0);

-- ─────────────────────────────────────────────────────────────────
-- Blood-type format
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE "patients" ADD CONSTRAINT "patients_bloodType_format"
  CHECK ("bloodType" IS NULL OR "bloodType" ~ '^(A|B|AB|O)[+-]$');

-- ─────────────────────────────────────────────────────────────────
-- Indexes
-- ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "triage_records_urgencyLevel_idx"
  ON "triage_records" ("urgencyLevel");

CREATE INDEX IF NOT EXISTS "leads_source_idx"
  ON "leads" ("source");

CREATE INDEX IF NOT EXISTS "patient_packages_purchaseDate_idx"
  ON "patient_packages" ("purchaseDate");

CREATE INDEX IF NOT EXISTS "invoices_branchId_createdAt_idx"
  ON "invoices" ("branchId", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "procedures_consentSigned_idx"
  ON "procedures" ("consentSigned");

COMMIT;
