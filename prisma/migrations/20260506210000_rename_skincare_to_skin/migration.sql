-- Rename ProductCategory enum value SKINCARE → SKIN.
-- Postgres handles the rename atomically; any existing product
-- rows tagged SKINCARE end up tagged SKIN automatically.

ALTER TYPE "ProductCategory" RENAME VALUE 'SKINCARE' TO 'SKIN';
