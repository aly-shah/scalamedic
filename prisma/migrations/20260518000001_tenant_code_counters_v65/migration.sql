-- v65: tenant_code_counters — race-safe per-tenant code generation
--
-- The existing pattern across the codebase is MAX(code) + 1 inside
-- a transaction for PT-NNNN / APT-NNNN / INV-YYYY-NNNN / CLM-YYYY-NNNN.
-- That's correct under low concurrency (the entire dance is in one
-- $transaction so MAX is consistent within the txn) but not race-
-- safe across concurrent transactions — both readers see the same
-- MAX and the second INSERT wins on the per-tenant unique index,
-- throwing a 409 the user has to retry.
--
-- This table + the nextCode() helper in src/lib/tenant-codes.ts
-- centralise the counter. The helper uses INSERT … ON CONFLICT DO
-- UPDATE … RETURNING in one statement, which is atomic at the row
-- level and never collides regardless of concurrency.
--
-- Initial seed: backfill the counter from current MAX() values so
-- new codes start at MAX+1 and never collide with legacy rows.

CREATE TABLE tenant_code_counters (
  "tenantId"   UUID         NOT NULL,
  "codePrefix" VARCHAR(8)   NOT NULL,
  "nextNumber" INTEGER      NOT NULL CHECK ("nextNumber" >= 1),
  "createdAt"  TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  "updatedAt"  TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  PRIMARY KEY ("tenantId", "codePrefix"),
  CONSTRAINT tenant_code_counters_tenant_fkey
    FOREIGN KEY ("tenantId") REFERENCES tenants(id)
    ON DELETE CASCADE ON UPDATE CASCADE
);

-- Backfill: scan existing tables for each prefix and prime the
-- counter at MAX+1. NULLIF + COALESCE protects against tenants
-- with zero rows of a given kind.
INSERT INTO tenant_code_counters ("tenantId", "codePrefix", "nextNumber")
SELECT
  t.id,
  'PT',
  COALESCE(
    (SELECT MAX(NULLIF(REGEXP_REPLACE(p."patientCode", '^PT-', ''), '')::INTEGER)
       FROM patients p
       WHERE p."tenantId" = t.id AND p."patientCode" ~ '^PT-\d+$'),
    0
  ) + 1
FROM tenants t
ON CONFLICT DO NOTHING;

INSERT INTO tenant_code_counters ("tenantId", "codePrefix", "nextNumber")
SELECT
  t.id,
  'APT',
  COALESCE(
    (SELECT MAX(NULLIF(REGEXP_REPLACE(a."appointmentCode", '^APT-', ''), '')::INTEGER)
       FROM appointments a
       WHERE a."tenantId" = t.id AND a."appointmentCode" ~ '^APT-\d+$'),
    0
  ) + 1
FROM tenants t
ON CONFLICT DO NOTHING;

-- INV-YYYY-NNNN — the YYYY changes annually, so the counter is
-- effectively a high-water-mark within a year. We seed for the
-- current year only; rollover handling lives in the helper.
INSERT INTO tenant_code_counters ("tenantId", "codePrefix", "nextNumber")
SELECT
  t.id,
  'INV-' || TO_CHAR(NOW(), 'YYYY'),
  COALESCE(
    (SELECT MAX(NULLIF(REGEXP_REPLACE(i."invoiceNumber", '^INV-\d{4}-', ''), '')::INTEGER)
       FROM invoices i
       WHERE i."tenantId" = t.id
         AND i."invoiceNumber" ~ ('^INV-' || TO_CHAR(NOW(), 'YYYY') || '-\d+$')),
    0
  ) + 1
FROM tenants t
ON CONFLICT DO NOTHING;

-- CLM-YYYY-NNNN — same shape as invoices.
INSERT INTO tenant_code_counters ("tenantId", "codePrefix", "nextNumber")
SELECT
  t.id,
  'CLM-' || TO_CHAR(NOW(), 'YYYY'),
  COALESCE(
    (SELECT MAX(NULLIF(REGEXP_REPLACE(c."claimNumber", '^CLM-\d{4}-', ''), '')::INTEGER)
       FROM insurance_claims c
       WHERE c."tenantId" = t.id
         AND c."claimNumber" ~ ('^CLM-' || TO_CHAR(NOW(), 'YYYY') || '-\d+$')),
    0
  ) + 1
FROM tenants t
ON CONFLICT DO NOTHING;
