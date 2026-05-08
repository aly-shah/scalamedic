-- v36 — Tenant resolution layer
-- ==============================
-- Phase 0.4 of the strategic roadmap.
--
-- Introduces the Tenant model + makes tenantId required on Branch
-- and User. The current single-clinic deployment becomes one Tenant
-- row ("Nakhoda Skin Institute"); the existing 3 branches all
-- belong to that tenant. Future SaaS expansion adds more tenants
-- without touching this schema again.
--
-- Sequence:
--   1. Create the `tenants` table.
--   2. Insert the default tenant row (Nakhoda) using a known UUID
--      derived from a deterministic literal, so dev/prod migrations
--      land on the same id and seeded references are stable.
--   3. Add `tenantId` (nullable) to branches + users, backfill to
--      the default tenant, then ALTER to NOT NULL + add FK.
--   4. Index + tighten constraints.

-- ─── 1. tenants table ─────────────────────────────────────────
CREATE TABLE tenants (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            VARCHAR(60)  NOT NULL UNIQUE,
  name            VARCHAR(150) NOT NULL,
  "legalName"     VARCHAR(200),
  "shortName"     VARCHAR(60),
  "logoUrl"       TEXT,
  "faviconUrl"    TEXT,
  "mfaIssuer"     VARCHAR(60),
  "poweredByLine" VARCHAR(80),
  "primaryColor"  VARCHAR(20),
  "isActive"      BOOLEAN      NOT NULL DEFAULT true,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL,

  CONSTRAINT tenants_slug_format
    CHECK (slug ~ '^[a-z0-9][a-z0-9-]*[a-z0-9]$' OR slug ~ '^[a-z0-9]$'),
  CONSTRAINT tenants_name_nonempty
    CHECK (length(trim(name)) > 0),
  CONSTRAINT tenants_legalName_nonempty
    CHECK ("legalName" IS NULL OR length(trim("legalName")) > 0),
  CONSTRAINT tenants_shortName_nonempty
    CHECK ("shortName" IS NULL OR length(trim("shortName")) > 0)
);

CREATE INDEX tenants_isActive_idx ON tenants("isActive");

-- ─── 2. Seed the default tenant ────────────────────────────────
-- Stable UUID so the same id appears in dev/staging/prod. Derived
-- from MD5 of "scalamedic:nakhoda" cast as UUID; deterministic and
-- recognizable.
INSERT INTO tenants (id, slug, name, "legalName", "shortName",
                     "logoUrl", "mfaIssuer", "poweredByLine", "updatedAt")
VALUES (
  '00000000-0000-4000-8000-000000000001'::uuid,
  'nakhoda',
  'Dr. Nakhoda''s Skin Institute',
  'Dr. Nakhoda''s Skin Institute (Pvt) Ltd',
  'Nakhoda Skin',
  '/drnakhoda-logo.png',
  'ScalaMedic',
  'Powered by Scalamatic',
  CURRENT_TIMESTAMP
);

-- ─── 3. branches.tenantId ─────────────────────────────────────
ALTER TABLE branches
  ADD COLUMN "tenantId" UUID;

UPDATE branches
  SET "tenantId" = '00000000-0000-4000-8000-000000000001'::uuid;

ALTER TABLE branches
  ALTER COLUMN "tenantId" SET NOT NULL;

ALTER TABLE branches
  ADD CONSTRAINT branches_tenant_fkey
    FOREIGN KEY ("tenantId") REFERENCES tenants(id) ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX branches_tenantId_idx ON branches("tenantId");

-- ─── 4. users.tenantId ────────────────────────────────────────
-- Each user inherits their tenant from their branch. Backfill via
-- a join, then enforce NOT NULL + FK.
ALTER TABLE users
  ADD COLUMN "tenantId" UUID;

UPDATE users u
   SET "tenantId" = b."tenantId"
  FROM branches b
 WHERE u."branchId" = b.id;

ALTER TABLE users
  ALTER COLUMN "tenantId" SET NOT NULL;

ALTER TABLE users
  ADD CONSTRAINT users_tenant_fkey
    FOREIGN KEY ("tenantId") REFERENCES tenants(id) ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX users_tenantId_idx ON users("tenantId");
