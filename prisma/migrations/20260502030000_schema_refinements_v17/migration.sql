-- v17 — schema integrity refinements (round 7)
--
-- Pre-flight on prod confirmed every CHECK candidate had zero violations.
--
-- patient_code and appointment_code format CHECKs were *deliberately
-- skipped*. Pre-flight surfaced 10,562 patients and 17,953 appointments
-- with legacy "LSC"-prefixed codes (imported from a previous clinic
-- system). Forcing a single format would either fail the migration or
-- demand a destructive rewrite of legitimate historical identifiers.
-- The columns remain @unique and length-bounded; format is left to
-- the application layer.
--
-- Summary:
--   Name/code non-empty CHECKs (length(trim) > 0):
--     - branches.code
--     - treatments.code (when set)
--     - patients.firstName, patients.lastName
--     - users.name
--     - branches.name
--     - treatments.name, packages.name, products.name
--   Format CHECK:
--     - invoices.invoiceNumber ~ '^INV-[0-9]{4}-[0-9]+$' (uniform on prod)
--   Derived-field CHECK:
--     - invoices: abs(balanceDue - (total - amountPaid)) <= 0.01 — catches
--       calculator drift / partial-update bugs without rejecting legitimate
--       per-cent rounding error
--   Workflow stage-stamp consistency:
--     - refunds: status='PROCESSED' requires processedAt
--     - refunds: status in (APPROVED, PROCESSED) requires approvedById
--   Indexes:
--     - procedures(doctorId, performedAt DESC) — "doctor's recent work"
--     - audit_logs(action) — filter all events of one action type
--     - call_logs(outcome) — call-outcome reports
--     - products(branchId, isActive) — "active stock per branch" queries

BEGIN;

-- ─────────────────────────────────────────────────────────────────
-- Name / code non-empty
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE "branches"   ADD CONSTRAINT "branches_code_nonempty"
  CHECK (length(trim(code)) > 0);
ALTER TABLE "treatments" ADD CONSTRAINT "treatments_code_nonempty"
  CHECK (code IS NULL OR length(trim(code)) > 0);

ALTER TABLE "patients"   ADD CONSTRAINT "patients_firstName_nonempty"
  CHECK (length(trim("firstName")) > 0);
ALTER TABLE "patients"   ADD CONSTRAINT "patients_lastName_nonempty"
  CHECK (length(trim("lastName")) > 0);

ALTER TABLE "users"      ADD CONSTRAINT "users_name_nonempty"
  CHECK (length(trim(name)) > 0);
ALTER TABLE "branches"   ADD CONSTRAINT "branches_name_nonempty"
  CHECK (length(trim(name)) > 0);
ALTER TABLE "treatments" ADD CONSTRAINT "treatments_name_nonempty"
  CHECK (length(trim(name)) > 0);
ALTER TABLE "packages"   ADD CONSTRAINT "packages_name_nonempty"
  CHECK (length(trim(name)) > 0);
ALTER TABLE "products"   ADD CONSTRAINT "products_name_nonempty"
  CHECK (length(trim(name)) > 0);

-- ─────────────────────────────────────────────────────────────────
-- Invoice number format — uniform "INV-YYYY-####" on prod, lock it in
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_invoiceNumber_format"
  CHECK ("invoiceNumber" ~ '^INV-[0-9]{4}-[0-9]+$');

-- ─────────────────────────────────────────────────────────────────
-- Derived-field consistency — balanceDue = total - amountPaid
-- 0.01 tolerance accommodates per-cent rounding without admitting
-- calculator drift (the previous "Total Revenue 50,005,000" bug came
-- from this kind of mismatch slipping through the API layer).
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_balanceDue_matches_total"
  CHECK (abs("balanceDue" - (total - "amountPaid")) <= 0.01);

-- ─────────────────────────────────────────────────────────────────
-- Refund stage-stamp consistency
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_processedAt_when_processed"
  CHECK (status <> 'PROCESSED' OR "processedAt" IS NOT NULL);

ALTER TABLE "refunds" ADD CONSTRAINT "refunds_approvedById_when_approved_or_processed"
  CHECK (status NOT IN ('APPROVED', 'PROCESSED') OR "approvedById" IS NOT NULL);

-- ─────────────────────────────────────────────────────────────────
-- Indexes
-- ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "procedures_doctorId_performedAt_idx"
  ON "procedures" ("doctorId", "performedAt" DESC);

CREATE INDEX IF NOT EXISTS "audit_logs_action_idx"
  ON "audit_logs" ("action");

CREATE INDEX IF NOT EXISTS "call_logs_outcome_idx"
  ON "call_logs" ("outcome");

CREATE INDEX IF NOT EXISTS "products_branchId_isActive_idx"
  ON "products" ("branchId", "isActive");

COMMIT;
