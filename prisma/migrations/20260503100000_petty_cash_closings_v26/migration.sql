-- v26: petty cash + daily closings refinements
--
-- Three things:
--   1. Bump money columns from Decimal(10, 2) to Decimal(12, 2) so bulk
--      salary disbursements / busy-clinic till counts don't overflow the
--      99,999 ceiling. Matches the 12,2 used for Payment.amount and the
--      DailyClosing aggregate columns added in v25.
--   2. Add a CHECK ("amount" > 0) to PettyCashExpense — Payment and
--      Refund got the same constraint in v12. Defense in depth: a bad
--      API patch or direct DB edit can't insert zero/negative rows that
--      then get baked into an immutable closing snapshot.
--   3. Index the recordedById / closedById FKs so "petty cash entered
--      by user X" and "closings done by user X" reports don't scan the
--      whole table. Drop the redundant [branchId, date] index on
--      daily_closings — the unique constraint already creates one.

-- ---- precision bump ----
ALTER TABLE "petty_cash_expenses" ALTER COLUMN "amount" TYPE DECIMAL(12, 2);
ALTER TABLE "daily_closings"      ALTER COLUMN "openingTill" TYPE DECIMAL(12, 2);
ALTER TABLE "daily_closings"      ALTER COLUMN "cashCounted" TYPE DECIMAL(12, 2);

-- ---- CHECK constraint ----
ALTER TABLE "petty_cash_expenses"
  ADD CONSTRAINT "petty_cash_expenses_amount_positive"
  CHECK ("amount" > 0);

-- ---- FK indexes ----
CREATE INDEX "petty_cash_expenses_recordedById_idx"
  ON "petty_cash_expenses"("recordedById");
CREATE INDEX "daily_closings_closedById_idx"
  ON "daily_closings"("closedById");

-- ---- redundant index cleanup ----
-- [branchId, date] composite is duplicated by the @@unique constraint
-- (which postgres backs with its own unique index). Same column order,
-- same selectivity — keeping both would just bloat writes.
DROP INDEX IF EXISTS "daily_closings_branchId_date_idx";
