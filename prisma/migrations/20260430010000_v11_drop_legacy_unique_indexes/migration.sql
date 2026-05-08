-- v11.1 — drop legacy unique indexes that the v11 migration tried to remove
-- via DROP CONSTRAINT. Prisma created these as plain unique indexes (not
-- formal CONSTRAINTs), so DROP CONSTRAINT IF EXISTS silently no-op'd and
-- left them in place. Drop them by index name instead.
--
-- Effect:
--   patients_phone_key — replaced by plain index patients_phone_idx (already
--   created in v11) so phone lookups still hit an index.
--   patients_email_key — replaced by partial unique
--   patients_email_active_unique (already created in v11), which excludes
--   soft-deleted rows so a re-registered patient can reuse a freed-up email.

BEGIN;

DROP INDEX IF EXISTS "patients_phone_key";
DROP INDEX IF EXISTS "patients_email_key";

COMMIT;
