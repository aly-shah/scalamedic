-- v21 — schema integrity refinements (round 11)
--
-- Pre-flight on prod confirmed every CHECK candidate had zero violations.
-- This pass closes out the remaining "empty string in nullable text"
-- columns that v18/v20 didn't already cover, plus a few array-element
-- integrity checks on Procedure's image / area arrays. Same rule:
-- if you're going to set a column, put something real in it.
--
-- Summary:
--   Patient demographics & notes:
--     patients.{address, city, nationality, notes}
--   Clinical text:
--     procedures.notes
--     triage_records.{notes, skinObservations}
--     medical_histories.notes
--     skin_histories.{treatmentHistory, notes}
--     patient_documents.notes
--     patient_allergies.{reaction, notes}
--     patient_medications.{dosage, frequency, prescriber}
--     ai_transcriptions.{rawTranscript, summary}
--   Reference data:
--     insurances.coverageType
--     leads.{interest, notes}
--     payments.{reference, notes}
--     refunds.{reference, notes}
--   Procedure array elements:
--     '' must NOT appear in beforeImages, afterImages, areasTreated
--   Indexes:
--     - triage_records(recordedById, createdAt DESC) — "my recorded triages"
--     - doctor_leaves(doctorId, startDate)           — "Dr X upcoming leaves"
--     - prescriptions(patientId, createdAt DESC)     — patient Rx timeline
--     - lab_tests(patientId, createdAt DESC)         — patient lab timeline

BEGIN;

-- ─────────────────────────────────────────────────────────────────
-- Optional-text non-empty CHECKs
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE "patients" ADD CONSTRAINT "patients_address_nonempty"
  CHECK (address IS NULL OR length(trim(address)) > 0);
ALTER TABLE "patients" ADD CONSTRAINT "patients_city_nonempty"
  CHECK (city IS NULL OR length(trim(city)) > 0);
ALTER TABLE "patients" ADD CONSTRAINT "patients_nationality_nonempty"
  CHECK (nationality IS NULL OR length(trim(nationality)) > 0);
ALTER TABLE "patients" ADD CONSTRAINT "patients_notes_nonempty"
  CHECK (notes IS NULL OR length(trim(notes)) > 0);

ALTER TABLE "procedures" ADD CONSTRAINT "procedures_notes_nonempty"
  CHECK (notes IS NULL OR length(trim(notes)) > 0);

ALTER TABLE "triage_records" ADD CONSTRAINT "triage_records_notes_nonempty"
  CHECK (notes IS NULL OR length(trim(notes)) > 0);
ALTER TABLE "triage_records" ADD CONSTRAINT "triage_records_skinObservations_nonempty"
  CHECK ("skinObservations" IS NULL OR length(trim("skinObservations")) > 0);

ALTER TABLE "medical_histories" ADD CONSTRAINT "medical_histories_notes_nonempty"
  CHECK (notes IS NULL OR length(trim(notes)) > 0);

ALTER TABLE "skin_histories" ADD CONSTRAINT "skin_histories_treatmentHistory_nonempty"
  CHECK ("treatmentHistory" IS NULL OR length(trim("treatmentHistory")) > 0);
ALTER TABLE "skin_histories" ADD CONSTRAINT "skin_histories_notes_nonempty"
  CHECK (notes IS NULL OR length(trim(notes)) > 0);

ALTER TABLE "patient_documents" ADD CONSTRAINT "patient_documents_notes_nonempty"
  CHECK (notes IS NULL OR length(trim(notes)) > 0);

ALTER TABLE "patient_allergies" ADD CONSTRAINT "patient_allergies_reaction_nonempty"
  CHECK (reaction IS NULL OR length(trim(reaction)) > 0);
ALTER TABLE "patient_allergies" ADD CONSTRAINT "patient_allergies_notes_nonempty"
  CHECK (notes IS NULL OR length(trim(notes)) > 0);

ALTER TABLE "patient_medications" ADD CONSTRAINT "patient_medications_dosage_nonempty"
  CHECK (dosage IS NULL OR length(trim(dosage)) > 0);
ALTER TABLE "patient_medications" ADD CONSTRAINT "patient_medications_frequency_nonempty"
  CHECK (frequency IS NULL OR length(trim(frequency)) > 0);
ALTER TABLE "patient_medications" ADD CONSTRAINT "patient_medications_prescriber_nonempty"
  CHECK (prescriber IS NULL OR length(trim(prescriber)) > 0);

ALTER TABLE "insurances" ADD CONSTRAINT "insurances_coverageType_nonempty"
  CHECK ("coverageType" IS NULL OR length(trim("coverageType")) > 0);

ALTER TABLE "leads" ADD CONSTRAINT "leads_interest_nonempty"
  CHECK (interest IS NULL OR length(trim(interest)) > 0);
ALTER TABLE "leads" ADD CONSTRAINT "leads_notes_nonempty"
  CHECK (notes IS NULL OR length(trim(notes)) > 0);

ALTER TABLE "payments" ADD CONSTRAINT "payments_reference_nonempty"
  CHECK (reference IS NULL OR length(trim(reference)) > 0);
ALTER TABLE "payments" ADD CONSTRAINT "payments_notes_nonempty"
  CHECK (notes IS NULL OR length(trim(notes)) > 0);

ALTER TABLE "refunds" ADD CONSTRAINT "refunds_reference_nonempty"
  CHECK (reference IS NULL OR length(trim(reference)) > 0);
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_notes_nonempty"
  CHECK (notes IS NULL OR length(trim(notes)) > 0);

ALTER TABLE "ai_transcriptions" ADD CONSTRAINT "ai_transcriptions_rawTranscript_nonempty"
  CHECK ("rawTranscript" IS NULL OR length(trim("rawTranscript")) > 0);
ALTER TABLE "ai_transcriptions" ADD CONSTRAINT "ai_transcriptions_summary_nonempty"
  CHECK (summary IS NULL OR length(trim(summary)) > 0);

-- ─────────────────────────────────────────────────────────────────
-- Procedure array element integrity — '' is never a valid URL or
-- area-treated label, so reject it everywhere it might leak in.
-- `'' = ANY(arr)` is immutable, so it's allowed in CHECK.
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE "procedures" ADD CONSTRAINT "procedures_areasTreated_no_empty"
  CHECK ("areasTreated" IS NULL OR NOT ('' = ANY("areasTreated")));
ALTER TABLE "procedures" ADD CONSTRAINT "procedures_beforeImages_no_empty"
  CHECK ("beforeImages" IS NULL OR NOT ('' = ANY("beforeImages")));
ALTER TABLE "procedures" ADD CONSTRAINT "procedures_afterImages_no_empty"
  CHECK ("afterImages" IS NULL OR NOT ('' = ANY("afterImages")));

-- ─────────────────────────────────────────────────────────────────
-- Composite indexes
-- ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "triage_records_recordedById_createdAt_idx"
  ON "triage_records" ("recordedById", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "doctor_leaves_doctorId_startDate_idx"
  ON "doctor_leaves" ("doctorId", "startDate");

CREATE INDEX IF NOT EXISTS "prescriptions_patientId_createdAt_idx"
  ON "prescriptions" ("patientId", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "lab_tests_patientId_createdAt_idx"
  ON "lab_tests" ("patientId", "createdAt" DESC);

COMMIT;
