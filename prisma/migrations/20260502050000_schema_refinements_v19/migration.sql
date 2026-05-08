-- v19 — schema integrity refinements (round 9)
--
-- Pre-flight on prod confirmed every CHECK candidate had zero violations.
--
-- Two candidates were tried and rejected:
--   - "follow-up appointments require an existing consultation note"
--     surfaced 2 legacy rows. The receptionist UI already prevents this
--     for new bookings (calendar.tsx restricts the FOLLOW_UP type to
--     patients with visit history), and a multi-table CHECK can't be
--     expressed as a column constraint without a trigger. Skipped.
--   - "consent_forms.status='SIGNED' requires signatureUrl" — too rigid
--     for paper-signed forms. Skipped.
--
-- Summary:
--   File metadata sanity:
--     - patient_documents.fileSize > 0 when set
--     - patient_documents.mimeType matches RFC-6838-ish "type/subtype"
--       when set (case-insensitive, allows + . - * within tokens)
--     - patient_documents.fileUrl is non-empty
--   System-settings non-empty:
--     - key, label, group all length(trim) > 0
--   Temporal sanity:
--     - leads.callbackDate >= createdAt when set
--     - patients.dateOfBirth >= '1900-01-01' (catches 4-digit-year typos
--       like '1099-…' that the not-future CHECK alone wouldn't reject)
--   Workflow stamp consistency:
--     - doctor_leaves: status='APPROVED' requires approvedById
--       (mirrors the refunds CHECK from v17)
--   Indexes:
--     - notifications(type)             — "all SYSTEM notifications"
--     - patients(gender)                — demographic reports
--     - blocked_slots(type)             — break / prayer / lunch breakdowns
--     - communication_logs(direction)   — inbound vs outbound feeds

BEGIN;

-- ─────────────────────────────────────────────────────────────────
-- File metadata sanity
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE "patient_documents" ADD CONSTRAINT "patient_documents_fileSize_positive"
  CHECK ("fileSize" IS NULL OR "fileSize" > 0);

ALTER TABLE "patient_documents" ADD CONSTRAINT "patient_documents_mimeType_format"
  CHECK ("mimeType" IS NULL OR "mimeType" ~* '^[a-z0-9.+\-]+/[a-z0-9.+\-*]+$');

ALTER TABLE "patient_documents" ADD CONSTRAINT "patient_documents_fileUrl_nonempty"
  CHECK (length(trim("fileUrl")) > 0);

-- ─────────────────────────────────────────────────────────────────
-- System settings non-empty
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE "system_settings" ADD CONSTRAINT "system_settings_key_nonempty"
  CHECK (length(trim(key)) > 0);
ALTER TABLE "system_settings" ADD CONSTRAINT "system_settings_label_nonempty"
  CHECK (length(trim(label)) > 0);
ALTER TABLE "system_settings" ADD CONSTRAINT "system_settings_group_nonempty"
  CHECK (length(trim("group")) > 0);

-- ─────────────────────────────────────────────────────────────────
-- Temporal sanity
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE "leads" ADD CONSTRAINT "leads_callbackDate_after_created"
  CHECK ("callbackDate" IS NULL OR "callbackDate" >= "createdAt");

-- v14 already enforces dateOfBirth <= CURRENT_DATE. This adds the
-- floor — catches 4-digit-year typos like '1099-04-12' that the upper
-- bound alone won't reject.
ALTER TABLE "patients" ADD CONSTRAINT "patients_dob_floor"
  CHECK ("dateOfBirth" >= '1900-01-01');

-- ─────────────────────────────────────────────────────────────────
-- Workflow stamp consistency — mirror the refunds approver CHECK from v17
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE "doctor_leaves" ADD CONSTRAINT "doctor_leaves_approvedById_when_approved"
  CHECK (status <> 'APPROVED' OR "approvedById" IS NOT NULL);

-- ─────────────────────────────────────────────────────────────────
-- Reporting indexes
-- ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "notifications_type_idx"
  ON "notifications" ("type");

CREATE INDEX IF NOT EXISTS "patients_gender_idx"
  ON "patients" ("gender");

CREATE INDEX IF NOT EXISTS "blocked_slots_type_idx"
  ON "blocked_slots" ("type");

CREATE INDEX IF NOT EXISTS "communication_logs_direction_idx"
  ON "communication_logs" ("direction");

COMMIT;
