-- v24 — Treatment + Package multi-branch availability
--
-- Treatments and Packages are catalog items, but in practice "few are
-- available at every branch — most are branch-specific" (per user
-- request). Adding a many-to-many join so the same Treatment row can
-- be flagged available at branch A only, B only, or both, without
-- needing duplicate catalog entries per branch.
--
-- Backfill strategy: for every existing treatment / package, link it
-- to EVERY branch. This preserves today's "globally available"
-- behaviour exactly — admins can narrow later via the form UI. Tiny
-- volumes on prod (17 treatments × 2 branches + 5 packages × 2 = 44
-- inserts).
--
-- Cascade FKs:
--   - On delete of Treatment / Package — link evaporates (Cascade).
--   - On delete of Branch — link evaporates (Cascade). Branches use
--     Restrict for users / patients / etc., but a join-table link
--     should not block branch deletion.

BEGIN;

CREATE TABLE "treatment_branches" (
  "id"          UUID NOT NULL DEFAULT gen_random_uuid(),
  "treatmentId" UUID NOT NULL,
  "branchId"    UUID NOT NULL,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "treatment_branches_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "treatment_branches_treatmentId_fkey"
    FOREIGN KEY ("treatmentId") REFERENCES "treatments"("id") ON DELETE CASCADE,
  CONSTRAINT "treatment_branches_branchId_fkey"
    FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX "treatment_branches_treatmentId_branchId_key"
  ON "treatment_branches" ("treatmentId", "branchId");

CREATE INDEX "treatment_branches_branchId_idx"
  ON "treatment_branches" ("branchId");

CREATE TABLE "package_branches" (
  "id"        UUID NOT NULL DEFAULT gen_random_uuid(),
  "packageId" UUID NOT NULL,
  "branchId"  UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "package_branches_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "package_branches_packageId_fkey"
    FOREIGN KEY ("packageId") REFERENCES "packages"("id") ON DELETE CASCADE,
  CONSTRAINT "package_branches_branchId_fkey"
    FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX "package_branches_packageId_branchId_key"
  ON "package_branches" ("packageId", "branchId");

CREATE INDEX "package_branches_branchId_idx"
  ON "package_branches" ("branchId");

-- ─────────────────────────────────────────────────────────────────
-- Backfill — every existing treatment / package linked to every branch
-- so today's "globally available" behaviour is preserved. Admin UI
-- can narrow this later.
-- ─────────────────────────────────────────────────────────────────
INSERT INTO "treatment_branches" ("treatmentId", "branchId")
  SELECT t.id, b.id
  FROM "treatments" t CROSS JOIN "branches" b
  ON CONFLICT DO NOTHING;

INSERT INTO "package_branches" ("packageId", "branchId")
  SELECT p.id, b.id
  FROM "packages" p CROSS JOIN "branches" b
  ON CONFLICT DO NOTHING;

COMMIT;
