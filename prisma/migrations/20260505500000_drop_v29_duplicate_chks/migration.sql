-- Schema v29 cleanup: drop the 13 CHECK constraints v29 added that
-- duplicated pre-existing ones (named _nonneg / _positive in older
-- migrations I didn't audit thoroughly). Keep the 2 genuinely net-new
-- ones and rename them to match the existing convention.
--
-- These CHECKs all evaluate the same predicate as their counterparts;
-- duplicates make every insert evaluate the same condition twice.
-- Dropping them is purely a cleanup, not a behavior change.

-- Drop duplicates.
ALTER TABLE "invoice_items"
  DROP CONSTRAINT IF EXISTS "invoice_items_quantity_chk",
  DROP CONSTRAINT IF EXISTS "invoice_items_unitPrice_chk",
  DROP CONSTRAINT IF EXISTS "invoice_items_total_chk";

ALTER TABLE "invoices"
  DROP CONSTRAINT IF EXISTS "invoices_subtotal_chk",
  DROP CONSTRAINT IF EXISTS "invoices_discount_chk",
  DROP CONSTRAINT IF EXISTS "invoices_tax_chk",
  DROP CONSTRAINT IF EXISTS "invoices_total_chk",
  DROP CONSTRAINT IF EXISTS "invoices_amountPaid_chk";

ALTER TABLE "payments"
  DROP CONSTRAINT IF EXISTS "payments_amount_chk";

ALTER TABLE "refunds"
  DROP CONSTRAINT IF EXISTS "refunds_amount_chk";

ALTER TABLE "treatments"
  DROP CONSTRAINT IF EXISTS "treatments_basePrice_chk";

ALTER TABLE "products"
  DROP CONSTRAINT IF EXISTS "products_costPrice_chk",
  DROP CONSTRAINT IF EXISTS "products_sellPrice_chk";

-- Rename the two genuinely net-new constraints to match the existing
-- _nonneg suffix style. Net-new because no _nonneg version of these
-- two columns existed in the original schema.
ALTER TABLE "invoice_items"
  RENAME CONSTRAINT "invoice_items_discount_chk" TO "invoice_items_discount_nonneg";
ALTER TABLE "invoice_items"
  RENAME CONSTRAINT "invoice_items_tax_chk" TO "invoice_items_tax_nonneg";
