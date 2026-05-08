-- Two new ProductCategory values: HAIR and SKINCARE. Pure additions
-- to the existing enum — no existing rows change. Postgres requires
-- ALTER TYPE ADD VALUE to run outside a transaction so each
-- statement stands alone; the migration runner handles that.

ALTER TYPE "ProductCategory" ADD VALUE IF NOT EXISTS 'HAIR';
ALTER TYPE "ProductCategory" ADD VALUE IF NOT EXISTS 'SKINCARE';
