-- v27: RolePermissionOverride refinements
--
-- Three things on the table that landed in the previous migration
-- (20260504100000):
--
--   1. CHECK constraint on `action` so a bad direct insert can't
--      poison permission evaluation. The set of valid values mirrors
--      the PermissionAction TS type — add it here so the DB enforces
--      what the API already validates with zod.
--
--   2. createdById audit FK so we can answer "who toggled this
--      override?". Nullable + SetNull on user delete so a deleted
--      user doesn't take their override history with them — the row
--      stays, attribution is lost.
--
--   3. Index on moduleId for "all overrides affecting MOD-X" lookups,
--      and on createdById for "overrides toggled by user X" audits.

ALTER TABLE "role_permission_overrides"
  ADD CONSTRAINT "role_permission_overrides_action_valid"
  CHECK ("action" IN ('VIEW', 'CREATE', 'EDIT', 'DELETE', 'EXPORT'));

ALTER TABLE "role_permission_overrides"
  ADD COLUMN "createdById" UUID NULL
  REFERENCES "users"("id") ON DELETE SET NULL;

CREATE INDEX "role_permission_overrides_moduleId_idx"
  ON "role_permission_overrides"("moduleId");

CREATE INDEX "role_permission_overrides_createdById_idx"
  ON "role_permission_overrides"("createdById");
