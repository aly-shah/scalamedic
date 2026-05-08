-- Schema v29 — financial + quantity integrity guards.
--
-- Defense-in-depth CHECKs on columns the application already treats
-- as non-negative. Verified before applying that no current row
-- violates any of these constraints. Catches future raw-SQL inserts
-- and computation bugs that would otherwise corrupt accounting.
--
-- Notes on what's NOT checked:
--   - invoices.balanceDue: can go negative when a patient overpays
--     (the refund is pending). Don't constrain.
--   - daily_closings.difference: signed (counted - expected); over /
--     short balances both possible.
--   - patients.dateOfBirth: judgment call; left alone for now.

-- Line items: at least one of, with non-negative monetary fields.
ALTER TABLE "invoice_items"
  ADD CONSTRAINT "invoice_items_quantity_chk"  CHECK ("quantity"  >= 1),
  ADD CONSTRAINT "invoice_items_unitPrice_chk" CHECK ("unitPrice" >= 0),
  ADD CONSTRAINT "invoice_items_discount_chk"  CHECK ("discount"  >= 0),
  ADD CONSTRAINT "invoice_items_tax_chk"       CHECK ("tax"       >= 0),
  ADD CONSTRAINT "invoice_items_total_chk"     CHECK ("total"     >= 0);

-- Invoice header totals.
ALTER TABLE "invoices"
  ADD CONSTRAINT "invoices_subtotal_chk"   CHECK ("subtotal"   >= 0),
  ADD CONSTRAINT "invoices_discount_chk"   CHECK ("discount"   >= 0),
  ADD CONSTRAINT "invoices_tax_chk"        CHECK ("tax"        >= 0),
  ADD CONSTRAINT "invoices_total_chk"      CHECK ("total"      >= 0),
  ADD CONSTRAINT "invoices_amountPaid_chk" CHECK ("amountPaid" >= 0);

-- Payments are always positive amounts (refunds live in their own table).
ALTER TABLE "payments"
  ADD CONSTRAINT "payments_amount_chk" CHECK ("amount" > 0);

-- Refund magnitude is positive too — sign comes from the row's
-- existence, not the value.
ALTER TABLE "refunds"
  ADD CONSTRAINT "refunds_amount_chk" CHECK ("amount" > 0);

-- Catalog prices.
ALTER TABLE "treatments"
  ADD CONSTRAINT "treatments_basePrice_chk" CHECK ("basePrice" >= 0);

ALTER TABLE "products"
  ADD CONSTRAINT "products_costPrice_chk" CHECK ("costPrice" >= 0),
  ADD CONSTRAINT "products_sellPrice_chk" CHECK ("sellPrice" >= 0);
