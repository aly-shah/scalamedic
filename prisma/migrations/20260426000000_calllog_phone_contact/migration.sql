-- Persist raw caller id + device-level contact name on each CallLog row.
--
-- Before: CallLog only held foreign keys to a matched patient/lead. When an
-- unknown number called, the row had no way to show what number it was, and
-- the only record of the raw input lived in ephemeral liveCallStore memory.
--
-- After: the Android companion / dialer always passes `phone` (raw number)
-- and optionally `contactName` (CACHED_NAME from the device's address book).
-- Both are now stored so the dashboard can always render "contactName · phone"
-- for every historical call, and so the server can retro-match if a patient
-- record is added later for that number.

ALTER TABLE "call_logs"
  ADD COLUMN IF NOT EXISTS "phone" VARCHAR(32),
  ADD COLUMN IF NOT EXISTS "contactName" VARCHAR(100);
