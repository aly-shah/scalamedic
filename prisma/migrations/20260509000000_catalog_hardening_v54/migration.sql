-- v54 — Catalog hardening (post-medical-import)
--
-- Convert FULL unique indexes on nullable identifier columns to
-- PARTIAL unique indexes (WHERE col IS NOT NULL). Functionally the
-- same today because Postgres treats NULLs as distinct in either
-- form, but the partial variant matches the convention we already
-- use on patients.email and stops a future code path from sneaking
-- in '' (empty string) and colliding with another '' row.
--
-- Also adds CHECKs that were missing on packages.maxRedemptions
-- and products.expiryDate. None of these changes are observable
-- from the application — Prisma still treats the columns as
-- @unique and queries by them work the same way.
--
-- NOTE: products_sku_key, products_barcode_key, treatments_code_key
-- are constraint-backed unique indexes (Prisma created them via
-- @unique). DROP INDEX won't work — Postgres requires DROP CONSTRAINT
-- for the constraint-backed variant.

-- ============================================================
-- 1. products.sku — partial unique
-- ============================================================
ALTER TABLE "products" DROP CONSTRAINT IF EXISTS "products_sku_key";
DROP INDEX IF EXISTS "products_sku_key";
CREATE UNIQUE INDEX "products_sku_key"
  ON "products" ("sku")
  WHERE "sku" IS NOT NULL;

-- ============================================================
-- 2. products.barcode — partial unique
-- ============================================================
ALTER TABLE "products" DROP CONSTRAINT IF EXISTS "products_barcode_key";
DROP INDEX IF EXISTS "products_barcode_key";
CREATE UNIQUE INDEX "products_barcode_key"
  ON "products" ("barcode")
  WHERE "barcode" IS NOT NULL;

-- ============================================================
-- 3. treatments.code — partial unique
-- ============================================================
ALTER TABLE "treatments" DROP CONSTRAINT IF EXISTS "treatments_code_key";
DROP INDEX IF EXISTS "treatments_code_key";
CREATE UNIQUE INDEX "treatments_code_key"
  ON "treatments" ("code")
  WHERE "code" IS NOT NULL;

-- ============================================================
-- 4. packages.maxRedemptions — positive when not null
-- ============================================================
ALTER TABLE "packages"
  DROP CONSTRAINT IF EXISTS "packages_maxRedemptions_positive";
ALTER TABLE "packages"
  ADD CONSTRAINT "packages_maxRedemptions_positive"
  CHECK ("maxRedemptions" IS NULL OR "maxRedemptions" > 0);

-- ============================================================
-- 5. products.expiryDate — sane floor (no 1900-01-01 fat-fingers)
-- ============================================================
ALTER TABLE "products"
  DROP CONSTRAINT IF EXISTS "products_expiryDate_floor";
ALTER TABLE "products"
  ADD CONSTRAINT "products_expiryDate_floor"
  CHECK ("expiryDate" IS NULL OR "expiryDate" >= DATE '2000-01-01');
