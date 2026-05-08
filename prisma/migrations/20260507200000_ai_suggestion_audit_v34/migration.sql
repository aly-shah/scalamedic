-- v34 — AI Suggestion audit log
-- ==============================
-- Phase 0.2 of the strategic roadmap.
--
-- Foundation for Phase 1's Ambient AI Scribe v2: every AI-proposed
-- medication / lab / follow-up / diagnosis hint that the doctor
-- sees as a clickable affordance is recorded here BEFORE display,
-- with the model + prompt version. When the doctor accepts/rejects,
-- the row is updated. Why: malpractice defense, model-quality
-- monitoring, retroactive answers to "what did the AI suggest in
-- 2026 when it was on a different model?".
--
-- Two new enums + one new table.

CREATE TYPE "AISuggestionKind" AS ENUM (
  'MEDICATION',
  'LAB',
  'FOLLOWUP',
  'PROCEDURE',
  'NOTE_FIELD',
  'DIAGNOSIS_HINT'
);

CREATE TYPE "AISuggestionStatus" AS ENUM (
  'PENDING',
  'ACCEPTED',
  'REJECTED',
  'EXPIRED'
);

CREATE TABLE ai_suggestions (
  id              UUID                PRIMARY KEY DEFAULT gen_random_uuid(),
  kind            "AISuggestionKind"  NOT NULL,

  "patientId"     UUID,
  "appointmentId" UUID,
  "doctorId"      UUID                NOT NULL,
  "transcriptionId" UUID,

  payload         JSONB               NOT NULL,

  -- Provenance: required so we always know which model + prompt
  -- produced this suggestion.
  "modelId"       VARCHAR(80)         NOT NULL,
  "promptVersion" VARCHAR(40)         NOT NULL,

  status          "AISuggestionStatus" NOT NULL DEFAULT 'PENDING',
  "decidedAt"     TIMESTAMPTZ(6),
  "decidedById"   UUID,

  -- When the doctor accepts and we create a real artifact, capture
  -- the link so audit can trace suggestion -> clinical record.
  "acceptedEntityType" VARCHAR(40),
  "acceptedEntityId"   UUID,

  "rejectionReason" TEXT,

  "createdAt"     TIMESTAMP(3)        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3)        NOT NULL,

  CONSTRAINT ai_suggestions_patient_fkey
    FOREIGN KEY ("patientId") REFERENCES patients(id)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT ai_suggestions_appointment_fkey
    FOREIGN KEY ("appointmentId") REFERENCES appointments(id)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT ai_suggestions_doctor_fkey
    FOREIGN KEY ("doctorId") REFERENCES users(id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT ai_suggestions_decidedBy_fkey
    FOREIGN KEY ("decidedById") REFERENCES users(id)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT ai_suggestions_transcription_fkey
    FOREIGN KEY ("transcriptionId") REFERENCES ai_transcriptions(id)
    ON DELETE SET NULL ON UPDATE CASCADE,

  CONSTRAINT ai_suggestions_payload_is_object
    CHECK (jsonb_typeof(payload) = 'object'),
  CONSTRAINT ai_suggestions_modelId_nonempty
    CHECK (length(trim("modelId")) > 0),
  CONSTRAINT ai_suggestions_promptVersion_nonempty
    CHECK (length(trim("promptVersion")) > 0),
  CONSTRAINT ai_suggestions_rejectionReason_nonempty
    CHECK ("rejectionReason" IS NULL OR length(trim("rejectionReason")) > 0),
  CONSTRAINT ai_suggestions_acceptedEntityType_nonempty
    CHECK ("acceptedEntityType" IS NULL OR length(trim("acceptedEntityType")) > 0),
  -- A decision (ACCEPTED/REJECTED/EXPIRED) must capture WHEN it
  -- happened. PENDING leaves both null.
  CONSTRAINT ai_suggestions_decision_consistency
    CHECK (
      (status = 'PENDING' AND "decidedAt" IS NULL)
      OR
      (status <> 'PENDING' AND "decidedAt" IS NOT NULL)
    ),
  -- ACCEPTED suggestions that produced an artifact must record
  -- both type + id together.
  CONSTRAINT ai_suggestions_acceptedEntity_pair
    CHECK (
      ("acceptedEntityType" IS NULL AND "acceptedEntityId" IS NULL)
      OR
      ("acceptedEntityType" IS NOT NULL AND "acceptedEntityId" IS NOT NULL)
    )
);

CREATE INDEX ai_suggestions_doctor_created_idx
  ON ai_suggestions("doctorId", "createdAt" DESC);
CREATE INDEX ai_suggestions_patient_idx
  ON ai_suggestions("patientId");
CREATE INDEX ai_suggestions_appointment_idx
  ON ai_suggestions("appointmentId");
CREATE INDEX ai_suggestions_transcription_idx
  ON ai_suggestions("transcriptionId");
CREATE INDEX ai_suggestions_status_idx
  ON ai_suggestions(status);
CREATE INDEX ai_suggestions_kind_status_idx
  ON ai_suggestions(kind, status);
