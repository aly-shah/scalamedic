-- Schema v30 — small hardening pass after the WhatsApp inbound
-- + booking-conversion features landed.
--
-- Verified before applying that no current row would violate any of
-- these constraints.

-- 1) Outbound communication_logs rows must carry the sending user.
--    Inbound rows (WhatsApp from a patient) are exempt — no clinic
--    user "sent" them.
ALTER TABLE "communication_logs"
  ADD CONSTRAINT "communication_logs_outbound_has_sender"
  CHECK ("direction" <> 'OUTBOUND' OR "sentById" IS NOT NULL);

-- 2) website_booking_overrides.notes — alongside the existing
--    length-≤2000 CHECK, refuse whitespace-only strings to match
--    the convention every other text column has.
ALTER TABLE "website_booking_overrides"
  ADD CONSTRAINT "website_booking_overrides_notes_nonempty"
  CHECK ("notes" IS NULL OR length(trim("notes")) > 0);

-- 3) Proper FK link from a booking-override to the lead it was
--    converted into. The convert endpoint currently stuffs the
--    lead id as text inside `notes` ("Converted to lead <uuid>"),
--    which is regex-parseable but doesn't survive lead deletion.
--    SET NULL on lead delete keeps the override row but lets the
--    UI gracefully drop the "View lead" link.
ALTER TABLE "website_booking_overrides"
  ADD COLUMN "convertedLeadId" UUID
  REFERENCES "leads"("id") ON DELETE SET NULL;

CREATE INDEX "website_booking_overrides_convertedLeadId_idx"
  ON "website_booking_overrides" ("convertedLeadId")
  WHERE "convertedLeadId" IS NOT NULL;
