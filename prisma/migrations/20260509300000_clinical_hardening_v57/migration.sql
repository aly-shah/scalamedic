-- v57 — Clinical hardening (post v55 ICD-10 + v56 photo scoring)
--
-- 1. consultation_notes.icd10Codes — DB-level format CHECK on array
--    elements (the route already filters via JS regex, but a direct
--    DB write or a future code path could bypass).
-- 2. photo_scores — nonempty / required CHECKs that match the
--    convention used everywhere else in the schema.
-- 3. photo_scores — updatedAt >= createdAt.
-- 4. icd10_codes.category — nonempty when not null.
--
-- All CHECKs are tolerant of existing data (verified via pre-flight
-- queries: 0 rows in consultation_notes have icd10Codes set; 0 rows
-- in photo_scores). Re-running is safe — DROP IF EXISTS first.

-- ============================================================
-- 1. consultation_notes.icd10Codes — array element format CHECK
-- ============================================================
-- The trick: join the array into a pipe-separated string and
-- regex-match the whole thing against an alternation pattern. An
-- empty array stringifies to '', which matches the 0-or-more body.
ALTER TABLE "consultation_notes"
  DROP CONSTRAINT IF EXISTS "consultation_notes_icd10Codes_format";
ALTER TABLE "consultation_notes"
  ADD CONSTRAINT "consultation_notes_icd10Codes_format"
  CHECK (
    array_to_string("icd10Codes", '|') ~ '^([A-Z][0-9]{2}(\.[0-9A-Z]{1,4})?(\||$))*$'
  );

-- ============================================================
-- 2. photo_scores — nonempty CHECKs on narrative + provenance fields
-- ============================================================
ALTER TABLE "photo_scores"
  DROP CONSTRAINT IF EXISTS "photo_scores_condition_nonempty";
ALTER TABLE "photo_scores"
  ADD CONSTRAINT "photo_scores_condition_nonempty"
  CHECK ("condition" IS NULL OR length(trim("condition")) > 0);

ALTER TABLE "photo_scores"
  DROP CONSTRAINT IF EXISTS "photo_scores_bodyArea_nonempty";
ALTER TABLE "photo_scores"
  ADD CONSTRAINT "photo_scores_bodyArea_nonempty"
  CHECK ("bodyArea" IS NULL OR length(trim("bodyArea")) > 0);

ALTER TABLE "photo_scores"
  DROP CONSTRAINT IF EXISTS "photo_scores_findings_nonempty";
ALTER TABLE "photo_scores"
  ADD CONSTRAINT "photo_scores_findings_nonempty"
  CHECK ("findings" IS NULL OR length(trim("findings")) > 0);

ALTER TABLE "photo_scores"
  DROP CONSTRAINT IF EXISTS "photo_scores_recommendations_nonempty";
ALTER TABLE "photo_scores"
  ADD CONSTRAINT "photo_scores_recommendations_nonempty"
  CHECK ("recommendations" IS NULL OR length(trim("recommendations")) > 0);

ALTER TABLE "photo_scores"
  DROP CONSTRAINT IF EXISTS "photo_scores_modelId_nonempty";
ALTER TABLE "photo_scores"
  ADD CONSTRAINT "photo_scores_modelId_nonempty"
  CHECK (length(trim("modelId")) > 0);

ALTER TABLE "photo_scores"
  DROP CONSTRAINT IF EXISTS "photo_scores_promptVersion_nonempty";
ALTER TABLE "photo_scores"
  ADD CONSTRAINT "photo_scores_promptVersion_nonempty"
  CHECK (length(trim("promptVersion")) > 0);

-- ============================================================
-- 3. photo_scores — updatedAt monotonic relative to createdAt
-- ============================================================
ALTER TABLE "photo_scores"
  DROP CONSTRAINT IF EXISTS "photo_scores_updatedAt_after_createdAt";
ALTER TABLE "photo_scores"
  ADD CONSTRAINT "photo_scores_updatedAt_after_createdAt"
  CHECK ("updatedAt" >= "createdAt");

-- ============================================================
-- 4. icd10_codes.category — nonempty when not null
-- ============================================================
ALTER TABLE "icd10_codes"
  DROP CONSTRAINT IF EXISTS "icd10_codes_category_nonempty";
ALTER TABLE "icd10_codes"
  ADD CONSTRAINT "icd10_codes_category_nonempty"
  CHECK ("category" IS NULL OR length(trim("category")) > 0);
