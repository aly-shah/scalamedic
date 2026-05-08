-- v56 — AI photo scoring (Tier 4.3)
--
-- One PhotoScore row per scored PatientDocument. Re-scoring replaces
-- the row (UNIQUE on documentId). Stores the model's structured
-- assessment (condition, severity, lesion count, narrative findings,
-- recommendations, confidence) plus model+prompt provenance so a
-- future audit can reconstruct what was analysed and by which model.

CREATE TABLE IF NOT EXISTS "photo_scores" (
  "id"              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "documentId"      UUID NOT NULL UNIQUE,
  "patientId"       UUID NOT NULL,

  "condition"       VARCHAR(120),
  "severity"        VARCHAR(20),
  "lesionCount"     INTEGER,
  "bodyArea"        VARCHAR(120),
  "findings"        TEXT,
  "recommendations" TEXT,
  "confidence"      INTEGER,

  "modelId"         VARCHAR(60) NOT NULL,
  "promptVersion"   VARCHAR(60) NOT NULL,
  "scoredById"      UUID NOT NULL,

  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "photo_scores_document_fkey"
    FOREIGN KEY ("documentId") REFERENCES "patient_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "photo_scores_patient_fkey"
    FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "photo_scores_scoredBy_fkey"
    FOREIGN KEY ("scoredById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,

  -- Sanity bounds
  CONSTRAINT "photo_scores_lesionCount_nonneg"
    CHECK ("lesionCount" IS NULL OR "lesionCount" >= 0),
  CONSTRAINT "photo_scores_confidence_range"
    CHECK ("confidence" IS NULL OR ("confidence" BETWEEN 0 AND 100)),
  CONSTRAINT "photo_scores_severity_known"
    CHECK ("severity" IS NULL OR "severity" IN ('MILD','MODERATE','SEVERE','UNCERTAIN'))
);

CREATE INDEX IF NOT EXISTS "photo_scores_patientId_createdAt_idx"
  ON "photo_scores" ("patientId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "photo_scores_scoredById_idx"
  ON "photo_scores" ("scoredById");
