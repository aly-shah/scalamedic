-- Add CHEQUE to PaymentMethodType.
-- Postgres ALTER TYPE ... ADD VALUE is the standard way; IF NOT EXISTS
-- guards against re-running the migration in dev.

ALTER TYPE "PaymentMethodType" ADD VALUE IF NOT EXISTS 'CHEQUE';
