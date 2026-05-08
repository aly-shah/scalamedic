-- v60 — Denial-reason taxonomy
--
-- Per-tenant master of common claim denial reasons. The free-text
-- InsuranceClaim.denialReason still works for one-off cases; the
-- new denialReasonCodeId FK snaps to a curated taxonomy so reports
-- can group "all claims denied for missing pre-auth" without fuzzy
-- text matching.

CREATE TABLE "denial_reasons" (
  "id"          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"    UUID NOT NULL,
  "code"        VARCHAR(40)  NOT NULL,
  "description" VARCHAR(200) NOT NULL,
  "isCommon"    BOOLEAN NOT NULL DEFAULT false,
  "isActive"    BOOLEAN NOT NULL DEFAULT true,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "denial_reasons_tenant_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT "denial_reasons_code_format"
    CHECK ("code" ~ '^[A-Z0-9][A-Z0-9-]{1,38}[A-Z0-9]$'),
  CONSTRAINT "denial_reasons_description_nonempty"
    CHECK (length(trim("description")) > 0),
  CONSTRAINT "denial_reasons_updatedAt_after_createdAt"
    CHECK ("updatedAt" >= "createdAt")
);

CREATE UNIQUE INDEX "denial_reasons_tenantId_code_key" ON "denial_reasons" ("tenantId", "code");
CREATE INDEX "denial_reasons_tenantId_isCommon_isActive_idx" ON "denial_reasons" ("tenantId", "isCommon", "isActive");

-- ============================================================
-- InsuranceClaim.denialReasonCodeId — optional FK
-- ============================================================
ALTER TABLE "insurance_claims"
  ADD COLUMN IF NOT EXISTS "denialReasonCodeId" UUID;

ALTER TABLE "insurance_claims"
  ADD CONSTRAINT "insurance_claims_denialReasonCode_fkey"
  FOREIGN KEY ("denialReasonCodeId") REFERENCES "denial_reasons"("id")
  ON UPDATE CASCADE ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "insurance_claims_denialReasonCodeId_idx"
  ON "insurance_claims" ("denialReasonCodeId");

-- ============================================================
-- Seed — common health-insurance denial reasons per active tenant
-- ============================================================
INSERT INTO "denial_reasons" ("id", "tenantId", "code", "description", "isCommon")
SELECT gen_random_uuid(), t.id, r.code, r.description, r."isCommon"
FROM tenants t
CROSS JOIN (VALUES
  ('AUTH-MISSING',     'Pre-authorization not obtained',                       true),
  ('AUTH-EXPIRED',     'Pre-authorization expired before service date',        false),
  ('NOT-COVERED',      'Service not covered under the plan',                   true),
  ('NOT-MEDICAL',      'Procedure deemed cosmetic / not medically necessary',  true),
  ('PATIENT-INELIG',   'Patient not eligible on the date of service',          true),
  ('POLICY-LAPSED',    'Policy lapsed or premium unpaid',                      false),
  ('DUPLICATE',        'Duplicate claim submission',                           false),
  ('DOC-MISSING',      'Supporting documentation incomplete',                  true),
  ('DX-MISMATCH',      'Diagnosis does not support the procedure billed',     true),
  ('CODING-ERROR',     'Incorrect coding (CPT / ICD-10)',                      false),
  ('NETWORK-OOO',      'Provider is out-of-network',                           false),
  ('FREQ-LIMIT',       'Frequency / annual limit exceeded',                    false),
  ('TIMELY-FILE',      'Claim submitted after timely-filing deadline',         false),
  ('COB',              'Coordination of benefits — primary payer first',       false),
  ('OTHER',            'Other reason — see free-text notes',                   true)
) AS r(code, description, "isCommon")
WHERE t."isActive" = true
ON CONFLICT ("tenantId", "code") DO NOTHING;
