-- v53 — Per-tenant scoping for clinical codes
--
-- Until v52 we kept clinical codes (patientCode, appointmentCode,
-- invoiceNumber) and branches.code globally unique. In a single-
-- tenant deployment that's fine; for multi-tenant SaaS it means two
-- workspaces can't both have a "Main Clinic" branch or both produce
-- PT-0001 — onboarding hits 409 collisions across tenants.
--
-- v53 swaps the global indexes for composite (tenantId, code) ones,
-- mirroring the v51 (tenantId, email) pattern on users. Tables that
-- gained tenantId here: patients, appointments, invoices. Each
-- inherits its tenant from branch.tenantId; a BEFORE INSERT/UPDATE
-- trigger keeps the denormalized column honest, so the column can't
-- drift from the branch's actual tenant.
--
-- The single existing tenant (nakhoda) has 6 patients / 7 appts /
-- 4 invoices — backfill is trivial.

-- ===================================================================
-- 1. Add tenantId columns (nullable to allow backfill, then NOT NULL)
-- ===================================================================

ALTER TABLE "patients"     ADD COLUMN IF NOT EXISTS "tenantId" UUID;
ALTER TABLE "appointments" ADD COLUMN IF NOT EXISTS "tenantId" UUID;
ALTER TABLE "invoices"     ADD COLUMN IF NOT EXISTS "tenantId" UUID;

-- Backfill from branch.tenantId
UPDATE "patients"     p SET "tenantId" = b."tenantId" FROM "branches" b WHERE b.id = p."branchId" AND p."tenantId" IS NULL;
UPDATE "appointments" a SET "tenantId" = b."tenantId" FROM "branches" b WHERE b.id = a."branchId" AND a."tenantId" IS NULL;
UPDATE "invoices"     i SET "tenantId" = b."tenantId" FROM "branches" b WHERE b.id = i."branchId" AND i."tenantId" IS NULL;

-- Lock NOT NULL + FK
ALTER TABLE "patients"     ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "appointments" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "invoices"     ALTER COLUMN "tenantId" SET NOT NULL;

ALTER TABLE "patients"
  ADD CONSTRAINT "patients_tenant_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE "appointments"
  ADD CONSTRAINT "appointments_tenant_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE "invoices"
  ADD CONSTRAINT "invoices_tenant_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"(id) ON UPDATE CASCADE ON DELETE RESTRICT;

-- Helper indexes (composite-unique below uses tenantId as prefix
-- so we don't need a separate (tenantId) index for join speed).

-- ===================================================================
-- 2. Triggers — keep tenantId synced with branch.tenantId
-- ===================================================================

CREATE OR REPLACE FUNCTION patients_enforce_branch_tenant()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  branch_tenant UUID;
BEGIN
  SELECT "tenantId" INTO branch_tenant FROM branches WHERE id = NEW."branchId";
  IF branch_tenant IS NULL THEN
    RAISE EXCEPTION 'patients.branchId % refers to a non-existent branch', NEW."branchId";
  END IF;
  IF NEW."tenantId" <> branch_tenant THEN
    RAISE EXCEPTION 'patients.tenantId (%) must match the branch''s tenantId (%) for branchId %',
      NEW."tenantId", branch_tenant, NEW."branchId";
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS patients_enforce_branch_tenant_trg ON "patients";
CREATE TRIGGER patients_enforce_branch_tenant_trg
  BEFORE INSERT OR UPDATE OF "branchId", "tenantId" ON "patients"
  FOR EACH ROW EXECUTE FUNCTION patients_enforce_branch_tenant();

CREATE OR REPLACE FUNCTION appointments_enforce_branch_tenant()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  branch_tenant UUID;
BEGIN
  SELECT "tenantId" INTO branch_tenant FROM branches WHERE id = NEW."branchId";
  IF branch_tenant IS NULL THEN
    RAISE EXCEPTION 'appointments.branchId % refers to a non-existent branch', NEW."branchId";
  END IF;
  IF NEW."tenantId" <> branch_tenant THEN
    RAISE EXCEPTION 'appointments.tenantId (%) must match branch.tenantId (%) for branchId %',
      NEW."tenantId", branch_tenant, NEW."branchId";
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS appointments_enforce_branch_tenant_trg ON "appointments";
CREATE TRIGGER appointments_enforce_branch_tenant_trg
  BEFORE INSERT OR UPDATE OF "branchId", "tenantId" ON "appointments"
  FOR EACH ROW EXECUTE FUNCTION appointments_enforce_branch_tenant();

CREATE OR REPLACE FUNCTION invoices_enforce_branch_tenant()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  branch_tenant UUID;
BEGIN
  SELECT "tenantId" INTO branch_tenant FROM branches WHERE id = NEW."branchId";
  IF branch_tenant IS NULL THEN
    RAISE EXCEPTION 'invoices.branchId % refers to a non-existent branch', NEW."branchId";
  END IF;
  IF NEW."tenantId" <> branch_tenant THEN
    RAISE EXCEPTION 'invoices.tenantId (%) must match branch.tenantId (%) for branchId %',
      NEW."tenantId", branch_tenant, NEW."branchId";
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS invoices_enforce_branch_tenant_trg ON "invoices";
CREATE TRIGGER invoices_enforce_branch_tenant_trg
  BEFORE INSERT OR UPDATE OF "branchId", "tenantId" ON "invoices"
  FOR EACH ROW EXECUTE FUNCTION invoices_enforce_branch_tenant();

-- ===================================================================
-- 3. Swap global unique indexes for composite (tenantId, code) ones
-- ===================================================================

-- patients.patientCode — was globally unique, now per-tenant
ALTER TABLE "patients" DROP CONSTRAINT IF EXISTS "patients_patientCode_key";
DROP INDEX IF EXISTS "patients_patientCode_key";
CREATE UNIQUE INDEX "patients_tenantId_patientCode_key"
  ON "patients" ("tenantId", "patientCode");

-- patients.email — partial unique (where email IS NOT NULL AND deletedAt IS NULL)
DROP INDEX IF EXISTS "patients_email_active_unique";
CREATE UNIQUE INDEX "patients_tenantId_email_active_unique"
  ON "patients" ("tenantId", "email")
  WHERE email IS NOT NULL AND "deletedAt" IS NULL;

-- appointments.appointmentCode
ALTER TABLE "appointments" DROP CONSTRAINT IF EXISTS "appointments_appointmentCode_key";
DROP INDEX IF EXISTS "appointments_appointmentCode_key";
CREATE UNIQUE INDEX "appointments_tenantId_appointmentCode_key"
  ON "appointments" ("tenantId", "appointmentCode");

-- invoices.invoiceNumber
ALTER TABLE "invoices" DROP CONSTRAINT IF EXISTS "invoices_invoiceNumber_key";
DROP INDEX IF EXISTS "invoices_invoiceNumber_key";
CREATE UNIQUE INDEX "invoices_tenantId_invoiceNumber_key"
  ON "invoices" ("tenantId", "invoiceNumber");

-- branches.code
ALTER TABLE "branches" DROP CONSTRAINT IF EXISTS "branches_code_key";
DROP INDEX IF EXISTS "branches_code_key";
CREATE UNIQUE INDEX "branches_tenantId_code_key"
  ON "branches" ("tenantId", "code");
