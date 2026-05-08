-- Schema v28 — QR + review hardening pass.
--
-- Adds indexes that match the query patterns in lib/qr-tokens.ts and
-- the analytics queries the admin dashboard will run against the
-- audit + review tables. No data migration; pure index additions, all
-- safe to apply concurrently in prod (see note on partial index).

-- 1) "Tokens issued by user X" audit lookups.
CREATE INDEX "qr_tokens_createdById_idx" ON "qr_tokens" ("createdById");

-- 2) getOrCreateToken hot path. Partial index on live tokens scoped
--    by appointment — much smaller than the full appointmentId index
--    since revoked tokens are a tiny minority. Postgres uses this for
--    the `appointmentId = ? AND revokedAt IS NULL` predicate.
CREATE INDEX "qr_tokens_live_by_appointment_idx"
  ON "qr_tokens" ("appointmentId")
  WHERE "revokedAt" IS NULL;

-- 3) Scan-outcome analytics: "all anonymous scans this week",
--    "missing-token attempts in the last 24h", etc.
CREATE INDEX "qr_scan_logs_outcome_scannedAt_idx"
  ON "qr_scan_logs" ("outcome", "scannedAt" DESC);

-- 4) Low-rating triage queries: "all 1–2 star reviews this month so
--    reception can follow up". Composite so we hit the index once.
CREATE INDEX "visit_reviews_rating_submittedAt_idx"
  ON "visit_reviews" ("rating", "submittedAt" DESC);
