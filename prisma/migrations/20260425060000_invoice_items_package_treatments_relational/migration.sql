-- JSON → relational for billing line items and package composition
--
-- Prod probe 2026-04-25: 0 invoices (no data migration for items),
-- 5 packages with 10 treatment JSON entries (shape: {name, sessions}).
--
-- Changes:
--   1. Create invoice_items + package_treatments tables with FKs
--   2. Migrate package.treatments JSON → package_treatments rows
--      (match to treatments.name where possible to populate treatmentId)
--   3. Drop invoices.items and packages.treatments JSON columns

-- =============================================
-- 1. Create tables
-- =============================================
CREATE TABLE IF NOT EXISTS "invoice_items" (
  "id"          UUID NOT NULL DEFAULT gen_random_uuid(),
  "invoiceId"   UUID NOT NULL,
  "treatmentId" UUID,
  "productId"   UUID,
  "packageId"   UUID,
  "description" VARCHAR(300) NOT NULL,
  "quantity"    INTEGER NOT NULL DEFAULT 1,
  "unitPrice"   DECIMAL(10,2) NOT NULL,
  "discount"    DECIMAL(10,2) NOT NULL DEFAULT 0,
  "tax"         DECIMAL(10,2) NOT NULL DEFAULT 0,
  "total"       DECIMAL(10,2) NOT NULL,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "invoice_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "invoice_items_invoiceId_idx"   ON "invoice_items"("invoiceId");
CREATE INDEX IF NOT EXISTS "invoice_items_treatmentId_idx" ON "invoice_items"("treatmentId");
CREATE INDEX IF NOT EXISTS "invoice_items_productId_idx"   ON "invoice_items"("productId");
CREATE INDEX IF NOT EXISTS "invoice_items_packageId_idx"   ON "invoice_items"("packageId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'invoice_items_invoiceId_fkey') THEN
    ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_invoiceId_fkey"
      FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'invoice_items_treatmentId_fkey') THEN
    ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_treatmentId_fkey"
      FOREIGN KEY ("treatmentId") REFERENCES "treatments"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'invoice_items_productId_fkey') THEN
    ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_productId_fkey"
      FOREIGN KEY ("productId") REFERENCES "products"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'invoice_items_packageId_fkey') THEN
    ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_packageId_fkey"
      FOREIGN KEY ("packageId") REFERENCES "packages"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "package_treatments" (
  "id"          UUID NOT NULL DEFAULT gen_random_uuid(),
  "packageId"   UUID NOT NULL,
  "treatmentId" UUID,
  "name"        VARCHAR(120) NOT NULL,
  "sessions"    INTEGER NOT NULL,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "package_treatments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "package_treatments_packageId_idx"   ON "package_treatments"("packageId");
CREATE INDEX IF NOT EXISTS "package_treatments_treatmentId_idx" ON "package_treatments"("treatmentId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'package_treatments_packageId_fkey') THEN
    ALTER TABLE "package_treatments" ADD CONSTRAINT "package_treatments_packageId_fkey"
      FOREIGN KEY ("packageId") REFERENCES "packages"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'package_treatments_treatmentId_fkey') THEN
    ALTER TABLE "package_treatments" ADD CONSTRAINT "package_treatments_treatmentId_fkey"
      FOREIGN KEY ("treatmentId") REFERENCES "treatments"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- =============================================
-- 2. Migrate package.treatments JSON → package_treatments
--    Uses jsonb_array_elements to unnest, matches to treatments.name
--    for the optional FK. Only runs if the JSON column still exists.
-- =============================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'packages' AND column_name = 'treatments'
  ) THEN
    INSERT INTO "package_treatments" ("packageId", "treatmentId", "name", "sessions")
    SELECT
      p."id" AS "packageId",
      t."id" AS "treatmentId",
      COALESCE(elem->>'name', elem->>'treatmentName', 'Unnamed') AS "name",
      COALESCE((elem->>'sessions')::int, 0) AS "sessions"
    FROM "packages" p
    CROSS JOIN LATERAL jsonb_array_elements(p."treatments"::jsonb) AS elem
    LEFT JOIN "treatments" t
      ON t."name" = COALESCE(elem->>'name', elem->>'treatmentName')
    WHERE NOT EXISTS (
      -- Skip if migration was already run and rows exist for this package
      SELECT 1 FROM "package_treatments" pt WHERE pt."packageId" = p."id"
    );
  END IF;
END $$;

-- =============================================
-- 3. Drop JSON columns
-- =============================================
ALTER TABLE "invoices"  DROP COLUMN IF EXISTS "items";
ALTER TABLE "packages"  DROP COLUMN IF EXISTS "treatments";
