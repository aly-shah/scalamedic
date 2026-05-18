-- v63: Appointment.source enum
--
-- The public /book endpoint and the per-tenant marketing site can
-- both create appointments. Until now the only way to tell where a
-- booking came from was a "Reason (public booking):" prefix in
-- Appointment.notes — brittle and unfilterable in reports.
--
-- Introduces an AppointmentSource enum + a non-null column with a
-- default of STAFF (so every existing receptionist-created row is
-- correctly labelled). Then backfills WEBSITE for any row that was
-- created via the public booking flow, identified by the legacy
-- notes prefix.

CREATE TYPE "AppointmentSource" AS ENUM ('STAFF', 'WEBSITE', 'API', 'PATIENT_PORTAL');

ALTER TABLE appointments
  ADD COLUMN source "AppointmentSource" NOT NULL DEFAULT 'STAFF';

-- Backfill: any appointment whose notes start with "Reason (public
-- booking):" was created by the /book wizard before this column
-- existed. Mark those WEBSITE and strip the now-redundant prefix.
UPDATE appointments
  SET
    source = 'WEBSITE',
    notes = NULLIF(TRIM(SUBSTRING(notes FROM '^Reason \(public booking\):\s*(.*)$')), '')
  WHERE notes ~ '^Reason \(public booking\):';

-- Index for source-filtered reports ("how many bookings came via
-- the website this month?").
CREATE INDEX appointments_source_idx ON appointments(source);
