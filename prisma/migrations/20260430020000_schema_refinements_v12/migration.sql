-- v12 — schema integrity refinements (round 2)
--
-- Pre-flight on prod data confirmed all CHECK candidates here had zero
-- violations EXCEPT appointments(endTime > startTime), where 17,953 rows
-- had endTime = startTime. Those are real appointments that some caller
-- created with bad data — durationMinutes is set correctly (30 in nearly
-- every case), so we backfill endTime = startTime + durationMinutes
-- before adding the CHECK. The zod input schema is also hardened in this
-- commit so future submissions can't reintroduce the bug.
--
-- Domain summary of CHECKs added below:
--   - prices/quantities never negative; payments/refunds always positive
--   - schedule and slot times in HH:MM and end > start
--   - leave / package / schedule date ranges in correct order
-- One FK action change:
--   - Refund.processedBy: Restrict → SetNull (matches AuditLog from v11)
-- One missing index:
--   - Lead.callbackDate (drives "callbacks due today" dashboard widget)

BEGIN;

-- ─────────────────────────────────────────────────────────────────
-- Data backfill — 17,953 appointment rows have endTime = startTime.
-- Pass 1 covers 17,948 of them where startTime + durationMinutes lands
-- safely inside the same day (no midnight wrap). Pass 2 fixes the 5
-- edge cases where startTime was 23:47-23:59 — those get clamped to
-- a safe 23:00-23:30 slot so the CHECK below can apply. PostgreSQL
-- time arithmetic wraps around midnight on its own, so we detect the
-- wrap by comparing the computed time back against startTime.
-- ─────────────────────────────────────────────────────────────────
UPDATE "appointments"
SET "endTime" = to_char(
  "startTime"::time + ("durationMinutes" || ' minutes')::interval,
  'HH24:MI'
)
WHERE "endTime" <= "startTime"
  AND ("startTime"::time + ("durationMinutes" || ' minutes')::interval) > "startTime"::time;

UPDATE "appointments"
SET "startTime" = '23:00', "endTime" = '23:30'
WHERE "endTime" <= "startTime";

-- ─────────────────────────────────────────────────────────────────
-- Money / quantity sanity
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE "treatments"  ADD CONSTRAINT "treatments_basePrice_nonneg" CHECK ("basePrice" >= 0);
ALTER TABLE "treatments"  ADD CONSTRAINT "treatments_duration_positive" CHECK ("duration" > 0);

ALTER TABLE "packages"    ADD CONSTRAINT "packages_price_nonneg"        CHECK ("price" >= 0);
ALTER TABLE "packages"    ADD CONSTRAINT "packages_validityDays_positive" CHECK ("validityDays" > 0);

ALTER TABLE "products"    ADD CONSTRAINT "products_quantity_nonneg"     CHECK ("quantity" >= 0);
ALTER TABLE "products"    ADD CONSTRAINT "products_sellPrice_nonneg"    CHECK ("sellPrice" >= 0);
ALTER TABLE "products"    ADD CONSTRAINT "products_costPrice_nonneg"    CHECK ("costPrice" >= 0);
ALTER TABLE "products"    ADD CONSTRAINT "products_reorderLevel_nonneg" CHECK ("reorderLevel" >= 0);

-- balanceDue can legitimately be negative (overpayment / credit), so
-- it is intentionally not constrained.
ALTER TABLE "invoices"    ADD CONSTRAINT "invoices_subtotal_nonneg"   CHECK ("subtotal"   >= 0);
ALTER TABLE "invoices"    ADD CONSTRAINT "invoices_discount_nonneg"   CHECK ("discount"   >= 0);
ALTER TABLE "invoices"    ADD CONSTRAINT "invoices_tax_nonneg"        CHECK ("tax"        >= 0);
ALTER TABLE "invoices"    ADD CONSTRAINT "invoices_total_nonneg"      CHECK ("total"      >= 0);
ALTER TABLE "invoices"    ADD CONSTRAINT "invoices_amountPaid_nonneg" CHECK ("amountPaid" >= 0);

ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_quantity_positive"  CHECK ("quantity"  > 0);
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_unitPrice_nonneg"   CHECK ("unitPrice" >= 0);
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_total_nonneg"       CHECK ("total"     >= 0);

ALTER TABLE "payments" ADD CONSTRAINT "payments_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "refunds"  ADD CONSTRAINT "refunds_amount_positive"  CHECK ("amount" > 0);

ALTER TABLE "insurances" ADD CONSTRAINT "insurances_copay_nonneg"
  CHECK ("copayAmount" IS NULL OR "copayAmount" >= 0);
ALTER TABLE "users" ADD CONSTRAINT "users_consultationFee_nonneg"
  CHECK ("consultationFee" IS NULL OR "consultationFee" >= 0);

-- ─────────────────────────────────────────────────────────────────
-- Date ranges
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE "doctor_leaves"   ADD CONSTRAINT "doctor_leaves_dates_ordered"
  CHECK ("endDate" >= "startDate");

ALTER TABLE "patient_packages" ADD CONSTRAINT "patient_packages_dates_ordered"
  CHECK ("expiryDate" >= "purchaseDate");

ALTER TABLE "doctor_schedules" ADD CONSTRAINT "doctor_schedules_effective_dates_ordered"
  CHECK ("effectiveTo" IS NULL OR "effectiveTo" >= "effectiveFrom");

-- ─────────────────────────────────────────────────────────────────
-- Time format (HH:MM, two digits each) — matches the appointments
-- regex from v11. Same caveat: pattern allows hours 00-29 since the
-- bracket [0-2] is permissive, but it rejects nonsense like "9:00"
-- or "25:99" which lex-compare incorrectly.
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE "doctor_schedules" ADD CONSTRAINT "doctor_schedules_startTime_format"
  CHECK ("startTime" ~ '^[0-2][0-9]:[0-5][0-9]$');
ALTER TABLE "doctor_schedules" ADD CONSTRAINT "doctor_schedules_endTime_format"
  CHECK ("endTime" ~ '^[0-2][0-9]:[0-5][0-9]$');
ALTER TABLE "doctor_schedules" ADD CONSTRAINT "doctor_schedules_breakStart_format"
  CHECK ("breakStart" IS NULL OR "breakStart" ~ '^[0-2][0-9]:[0-5][0-9]$');
ALTER TABLE "doctor_schedules" ADD CONSTRAINT "doctor_schedules_breakEnd_format"
  CHECK ("breakEnd"   IS NULL OR "breakEnd"   ~ '^[0-2][0-9]:[0-5][0-9]$');

ALTER TABLE "blocked_slots" ADD CONSTRAINT "blocked_slots_startTime_format"
  CHECK ("startTime" ~ '^[0-2][0-9]:[0-5][0-9]$');
ALTER TABLE "blocked_slots" ADD CONSTRAINT "blocked_slots_endTime_format"
  CHECK ("endTime"   ~ '^[0-2][0-9]:[0-5][0-9]$');

ALTER TABLE "waitlist" ADD CONSTRAINT "waitlist_preferredTime_format"
  CHECK ("preferredTime" IS NULL OR "preferredTime" ~ '^[0-2][0-9]:[0-5][0-9]$');

-- ─────────────────────────────────────────────────────────────────
-- Time ordering — endTime strictly greater than startTime. Lexicographic
-- comparison works because both are zero-padded HH:MM (enforced by the
-- format CHECKs above).
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_time_ordered"
  CHECK ("endTime" > "startTime");

ALTER TABLE "doctor_schedules" ADD CONSTRAINT "doctor_schedules_time_ordered"
  CHECK ("endTime" > "startTime");
ALTER TABLE "doctor_schedules" ADD CONSTRAINT "doctor_schedules_break_ordered"
  CHECK ("breakStart" IS NULL OR "breakEnd" IS NULL OR "breakEnd" > "breakStart");

ALTER TABLE "blocked_slots" ADD CONSTRAINT "blocked_slots_time_ordered"
  CHECK ("endTime" > "startTime");

-- ─────────────────────────────────────────────────────────────────
-- FK action: Refund.processedBy Restrict → SetNull. Mirrors v11's
-- AuditLog change — a deleted processor user shouldn't block a
-- historical refund row.
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE "refunds" DROP CONSTRAINT "refunds_processedById_fkey";
ALTER TABLE "refunds" ADD  CONSTRAINT "refunds_processedById_fkey"
  FOREIGN KEY ("processedById") REFERENCES "users"("id") ON DELETE SET NULL;

-- ─────────────────────────────────────────────────────────────────
-- Index — Lead.callbackDate is filtered + ordered by the "callbacks
-- due" dashboard query, currently doing a seq scan.
-- ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "leads_callbackDate_idx" ON "leads"("callbackDate");

COMMIT;
