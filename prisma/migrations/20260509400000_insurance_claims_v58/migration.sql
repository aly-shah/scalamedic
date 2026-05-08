-- v58 — Insurance claims (Tier 4.4)
--
-- One row per submission to an insurer. Numbers are per-tenant
-- unique using CLM-YYYY-NNNN, mirroring the v53 invoiceNumber
-- pattern.
--
-- Constraints upfront (no v59 hardening pass needed):
--   - Numeric sanity: claimedAmount > 0, others >= 0, approved <=
--     claimed, paid <= approved.
--   - Status/timestamp consistency: DRAFT has no submittedAt; once
--     submitted, submittedAt is set; decision states have decidedAt
--     and approvedAmount; PAID has paidAt.
--   - Date ordering: submitted <= decided <= paid.
--   - claimNumber regex CLM-YYYY-NNNN.
--   - diagnosisCodes elements match ICD-10 format (mirrors v57).
--   - Tenant scoping enforced via trigger (v53 pattern).

-- ============================================================
-- 1. Status enum
-- ============================================================
CREATE TYPE "InsuranceClaimStatus" AS ENUM (
  'DRAFT', 'SUBMITTED', 'IN_REVIEW',
  'APPROVED', 'PARTIAL', 'DENIED',
  'PAID', 'APPEALED', 'CANCELLED'
);

-- ============================================================
-- 2. Table
-- ============================================================
CREATE TABLE "insurance_claims" (
  "id"              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "claimNumber"     VARCHAR(30) NOT NULL,

  "invoiceId"       UUID NOT NULL,
  "patientId"       UUID NOT NULL,
  "insuranceId"     UUID NOT NULL,
  "branchId"        UUID NOT NULL,
  "tenantId"        UUID NOT NULL,

  "diagnosisCodes"  TEXT[] NOT NULL DEFAULT '{}',

  "claimedAmount"   DECIMAL(14, 2) NOT NULL,
  "approvedAmount"  DECIMAL(14, 2),
  "paidAmount"      DECIMAL(14, 2) NOT NULL DEFAULT 0,
  "copayCollected"  DECIMAL(14, 2) NOT NULL DEFAULT 0,

  "status"          "InsuranceClaimStatus" NOT NULL DEFAULT 'DRAFT',

  "submittedAt"     TIMESTAMPTZ,
  "decidedAt"       TIMESTAMPTZ,
  "paidAt"          TIMESTAMPTZ,

  "insurerReference" VARCHAR(80),
  "denialReason"    TEXT,
  "notes"           TEXT,

  "createdById"     UUID NOT NULL,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  -- ─── FKs ───────────────────────────────────────────────
  CONSTRAINT "insurance_claims_invoice_fkey"
    FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT "insurance_claims_patient_fkey"
    FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT "insurance_claims_insurance_fkey"
    FOREIGN KEY ("insuranceId") REFERENCES "insurances"("id") ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT "insurance_claims_branch_fkey"
    FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT "insurance_claims_tenant_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT "insurance_claims_createdBy_fkey"
    FOREIGN KEY ("createdById") REFERENCES "users"("id") ON UPDATE CASCADE ON DELETE RESTRICT,

  -- ─── Format / nonempty ─────────────────────────────────
  CONSTRAINT "insurance_claims_claimNumber_format"
    CHECK ("claimNumber" ~ '^CLM-[0-9]{4}-[0-9]{4,}$'),
  CONSTRAINT "insurance_claims_insurerReference_nonempty"
    CHECK ("insurerReference" IS NULL OR length(trim("insurerReference")) > 0),
  CONSTRAINT "insurance_claims_denialReason_nonempty"
    CHECK ("denialReason" IS NULL OR length(trim("denialReason")) > 0),
  CONSTRAINT "insurance_claims_notes_nonempty"
    CHECK ("notes" IS NULL OR length(trim("notes")) > 0),
  CONSTRAINT "insurance_claims_diagnosisCodes_format"
    CHECK (
      array_to_string("diagnosisCodes", '|') ~ '^([A-Z][0-9]{2}(\.[0-9A-Z]{1,4})?(\||$))*$'
    ),

  -- ─── Numeric sanity ────────────────────────────────────
  CONSTRAINT "insurance_claims_claimedAmount_positive"
    CHECK ("claimedAmount" > 0),
  CONSTRAINT "insurance_claims_approvedAmount_nonneg"
    CHECK ("approvedAmount" IS NULL OR "approvedAmount" >= 0),
  CONSTRAINT "insurance_claims_paidAmount_nonneg"
    CHECK ("paidAmount" >= 0),
  CONSTRAINT "insurance_claims_copayCollected_nonneg"
    CHECK ("copayCollected" >= 0),
  CONSTRAINT "insurance_claims_approved_le_claimed"
    CHECK ("approvedAmount" IS NULL OR "approvedAmount" <= "claimedAmount"),
  CONSTRAINT "insurance_claims_paid_le_approved"
    CHECK (
      "approvedAmount" IS NULL
      OR "paidAmount" <= "approvedAmount"
    ),

  -- ─── Date ordering ─────────────────────────────────────
  CONSTRAINT "insurance_claims_submitted_after_created"
    CHECK ("submittedAt" IS NULL OR "submittedAt" >= "createdAt"),
  CONSTRAINT "insurance_claims_decided_after_submitted"
    CHECK ("decidedAt" IS NULL OR ("submittedAt" IS NOT NULL AND "decidedAt" >= "submittedAt")),
  CONSTRAINT "insurance_claims_paid_after_decided"
    CHECK ("paidAt" IS NULL OR ("decidedAt" IS NOT NULL AND "paidAt" >= "decidedAt")),
  CONSTRAINT "insurance_claims_updatedAt_after_createdAt"
    CHECK ("updatedAt" >= "createdAt"),

  -- ─── Status / lifecycle invariants ─────────────────────
  -- DRAFT must have no timestamps yet.
  CONSTRAINT "insurance_claims_draft_no_timestamps"
    CHECK (
      "status" <> 'DRAFT'
      OR ("submittedAt" IS NULL AND "decidedAt" IS NULL AND "paidAt" IS NULL)
    ),
  -- Once submitted (any non-DRAFT state except CANCELLED), submittedAt is required.
  CONSTRAINT "insurance_claims_submitted_when_active"
    CHECK (
      "status" IN ('DRAFT','CANCELLED')
      OR "submittedAt" IS NOT NULL
    ),
  -- Decision states must have decidedAt + approvedAmount.
  CONSTRAINT "insurance_claims_decision_complete"
    CHECK (
      "status" NOT IN ('APPROVED','PARTIAL','DENIED','PAID')
      OR ("decidedAt" IS NOT NULL AND "approvedAmount" IS NOT NULL)
    ),
  -- PAID requires paidAt.
  CONSTRAINT "insurance_claims_paid_has_paidAt"
    CHECK ("status" <> 'PAID' OR "paidAt" IS NOT NULL)
);

-- ============================================================
-- 3. Indexes
-- ============================================================
CREATE UNIQUE INDEX "insurance_claims_tenantId_claimNumber_key"
  ON "insurance_claims" ("tenantId", "claimNumber");
CREATE INDEX "insurance_claims_tenantId_idx"      ON "insurance_claims" ("tenantId");
CREATE INDEX "insurance_claims_patientId_idx"     ON "insurance_claims" ("patientId");
CREATE INDEX "insurance_claims_invoiceId_idx"     ON "insurance_claims" ("invoiceId");
CREATE INDEX "insurance_claims_insuranceId_idx"   ON "insurance_claims" ("insuranceId");
CREATE INDEX "insurance_claims_branchId_idx"      ON "insurance_claims" ("branchId");
CREATE INDEX "insurance_claims_status_idx"        ON "insurance_claims" ("status");
CREATE INDEX "insurance_claims_branchId_createdAt_idx"
  ON "insurance_claims" ("branchId", "createdAt" DESC);

-- ============================================================
-- 4. Tenant-scoping trigger (v53 pattern)
-- ============================================================
CREATE OR REPLACE FUNCTION insurance_claims_enforce_branch_tenant()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  branch_tenant UUID;
BEGIN
  SELECT "tenantId" INTO branch_tenant FROM branches WHERE id = NEW."branchId";
  IF branch_tenant IS NULL THEN
    RAISE EXCEPTION 'insurance_claims.branchId % refers to a non-existent branch', NEW."branchId";
  END IF;
  IF NEW."tenantId" <> branch_tenant THEN
    RAISE EXCEPTION 'insurance_claims.tenantId (%) must match branch.tenantId (%) for branchId %',
      NEW."tenantId", branch_tenant, NEW."branchId";
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS insurance_claims_enforce_branch_tenant_trg ON "insurance_claims";
CREATE TRIGGER insurance_claims_enforce_branch_tenant_trg
  BEFORE INSERT OR UPDATE OF "branchId", "tenantId" ON "insurance_claims"
  FOR EACH ROW EXECUTE FUNCTION insurance_claims_enforce_branch_tenant();
