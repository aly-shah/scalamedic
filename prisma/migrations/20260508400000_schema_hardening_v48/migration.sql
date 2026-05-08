-- v48 — Schema hardening: lab result flag/abnormal consistency
-- ===============================================================
-- Single CHECK plugging the one inconsistency v47 left open: if a
-- result row carries a clinical flag (H, L, HH, LL, A), then
-- `isAbnormal` MUST be true. Otherwise the row claims "abnormal at
-- a glance" via the flag pill but renders without the abnormal-
-- count contribution to the parent test card — invisible drift.
--
-- The route layer already pairs them; this is belt-and-suspenders
-- for direct DB writes (lab tech using SQL Workbench, future
-- import scripts, etc.).
--
-- The reverse direction is intentionally NOT enforced: a
-- categorical result like HBsAg = "Positive" is correctly
-- isAbnormal=true with flag=null (or flag='A'), and not every
-- abnormal needs a flag literal.
--
-- Pre-flight on production: 0 violators.

ALTER TABLE lab_test_results
  ADD CONSTRAINT lab_test_results_flag_implies_abnormal
    CHECK (flag IS NULL OR "isAbnormal" = true);
