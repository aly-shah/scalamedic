-- Tax category for treatments. Drives the per-line tax rate at invoice
-- time: MEDICAL=3%, COSMETIC=8%, SLIMMING=8% (Pakistani tax brackets).
-- Consultation lines (no treatmentId) tax at 3% in code.

CREATE TYPE "TaxCategory" AS ENUM ('MEDICAL', 'COSMETIC', 'SLIMMING');

-- Default backfills every existing treatment to MEDICAL (3%). Admin can
-- reclassify any row to COSMETIC / SLIMMING via the catalog form.
ALTER TABLE "treatments"
  ADD COLUMN "taxCategory" "TaxCategory" NOT NULL DEFAULT 'MEDICAL';

CREATE INDEX "treatments_taxCategory_idx" ON "treatments" ("taxCategory");
