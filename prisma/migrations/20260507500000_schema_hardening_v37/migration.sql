-- v37 — Schema hardening: plug gaps from v33–v36
-- ================================================
-- Plugs the obvious _nonempty / format / order gaps on columns
-- introduced by v33–v36, plus a cross-table tenant-consistency
-- trigger keeping user.tenantId aligned with branch.tenantId.
--
-- Pre-flight on production: 0 violators across all 8 proposed
-- constraints. All checks tolerate NULL where the column is
-- nullable, so the strictness only kicks in for non-null bad
-- values.

-- ─── tenants: brand-field nonempty + color format ──────────
ALTER TABLE tenants
  ADD CONSTRAINT tenants_logoUrl_nonempty
    CHECK ("logoUrl" IS NULL OR length(trim("logoUrl")) > 0),
  ADD CONSTRAINT tenants_faviconUrl_nonempty
    CHECK ("faviconUrl" IS NULL OR length(trim("faviconUrl")) > 0),
  ADD CONSTRAINT tenants_mfaIssuer_nonempty
    CHECK ("mfaIssuer" IS NULL OR length(trim("mfaIssuer")) > 0),
  ADD CONSTRAINT tenants_poweredByLine_nonempty
    CHECK ("poweredByLine" IS NULL OR length(trim("poweredByLine")) > 0),
  -- primaryColor accepts either a hex code (#RRGGBB or #RGB) or a
  -- simple Tailwind-palette-style identifier (e.g. "teal-600").
  -- Loose enough to support either theming approach without
  -- requiring a follow-up migration if we change palettes.
  ADD CONSTRAINT tenants_primaryColor_format
    CHECK (
      "primaryColor" IS NULL
      OR "primaryColor" ~ '^#[0-9A-Fa-f]{6}$'
      OR "primaryColor" ~ '^#[0-9A-Fa-f]{3}$'
      OR "primaryColor" ~ '^[a-z][a-z0-9-]{1,18}$'
    );

-- ─── users.mfaSecretCiphertext format + mfaEnrolledAt order ──
ALTER TABLE users
  ADD CONSTRAINT users_mfaSecretCiphertext_format
    CHECK ("mfaSecretCiphertext" IS NULL OR "mfaSecretCiphertext" ~ '^[A-Za-z0-9+/]+=*$'),
  ADD CONSTRAINT users_mfaEnrolledAt_after_created
    CHECK ("mfaEnrolledAt" IS NULL OR "mfaEnrolledAt" >= "createdAt");

-- ─── Cross-table: user.tenantId == branch.tenantId ─────────
-- A CHECK constraint can't reference another table, but a trigger
-- can. Fires on INSERT or UPDATE of users; rejects when the user's
-- tenantId doesn't match the branch's. Application code already
-- sets these consistently (lib/tenant.ts → tenantIdForBranch); the
-- trigger is belt-and-suspenders for direct DB writes / migrations.
CREATE OR REPLACE FUNCTION users_enforce_branch_tenant() RETURNS TRIGGER AS $$
DECLARE
  branch_tenant UUID;
BEGIN
  SELECT "tenantId" INTO branch_tenant FROM branches WHERE id = NEW."branchId";
  IF branch_tenant IS NULL THEN
    RAISE EXCEPTION 'users.branchId % refers to a non-existent branch', NEW."branchId";
  END IF;
  IF NEW."tenantId" <> branch_tenant THEN
    RAISE EXCEPTION 'users.tenantId (%) must match the branch''s tenantId (%) for branchId %',
      NEW."tenantId", branch_tenant, NEW."branchId";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_enforce_branch_tenant_trg
  BEFORE INSERT OR UPDATE OF "tenantId", "branchId" ON users
  FOR EACH ROW EXECUTE FUNCTION users_enforce_branch_tenant();
