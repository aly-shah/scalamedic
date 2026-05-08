-- v23 — schema integrity refinements (round 13)
--
-- Pre-flight on prod confirmed every CHECK candidate had zero violations.
-- Two were tried and rejected:
--
--   "checkinTime cannot precede the appointment's date" — 2 rows looked
--     bad under naive UTC-cast comparison but are actually fine in PKT
--     (checked in around 02:49 AM PKT on the appointment date; the UTC
--     timestamp is the previous calendar day). A timezone-aware CHECK
--     would either drop the existing 2 rows or be brittle against future
--     CURRENT_TIMEZONE shifts. Left to the application layer.
--
--   "patient must have phone OR email" — surfaced 63 legacy rows with
--     neither contact channel, almost certainly imported from the old
--     LSC system. Forcing the constraint would either fail the migration
--     or demand manual data cleanup we don't have authority for.
--
-- Summary:
--   Lifecycle temporal CHECKs:
--     - users.lastLoginAt >= createdAt when set
--     - patients.deletedAt >= createdAt when set
--   Required-text non-empty:
--     - leads.phone
--     - waitlist.phone
--   Optional-text non-empty when set:
--     - products.{brand, description, unit, imageUrl}
--   Array element integrity:
--     - skin_histories.images: no empty element
--   Indexes:
--     - leads(status, createdAt DESC)         — "new leads this week"
--     - call_logs(outcome, createdAt DESC)    — outcome reports

BEGIN;

-- ─────────────────────────────────────────────────────────────────
-- Lifecycle temporal CHECKs
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE "users" ADD CONSTRAINT "users_lastLoginAt_after_created"
  CHECK ("lastLoginAt" IS NULL OR "lastLoginAt" >= "createdAt");

ALTER TABLE "patients" ADD CONSTRAINT "patients_deletedAt_after_created"
  CHECK ("deletedAt" IS NULL OR "deletedAt" >= "createdAt");

-- ─────────────────────────────────────────────────────────────────
-- Required-text non-empty (these columns are NOT NULL but the API
-- has at some point been able to store empty strings).
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE "leads" ADD CONSTRAINT "leads_phone_nonempty"
  CHECK (length(trim(phone)) > 0);

ALTER TABLE "waitlist" ADD CONSTRAINT "waitlist_phone_nonempty"
  CHECK (length(trim(phone)) > 0);

-- ─────────────────────────────────────────────────────────────────
-- Optional-text non-empty when set (products)
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE "products" ADD CONSTRAINT "products_brand_nonempty"
  CHECK (brand IS NULL OR length(trim(brand)) > 0);
ALTER TABLE "products" ADD CONSTRAINT "products_description_nonempty"
  CHECK (description IS NULL OR length(trim(description)) > 0);
ALTER TABLE "products" ADD CONSTRAINT "products_unit_nonempty"
  CHECK (unit IS NULL OR length(trim(unit)) > 0);
ALTER TABLE "products" ADD CONSTRAINT "products_imageUrl_nonempty"
  CHECK ("imageUrl" IS NULL OR length(trim("imageUrl")) > 0);

-- ─────────────────────────────────────────────────────────────────
-- Image-array integrity for skin history (mirrors the v21 procedure
-- array CHECKs).
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE "skin_histories" ADD CONSTRAINT "skin_histories_images_no_empty"
  CHECK (images IS NULL OR NOT ('' = ANY(images)));

-- ─────────────────────────────────────────────────────────────────
-- Reporting indexes
-- ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "leads_status_createdAt_idx"
  ON "leads" ("status", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "call_logs_outcome_createdAt_idx"
  ON "call_logs" ("outcome", "createdAt" DESC);

COMMIT;
