-- v51 — Hostname-based tenant resolution
-- ========================================
-- Phase 3.1: the unlock for clinic #2.
--
-- Adds:
--   1. tenant_hostnames table — one row per FQDN that routes to
--      a tenant. Globally unique on hostname; partial unique
--      index enforces "at most one primary per tenant".
--   2. users.email becomes (tenantId, email) composite-unique.
--      The same email can exist as different users in different
--      tenants (the SaaS norm).
--
-- Seeded:
--   - nakhoda → crm.drnakhodas.com (PRIMARY)
--   - nakhoda → medical.scalamatic.com  (legacy snapshot box)
--   - nakhoda → localhost (dev)
--   - nakhoda → 127.0.0.1 (dev)
--
-- The middleware (src/middleware.ts) reads the incoming Host
-- header, looks up this table, and threads the resolved tenantId
-- into request headers downstream routes can read.

-- ─── tenant_hostnames table ──────────────────────────────────
CREATE TABLE tenant_hostnames (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"  UUID         NOT NULL,
  hostname    VARCHAR(120) NOT NULL UNIQUE,
  "isPrimary" BOOLEAN      NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT tenant_hostnames_tenant_fkey
    FOREIGN KEY ("tenantId") REFERENCES tenants(id)
    ON DELETE CASCADE ON UPDATE CASCADE,

  -- Hostnames are case-insensitive on the wire but stored
  -- lowercase here. Reject anything with uppercase chars or
  -- whitespace. Allow IPv4-style for dev (127.0.0.1) and
  -- single-label hostnames (localhost).
  CONSTRAINT tenant_hostnames_hostname_format
    CHECK (
      hostname = lower(hostname)
      AND length(trim(hostname)) > 0
      AND hostname ~ '^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$'
    )
);

CREATE INDEX tenant_hostnames_tenant_idx ON tenant_hostnames("tenantId");

-- Partial unique index: only ONE row may have isPrimary=true per
-- tenant. Plain UNIQUE on (tenantId, isPrimary) wouldn't work
-- because we DO want many isPrimary=false rows per tenant.
CREATE UNIQUE INDEX tenant_hostnames_one_primary_per_tenant
  ON tenant_hostnames("tenantId") WHERE "isPrimary" = true;

-- ─── Seed nakhoda's hostnames ────────────────────────────────
-- The single existing tenant; its UUID was minted in v36.
INSERT INTO tenant_hostnames ("tenantId", hostname, "isPrimary")
SELECT t.id, h.hostname, h.is_primary
FROM tenants t
CROSS JOIN (VALUES
  ('crm.drnakhodas.com'::varchar,       true),
  ('medical.scalamatic.com'::varchar,   false),
  ('localhost'::varchar,                false),
  ('127.0.0.1'::varchar,                false)
) AS h(hostname, is_primary)
WHERE t.slug = 'nakhoda';

-- ─── users.email: drop global UNIQUE, add composite ──────────
-- Prisma's `email @unique` creates a UNIQUE INDEX (not a CONSTRAINT)
-- so DROP INDEX is the correct verb here, not DROP CONSTRAINT. The
-- composite UNIQUE for (tenantId, email) takes its place; the
-- Prisma client now uses findUnique with a compound where clause.
DROP INDEX IF EXISTS users_email_key;

CREATE UNIQUE INDEX "users_tenantId_email_key"
  ON users("tenantId", email);
