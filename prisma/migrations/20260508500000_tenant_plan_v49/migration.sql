-- v49 — Tenant plan tier
-- =======================
-- Phase 3.4: per-tier feature gates.
--
-- Adds `TenantPlan` enum + `plan` and `planValidUntil` columns on
-- the existing tenant row. The default is ENTERPRISE so the
-- current single-tenant deployment keeps every feature it has
-- today; new tenants in the future would get FREE.
--
-- Future-tense limits (max branches, max staff, max AI calls per
-- month) live in code (lib/feature-gate.ts → LIMITS_BY_PLAN) so a
-- pricing change is one PR, not a migration.

CREATE TYPE "TenantPlan" AS ENUM ('FREE', 'PRO', 'ENTERPRISE');

ALTER TABLE tenants
  ADD COLUMN plan             "TenantPlan"  NOT NULL DEFAULT 'ENTERPRISE',
  ADD COLUMN "planValidUntil" TIMESTAMPTZ(6);

ALTER TABLE tenants
  ADD CONSTRAINT tenants_planValidUntil_after_created
    CHECK ("planValidUntil" IS NULL OR "planValidUntil" >= "createdAt");

CREATE INDEX tenants_plan_idx ON tenants(plan);
