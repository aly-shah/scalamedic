-- v61: Tenant currency / locale / tax scheme
--
-- Adds three nullable-with-default columns to the `tenants` table so a
-- single ScalaMedic deployment can host both PKR/en-PK and USD/en-US
-- tenants concurrently. Existing rows backfill to PKR/en-PK/PK so the
-- behavior pre-migration is preserved exactly.
--
-- - currency  : ISO 4217 alpha-3 code (PKR, USD, ...). Drives the
--               currency symbol + amount formatting in formatCurrency().
-- - locale    : BCP 47 tag (en-PK, en-US). Drives Intl.NumberFormat's
--               grouping/decimal rules. Kept separate from currency
--               because we may want en-US grouping with PKR amounts
--               for an English-Pakistan tenant that pays in dollars.
-- - taxScheme : Two-letter region code that selects which line-item
--               tax rates apply. "PK" = 3% medical / 8% cosmetic / 8%
--               slimming (the existing scheme). "US" = 0% medical /
--               sales-tax-style cosmetic. Future schemes (UAE, etc.)
--               can be added without another migration.
--
-- CHECK constraints rather than ENUMs so adding new currencies / locales
-- doesn't require an ALTER TYPE.

ALTER TABLE tenants
  ADD COLUMN currency  VARCHAR(3)  NOT NULL DEFAULT 'PKR',
  ADD COLUMN locale    VARCHAR(10) NOT NULL DEFAULT 'en-PK',
  ADD COLUMN "taxScheme" VARCHAR(2) NOT NULL DEFAULT 'PK';

ALTER TABLE tenants
  ADD CONSTRAINT tenants_currency_format CHECK (currency ~ '^[A-Z]{3}$'),
  ADD CONSTRAINT tenants_locale_format   CHECK (locale ~ '^[a-z]{2}-[A-Z]{2}$'),
  ADD CONSTRAINT tenants_taxscheme_valid CHECK ("taxScheme" IN ('PK', 'US'));
