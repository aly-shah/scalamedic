-- CommunicationLog: support inbound from unknown senders.
--
-- The table was outbound-shaped: every row required a known patient
-- and a sending user. With the WhatsApp sidecar now forwarding
-- inbound messages, we need to log a message even when the sender
-- doesn't match any patient yet (so reception can convert them).
--
-- Changes:
--   - patientId becomes nullable (was NOT NULL)
--   - sentById becomes nullable (was NOT NULL) — irrelevant for inbound
--   - phone column added — captures the raw sender for unmatched rows
--   - leadId column added — links inbound to a Lead when matched
--   - CHECK: at least one of patientId / leadId / phone must be set
--     so we never persist a fully anonymous row

-- 1) Drop the FK NOT NULL on patientId so inbound from unknown saves.
ALTER TABLE "communication_logs" ALTER COLUMN "patientId" DROP NOT NULL;
ALTER TABLE "communication_logs" ALTER COLUMN "sentById"  DROP NOT NULL;

-- 2) Add identity columns for unmatched / lead-matched senders.
ALTER TABLE "communication_logs" ADD COLUMN "phone"  VARCHAR(32);
ALTER TABLE "communication_logs" ADD COLUMN "leadId" UUID REFERENCES "leads"("id") ON DELETE SET NULL;

-- 3) Defense-in-depth: never persist a row with no way to identify
--    where it came from / who it's about. Either it links to a
--    patient, links to a lead, or carries a raw phone number.
ALTER TABLE "communication_logs"
  ADD CONSTRAINT "communication_logs_identity_chk"
  CHECK ("patientId" IS NOT NULL OR "leadId" IS NOT NULL OR "phone" IS NOT NULL);

-- 4) Indexes that match the new query patterns:
--    - "inbound WhatsApp from unknown today" (the recent-activity feed)
--    - "all messages from this lead"
CREATE INDEX "communication_logs_phone_idx"      ON "communication_logs" ("phone")  WHERE "phone"  IS NOT NULL;
CREATE INDEX "communication_logs_leadId_idx"     ON "communication_logs" ("leadId") WHERE "leadId" IS NOT NULL;
CREATE INDEX "communication_logs_inbound_recent" ON "communication_logs" ("type", "direction", "createdAt" DESC);
