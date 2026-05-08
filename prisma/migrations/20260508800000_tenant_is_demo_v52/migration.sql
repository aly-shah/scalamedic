-- v52 — Demo tenant flag
--
-- Adds tenants.isDemo so a workspace can be marked as a disposable
-- sandbox. The reset/regenerate endpoint and the demo banner both
-- pivot on this column. Existing tenants stay isDemo=false (real
-- data must never be considered demo by accident).

ALTER TABLE "tenants"
  ADD COLUMN IF NOT EXISTS "isDemo" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "tenants_isDemo_idx" ON "tenants" ("isDemo")
  WHERE "isDemo" = true;
