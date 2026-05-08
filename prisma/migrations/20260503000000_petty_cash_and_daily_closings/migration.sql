-- Petty cash + daily closings — billing/accounts daily report.
-- Adds two tables and one enum so the daily report can be saved as a
-- frozen snapshot (so re-pulling Apr-6's report next month doesn't
-- pick up edits made to those invoices in the meantime).

CREATE TYPE "PettyCashCategory" AS ENUM (
  'SALARY',
  'SALARY_ADVANCE',
  'OFFICE_EXPENSE',
  'CONSUMABLES',
  'MAINTENANCE',
  'UTILITIES',
  'REFUND_OUT',
  'OTHER'
);

CREATE TABLE "petty_cash_expenses" (
  "id"           UUID PRIMARY KEY,
  "branchId"     UUID NOT NULL REFERENCES "branches"("id") ON DELETE RESTRICT,
  "date"         DATE NOT NULL,
  "category"     "PettyCashCategory" NOT NULL,
  "description"  VARCHAR(200) NOT NULL,
  "paidTo"       VARCHAR(120),
  "amount"       DECIMAL(10, 2) NOT NULL,
  "notes"        TEXT,
  "recordedById" UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL
);
CREATE INDEX "petty_cash_expenses_branchId_date_idx" ON "petty_cash_expenses"("branchId", "date");
CREATE INDEX "petty_cash_expenses_date_idx"          ON "petty_cash_expenses"("date");
CREATE INDEX "petty_cash_expenses_category_idx"      ON "petty_cash_expenses"("category");

CREATE TABLE "daily_closings" (
  "id"                  UUID PRIMARY KEY,
  "branchId"            UUID NOT NULL REFERENCES "branches"("id") ON DELETE RESTRICT,
  "date"                DATE NOT NULL,
  "openingTill"         DECIMAL(10, 2) NOT NULL DEFAULT 0,
  "denominations"       JSONB,
  "cashCounted"         DECIMAL(10, 2) NOT NULL DEFAULT 0,
  "salesByCategory"     JSONB NOT NULL,
  "paymentsByMethod"    JSONB NOT NULL,
  "expensesByCategory"  JSONB NOT NULL,
  "invoiceCount"        INTEGER NOT NULL DEFAULT 0,
  "paymentCount"        INTEGER NOT NULL DEFAULT 0,
  "expenseCount"        INTEGER NOT NULL DEFAULT 0,
  "grossSale"           DECIMAL(12, 2) NOT NULL DEFAULT 0,
  "netSale"             DECIMAL(12, 2) NOT NULL DEFAULT 0,
  "totalDiscount"       DECIMAL(12, 2) NOT NULL DEFAULT 0,
  "totalTax"            DECIMAL(12, 2) NOT NULL DEFAULT 0,
  "totalPayments"       DECIMAL(12, 2) NOT NULL DEFAULT 0,
  "totalExpenses"       DECIMAL(12, 2) NOT NULL DEFAULT 0,
  "expectedCash"        DECIMAL(12, 2) NOT NULL DEFAULT 0,
  "difference"          DECIMAL(12, 2) NOT NULL DEFAULT 0,
  "remarks"             TEXT,
  "closedById"          UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "closedAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"           TIMESTAMP(3) NOT NULL,
  CONSTRAINT "daily_closings_branchId_date_key" UNIQUE ("branchId", "date")
);
CREATE INDEX "daily_closings_date_idx"          ON "daily_closings"("date");
CREATE INDEX "daily_closings_branchId_date_idx" ON "daily_closings"("branchId", "date");
