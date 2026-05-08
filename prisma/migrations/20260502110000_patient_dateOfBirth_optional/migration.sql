-- v25 — Patient.dateOfBirth becomes optional
--
-- Per-clinic policy: receptionists frequently register a patient
-- without confirmed DOB at first contact (especially walk-ins / urgent
-- bookings) and fill it in later. The hard NOT-NULL was forcing fake
-- placeholder dates.
--
-- The two existing CHECKs from v14 + v19 are NULL-safe by virtue of
-- standard SQL three-valued logic (NULL <= CURRENT_DATE evaluates to
-- UNKNOWN, which a CHECK accepts). No need to rewrite them.

ALTER TABLE "patients" ALTER COLUMN "dateOfBirth" DROP NOT NULL;
