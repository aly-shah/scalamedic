-- v40 — Procedure Protocols
-- ==========================
-- Phase 2.3 of the strategic roadmap.
--
-- Reusable templates for in-clinic procedures (HydraFacial, PRP,
-- Carbon Laser, peels, hair restoration, etc.). When a Procedure
-- is initiated from a protocol, the consent text + photo angles +
-- machine setting defaults + aftercare guidance pre-fill, AND the
-- protocol payload at that moment is frozen onto the Procedure as
-- `protocolSnapshot` so future template edits don't rewrite the
-- historical record.
--
-- Two changes:
--   1. New `procedure_protocols` table (per-tenant template).
--   2. Procedure rows gain `protocolId` + `protocolSnapshot` +
--      `consentSignedAt` + `consentSignedById` (e-consent
--      provenance) so we know who witnessed which template at
--      what time.

-- ─── Procedure new columns ─────────────────────────────────────
ALTER TABLE procedures
  ADD COLUMN "protocolId"        UUID,
  ADD COLUMN "protocolSnapshot"  JSONB,
  ADD COLUMN "consentSignedAt"   TIMESTAMPTZ(6),
  ADD COLUMN "consentSignedById" UUID;

ALTER TABLE procedures
  ADD CONSTRAINT procedures_consentWitness_fkey
    FOREIGN KEY ("consentSignedById") REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX procedures_consentSignedById_idx ON procedures("consentSignedById");

-- procedure_protocols FK is added below after the table is created.

-- E-consent integrity: if consentSigned=true the row must capture
-- WHO signed (witnessing staff) and WHEN. Mirrors the e-signature
-- pattern from v33 on consultation_notes.
ALTER TABLE procedures
  ADD CONSTRAINT procedures_consentSignedAt_when_signed
    CHECK ("consentSigned" = false OR "consentSignedAt" IS NOT NULL),
  ADD CONSTRAINT procedures_consentSignedById_when_signed
    CHECK ("consentSigned" = false OR "consentSignedById" IS NOT NULL),
  ADD CONSTRAINT procedures_consentSignedAt_after_created
    CHECK ("consentSignedAt" IS NULL OR "consentSignedAt" >= "createdAt"),
  -- protocolSnapshot must be a JSON object (not array, not null
  -- when protocolId is set) so the audit reader can rely on its
  -- shape.
  ADD CONSTRAINT procedures_protocolSnapshot_is_object
    CHECK ("protocolSnapshot" IS NULL OR jsonb_typeof("protocolSnapshot") = 'object'),
  ADD CONSTRAINT procedures_protocolSnapshot_when_protocol
    CHECK ("protocolId" IS NULL OR "protocolSnapshot" IS NOT NULL);

-- ─── procedure_protocols table ─────────────────────────────────
CREATE TABLE procedure_protocols (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"    UUID         NOT NULL,
  "branchId"    UUID,
  name          VARCHAR(120) NOT NULL,
  description   TEXT,
  "treatmentId" UUID,
  "consentTemplate"        TEXT,
  "requiredBeforePhotos"   TEXT[]   NOT NULL DEFAULT ARRAY[]::TEXT[],
  "requiredAfterPhotos"    TEXT[]   NOT NULL DEFAULT ARRAY[]::TEXT[],
  "machineSettings"        JSONB,
  "aftercareInstructions"  TEXT,
  "suggestedFollowUpDays"  INTEGER,
  "rxKitName"   VARCHAR(60),
  "estimatedDurationMinutes" INTEGER,
  version       INTEGER      NOT NULL DEFAULT 1,
  "isActive"    BOOLEAN      NOT NULL DEFAULT true,
  "createdById" UUID         NOT NULL,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,

  CONSTRAINT procedure_protocols_tenant_fkey
    FOREIGN KEY ("tenantId") REFERENCES tenants(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT procedure_protocols_branch_fkey
    FOREIGN KEY ("branchId") REFERENCES branches(id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT procedure_protocols_treatment_fkey
    FOREIGN KEY ("treatmentId") REFERENCES treatments(id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT procedure_protocols_creator_fkey
    FOREIGN KEY ("createdById") REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,

  CONSTRAINT procedure_protocols_name_nonempty
    CHECK (length(trim(name)) > 0),
  CONSTRAINT procedure_protocols_description_nonempty
    CHECK (description IS NULL OR length(trim(description)) > 0),
  CONSTRAINT procedure_protocols_consentTemplate_nonempty
    CHECK ("consentTemplate" IS NULL OR length(trim("consentTemplate")) > 0),
  CONSTRAINT procedure_protocols_aftercareInstructions_nonempty
    CHECK ("aftercareInstructions" IS NULL OR length(trim("aftercareInstructions")) > 0),
  CONSTRAINT procedure_protocols_rxKitName_nonempty
    CHECK ("rxKitName" IS NULL OR length(trim("rxKitName")) > 0),
  CONSTRAINT procedure_protocols_machineSettings_is_object
    CHECK ("machineSettings" IS NULL OR jsonb_typeof("machineSettings") = 'object'),
  -- Photo arrays: forbid blank entries (the UI passes raw user
  -- input through; a stray empty string would render as a ghost
  -- requirement).
  CONSTRAINT procedure_protocols_beforePhotos_no_empty
    CHECK (NOT ('' = ANY ("requiredBeforePhotos"))),
  CONSTRAINT procedure_protocols_afterPhotos_no_empty
    CHECK (NOT ('' = ANY ("requiredAfterPhotos"))),
  CONSTRAINT procedure_protocols_suggestedFollowUpDays_range
    CHECK ("suggestedFollowUpDays" IS NULL OR ("suggestedFollowUpDays" >= 1 AND "suggestedFollowUpDays" <= 365)),
  CONSTRAINT procedure_protocols_estimatedDurationMinutes_range
    CHECK ("estimatedDurationMinutes" IS NULL OR ("estimatedDurationMinutes" >= 5 AND "estimatedDurationMinutes" <= 480)),
  CONSTRAINT procedure_protocols_version_positive
    CHECK (version >= 1)
);

CREATE INDEX procedure_protocols_tenant_idx
  ON procedure_protocols("tenantId");
CREATE INDEX procedure_protocols_branch_idx
  ON procedure_protocols("branchId");
CREATE INDEX procedure_protocols_treatment_idx
  ON procedure_protocols("treatmentId");
CREATE INDEX procedure_protocols_active_tenant_idx
  ON procedure_protocols("isActive", "tenantId");

-- Now wire up the procedures.protocolId FK (the table exists).
ALTER TABLE procedures
  ADD CONSTRAINT procedures_protocol_fkey
    FOREIGN KEY ("protocolId") REFERENCES procedure_protocols(id) ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX procedures_protocolId_idx ON procedures("protocolId");
