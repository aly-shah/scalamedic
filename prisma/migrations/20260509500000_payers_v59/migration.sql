-- v59 — Payer master list
--
-- Per-tenant master of insurance companies. Replaces the free-text
-- Insurance.provider field for new entries; legacy rows keep their
-- string until manually edited.
--
-- Hardening upfront (no v60 hardening pass needed):
--   - code format (caps + digits + hyphens, 2-40 chars)
--   - name nonempty
--   - contactEmail / claimSubmissionEmail format (when set)
--   - contactPhone nonempty (when set)
--   - notes nonempty (when set)
--   - per-tenant unique on (tenantId, code) and (tenantId, name)

CREATE TABLE "payers" (
  "id"                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"              UUID NOT NULL,
  "name"                  VARCHAR(120) NOT NULL,
  "code"                  VARCHAR(40)  NOT NULL,
  "contactEmail"          VARCHAR(180),
  "claimSubmissionEmail"  VARCHAR(180),
  "contactPhone"          VARCHAR(32),
  "notes"                 TEXT,
  "isActive"              BOOLEAN NOT NULL DEFAULT true,
  "createdAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "payers_tenant_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT "payers_name_nonempty"
    CHECK (length(trim("name")) > 0),
  CONSTRAINT "payers_code_format"
    CHECK ("code" ~ '^[A-Z0-9][A-Z0-9-]{1,38}[A-Z0-9]$'),
  CONSTRAINT "payers_contactEmail_format"
    CHECK ("contactEmail" IS NULL OR "contactEmail" ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  CONSTRAINT "payers_claimSubmissionEmail_format"
    CHECK ("claimSubmissionEmail" IS NULL OR "claimSubmissionEmail" ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  CONSTRAINT "payers_contactPhone_nonempty"
    CHECK ("contactPhone" IS NULL OR length(trim("contactPhone")) > 0),
  CONSTRAINT "payers_notes_nonempty"
    CHECK ("notes" IS NULL OR length(trim("notes")) > 0),
  CONSTRAINT "payers_updatedAt_after_createdAt"
    CHECK ("updatedAt" >= "createdAt")
);

CREATE UNIQUE INDEX "payers_tenantId_code_key" ON "payers" ("tenantId", "code");
CREATE UNIQUE INDEX "payers_tenantId_name_key" ON "payers" ("tenantId", "name");
CREATE INDEX "payers_tenantId_isActive_idx"    ON "payers" ("tenantId", "isActive");

-- ============================================================
-- Insurance.payerId — nullable FK on rollout
-- ============================================================
ALTER TABLE "insurances"
  ADD COLUMN IF NOT EXISTS "payerId" UUID;

ALTER TABLE "insurances"
  ADD CONSTRAINT "insurances_payer_fkey"
  FOREIGN KEY ("payerId") REFERENCES "payers"("id") ON UPDATE CASCADE ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "insurances_payerId_idx" ON "insurances" ("payerId");

-- ============================================================
-- Seed — common Pakistani health/life payers per active tenant
-- ============================================================
-- Idempotent via ON CONFLICT (tenantId, code).
INSERT INTO "payers" ("id", "tenantId", "name", "code", "contactEmail", "contactPhone", "isActive")
SELECT gen_random_uuid(), t.id, p.name, p.code, p.email, p.phone, true
FROM tenants t
CROSS JOIN (VALUES
  ('EFU Life Assurance',           'EFU-LIFE',     'health@efulife.com',     '+92-21-111-338-111'),
  ('Adamjee Life Assurance',       'ADAMJEE-LIFE', 'health@adamjeelife.com', '+92-21-111-2326-3245'),
  ('Jubilee Life Insurance',       'JUBILEE-LIFE', 'health@jubileelife.com', '+92-21-111-111-554'),
  ('State Life Insurance',         'STATE-LIFE',   NULL,                     '+92-21-99202800'),
  ('NICL National Insurance',      'NICL',         NULL,                     '+92-21-99211212'),
  ('IGI Life',                     'IGI-LIFE',     'info@igi.com.pk',        '+92-21-111-308-308'),
  ('Allianz EFU Health',           'ALLIANZ-EFU',  'efuhealth@efuhealth.com','+92-21-3453-2960-2'),
  ('Salaam Family Takaful',        'SALAAM-TKFL',  'info@salaamtakaful.com', '+92-21-111-878-787'),
  ('TPL Life',                     'TPL-LIFE',     'info@tpllife.com',       '+92-21-111-000-300'),
  ('Self-pay (no insurer)',        'SELFPAY',      NULL,                     NULL)
) AS p(name, code, email, phone)
WHERE t."isActive" = true
ON CONFLICT ("tenantId", "code") DO NOTHING;
