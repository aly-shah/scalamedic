-- v47 — Lab structured results
-- =============================
-- Phase 2.2: per-analyte rows on top of the existing free-text
-- results. Each LabTest can have many LabTestResult rows (Hb, WBC,
-- Platelets, etc.). Numeric and categorical results are both
-- supported via parallel `valueNumeric` + `value` (text) fields.
--
-- The legacy `lab_tests.results` JSON + `notes` text fields stay —
-- some labs return narrative reports that don't fit a row-per-
-- analyte shape, and old data is preserved as-is.

CREATE TABLE lab_test_results (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  "labTestId"     UUID         NOT NULL,
  analyte         VARCHAR(120) NOT NULL,
  code            VARCHAR(40),
  value           VARCHAR(60)  NOT NULL,
  "valueNumeric"  DECIMAL(14,4),
  unit            VARCHAR(40),
  "referenceLow"  DECIMAL(14,4),
  "referenceHigh" DECIMAL(14,4),
  "referenceText" VARCHAR(80),
  "isAbnormal"    BOOLEAN      NOT NULL DEFAULT false,
  flag            VARCHAR(4),
  "displayOrder"  INTEGER      NOT NULL DEFAULT 0,
  notes           TEXT,
  "enteredById"   UUID,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL,

  CONSTRAINT lab_test_results_lab_fkey
    FOREIGN KEY ("labTestId") REFERENCES lab_tests(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT lab_test_results_enteredBy_fkey
    FOREIGN KEY ("enteredById") REFERENCES users(id)
    ON DELETE SET NULL ON UPDATE CASCADE,

  CONSTRAINT lab_test_results_analyte_nonempty
    CHECK (length(trim(analyte)) > 0),
  CONSTRAINT lab_test_results_value_nonempty
    CHECK (length(trim(value)) > 0),
  CONSTRAINT lab_test_results_code_nonempty
    CHECK (code IS NULL OR length(trim(code)) > 0),
  CONSTRAINT lab_test_results_unit_nonempty
    CHECK (unit IS NULL OR length(trim(unit)) > 0),
  CONSTRAINT lab_test_results_referenceText_nonempty
    CHECK ("referenceText" IS NULL OR length(trim("referenceText")) > 0),
  CONSTRAINT lab_test_results_notes_nonempty
    CHECK (notes IS NULL OR length(trim(notes)) > 0),

  -- A reference range is "either both or neither" — having only one
  -- side defined is meaningless for the abnormal-flag computation.
  CONSTRAINT lab_test_results_referenceRange_pair
    CHECK (
      ("referenceLow" IS NULL AND "referenceHigh" IS NULL)
      OR
      ("referenceLow" IS NOT NULL AND "referenceHigh" IS NOT NULL AND "referenceHigh" >= "referenceLow")
    ),
  -- Display-only flag: H/L = single side abnormal, HH/LL = critical,
  -- A = abnormal (no high/low semantics, e.g. categorical).
  CONSTRAINT lab_test_results_flag_known
    CHECK (flag IS NULL OR flag IN ('H', 'L', 'HH', 'LL', 'A')),

  CONSTRAINT lab_test_results_displayOrder_nonneg
    CHECK ("displayOrder" >= 0)
);

CREATE INDEX lab_test_results_lab_order_idx
  ON lab_test_results("labTestId", "displayOrder");
CREATE INDEX lab_test_results_lab_abnormal_idx
  ON lab_test_results("labTestId", "isAbnormal");
