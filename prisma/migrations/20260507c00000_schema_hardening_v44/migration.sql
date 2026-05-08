-- v44 — Schema hardening: timestamp ordering on the gap tables
-- ===============================================================
-- Found via the "tables with fewest CHECK constraints" audit:
--
--   1. collaboration_mentions had ZERO CHECKs. The v43 trigger
--      enforced the target user's role/activeness; this adds the
--      basic temporal invariant: a mention can't be read before it
--      was created. Mirrors the pattern used everywhere else
--      (users_lastLoginAt_after_created, etc.)
--
--   2. qr_tokens had only the target-chk (one of appointmentId or
--      invoiceId set). Adds expiresAt > createdAt — a token issued
--      "expired" makes no sense and silently confuses the QR
--      review flow.
--
-- Pre-flight on production: 0 violators on both.

ALTER TABLE collaboration_mentions
  ADD CONSTRAINT collaboration_mentions_readAt_after_created
    CHECK ("readAt" IS NULL OR "readAt" >= "createdAt");

ALTER TABLE qr_tokens
  ADD CONSTRAINT qr_tokens_expiresAt_after_created
    CHECK ("expiresAt" > "createdAt");
