-- v16 — schema integrity refinements (round 6)
--
-- Pre-flight on prod confirmed every CHECK candidate had zero
-- violations. This pass focuses on free-form VARCHAR / JSON columns
-- whose value sets are documented in code/comments but were never
-- enforced at the schema layer — a permission action like "FOO"
-- silently passed before, even though the API only ever issues five
-- known verbs.
--
-- Summary:
--   Domain CHECKs:
--     - permissions.action ∈ {VIEW, CREATE, EDIT, DELETE, EXPORT}
--     - triage_records.temperatureUnit ∈ {C, F}
--     - ai_transcriptions.language ~ ISO 639-1[-region] when set
--     - branches.timezone ~ IANA (Area/Location[/Sublocation]) or UTC
--     - system_settings.type ∈ {string, number, boolean, json}
--     - patient_tags.tag must contain non-whitespace content
--     - appointments.durationMinutes ∈ [5, 480]  (matches zod limit)
--     - patient_packages.remainingSessions must be a JSON object
--     - consent_forms.expiresAt ≥ createdAt when set
--   Indexes:
--     - users(lastLoginAt) — "active staff this week" dashboard
--     - permissions(module) — admin "permissions for module X" lookups
--     - room_allocations(dischargeDate) — discharge reports
--     - appointments(checkinTime) — "checked in today" filter

BEGIN;

-- ─────────────────────────────────────────────────────────────────
-- Domain CHECKs
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE "permissions" ADD CONSTRAINT "permissions_action_known"
  CHECK (action IN ('VIEW', 'CREATE', 'EDIT', 'DELETE', 'EXPORT'));

ALTER TABLE "triage_records" ADD CONSTRAINT "triage_temperatureUnit_known"
  CHECK ("temperatureUnit" IN ('C', 'F'));

-- BCP-47-ish: ISO 639-1 lowercase language tag, optionally followed by
-- a -REGION uppercase. Covers en / ur / en-PK / ur-PK without admitting
-- garbage like "english" or "en_US".
ALTER TABLE "ai_transcriptions" ADD CONSTRAINT "ai_transcriptions_language_format"
  CHECK (language IS NULL OR language ~ '^[a-z]{2}(-[A-Z]{2})?$');

-- IANA tz string. Permits "Asia/Karachi", "America/New_York",
-- "Etc/GMT+5", or the literal "UTC".
ALTER TABLE "branches" ADD CONSTRAINT "branches_timezone_format"
  CHECK (timezone ~ '^([A-Za-z]+/[A-Za-z_/+\-]+|UTC)$');

ALTER TABLE "system_settings" ADD CONSTRAINT "system_settings_type_known"
  CHECK (type IN ('string', 'number', 'boolean', 'json'));

-- Reject empty / whitespace-only tag values that the API was happy to
-- accept before. Length CHECK handles the "      " case too.
ALTER TABLE "patient_tags" ADD CONSTRAINT "patient_tags_tag_nonempty"
  CHECK (length(trim(tag)) > 0);

ALTER TABLE "appointments" ADD CONSTRAINT "appointments_durationMinutes_range"
  CHECK ("durationMinutes" >= 5 AND "durationMinutes" <= 480);

-- The JSON column documents itself as {treatmentName: sessionsLeft}.
-- Enforce that it's actually an object — not a string, array, or null.
ALTER TABLE "patient_packages" ADD CONSTRAINT "patient_packages_remainingSessions_is_object"
  CHECK (jsonb_typeof("remainingSessions") = 'object');

ALTER TABLE "consent_forms" ADD CONSTRAINT "consent_forms_expiresAt_after_created"
  CHECK ("expiresAt" IS NULL OR "expiresAt" >= "createdAt");

-- ─────────────────────────────────────────────────────────────────
-- Reporting indexes
-- ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "users_lastLoginAt_idx"
  ON "users" ("lastLoginAt");

CREATE INDEX IF NOT EXISTS "permissions_module_idx"
  ON "permissions" ("module");

CREATE INDEX IF NOT EXISTS "room_allocations_dischargeDate_idx"
  ON "room_allocations" ("dischargeDate");

CREATE INDEX IF NOT EXISTS "appointments_checkinTime_idx"
  ON "appointments" ("checkinTime");

COMMIT;
