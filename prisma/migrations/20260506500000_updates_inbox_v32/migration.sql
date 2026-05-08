-- v32 — Updates inbox enhancements
-- =================================
-- 1. users.lastUpdatesSeenAt — tracks when each admin last opened
--    /admin/updates, drives the unread-count badge on the sidebar
-- 2. website_message_overrides — mirror of website_booking_overrides
--    but for /api/messages submissions; today only stores the
--    converted-to-lead FK so the Messages tab can swap "Convert"
--    for a "View lead" link

-- ─── User.lastUpdatesSeenAt ────────────────────────────────────
ALTER TABLE users
  ADD COLUMN "lastUpdatesSeenAt" TIMESTAMPTZ(6);

-- Sanity guard: mirrors users_lastLoginAt_after_created.
ALTER TABLE users
  ADD CONSTRAINT users_lastUpdatesSeenAt_after_created
    CHECK ("lastUpdatesSeenAt" IS NULL OR "lastUpdatesSeenAt" >= "createdAt");

-- ─── website_message_overrides ─────────────────────────────────
CREATE TABLE website_message_overrides (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  "upstreamId"    INTEGER      NOT NULL UNIQUE,
  notes           TEXT,
  "convertedLeadId" UUID,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL,
  "updatedById"   UUID,

  CONSTRAINT website_message_overrides_lead_fkey
    FOREIGN KEY ("convertedLeadId") REFERENCES leads(id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT website_message_overrides_user_fkey
    FOREIGN KEY ("updatedById") REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT website_message_overrides_notes_nonempty
    CHECK (notes IS NULL OR length(trim(notes)) > 0)
);

-- Indexes — same shape as website_booking_overrides for consistency.
CREATE INDEX website_message_overrides_updatedAt_idx
  ON website_message_overrides("updatedAt" DESC);
CREATE INDEX website_message_overrides_updatedById_idx
  ON website_message_overrides("updatedById");
-- Partial index on the FK (mirrors what v30 added for bookings) so
-- "leads originated from a website message" queries don't seq-scan.
CREATE INDEX website_message_overrides_convertedLeadId_idx
  ON website_message_overrides("convertedLeadId")
  WHERE "convertedLeadId" IS NOT NULL;
