-- Add AESTHETICIAN and OPERATOR to the UserRole enum.
--
-- Postgres enum values can be appended with ALTER TYPE; the order
-- relative to existing values doesn't matter for our usage (we never
-- ORDER BY role). Both values default to no users — admins assign
-- them via the staff create form.

ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'AESTHETICIAN';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'OPERATOR';
