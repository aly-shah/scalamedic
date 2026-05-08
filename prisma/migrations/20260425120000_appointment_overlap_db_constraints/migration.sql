-- v8: DB-level appointment overlap prevention (belt + braces to the app-level
-- findAppointmentConflicts() check).
--
-- Uses a partial EXCLUDE constraint with gist + btree_gist so Postgres blocks
-- any INSERT/UPDATE that would make two active appointments for the same doctor
-- (or room) overlap in time.
--
-- Partial predicate details:
--   status IN (5 "active" statuses)   -- historical COMPLETED/CANCELLED/
--                                        NO_SHOW/RESCHEDULED don't participate
--   startTime < endTime               -- skips 17,953 zero-duration historical
--                                        CSV rows where start == end
--
-- EXCLUDE doesn't support NOT VALID, so any existing overlap in the qualifying
-- set would reject the constraint creation. One active overlap exists on
-- 2026-04-08 (APT-0005, APT-0006, Dr Emily Chen); resolved here by marking
-- both as NO_SHOW (user-chosen option 1).

-- =============================================
-- 0. Resolve the sole pre-existing active overlap
-- =============================================
UPDATE "appointments"
SET status = 'NO_SHOW',
    "cancellationNote" = COALESCE("cancellationNote" || E'\n', '')
      || 'v8 data-quality cleanup 2026-04-25: double-booked with '
      || CASE WHEN "appointmentCode" = 'APT-0005' THEN 'APT-0006' ELSE 'APT-0005' END
      || ' on 2026-04-08 for Dr. Emily Chen; neither was status-updated after the date passed.',
    "updatedAt" = NOW()
WHERE "appointmentCode" IN ('APT-0005', 'APT-0006')
  AND status = 'CONFIRMED';

-- =============================================
-- 1. btree_gist extension (required for UUID equality inside a gist index)
-- =============================================
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- =============================================
-- 2. IMMUTABLE wrapper function for the slot timestamp range
--    Postgres rejects text::time in index expressions because the cast isn't
--    formally IMMUTABLE. Wrapping in a function marked IMMUTABLE is the
--    canonical workaround: the app always writes zero-padded HH:MM, so the
--    conversion IS deterministic in practice.
-- =============================================
CREATE OR REPLACE FUNCTION appt_slot_range(d date, s varchar, e varchar)
RETURNS tsrange
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT tsrange((d + s::time)::timestamp, (d + e::time)::timestamp, '[)');
$$;

-- =============================================
-- 3. Doctor overlap — partial EXCLUDE
-- =============================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'appointments_no_doctor_overlap'
  ) THEN
    ALTER TABLE "appointments" ADD CONSTRAINT "appointments_no_doctor_overlap"
    EXCLUDE USING gist (
      "doctorId" WITH =,
      appt_slot_range("date", "startTime", "endTime") WITH &&
    )
    WHERE (
      status IN ('SCHEDULED', 'CONFIRMED', 'CHECKED_IN', 'WAITING', 'IN_PROGRESS')
      AND "startTime" < "endTime"
    );
  END IF;
END $$;

-- =============================================
-- 4. Room overlap — partial EXCLUDE
-- =============================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'appointments_no_room_overlap'
  ) THEN
    ALTER TABLE "appointments" ADD CONSTRAINT "appointments_no_room_overlap"
    EXCLUDE USING gist (
      "roomId" WITH =,
      appt_slot_range("date", "startTime", "endTime") WITH &&
    )
    WHERE (
      "roomId" IS NOT NULL
      AND status IN ('SCHEDULED', 'CONFIRMED', 'CHECKED_IN', 'WAITING', 'IN_PROGRESS')
      AND "startTime" < "endTime"
    );
  END IF;
END $$;
