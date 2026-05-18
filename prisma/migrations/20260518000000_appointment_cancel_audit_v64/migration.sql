-- v64: Appointment cancellation audit fields
--
-- Until now, the only way to know who cancelled an appointment and
-- when was to scan audit_logs for the matching CANCEL action — a
-- two-table dance every time, and audit_logs is global (no tenantId)
-- so multi-tenant deployments couldn't even filter cleanly.
--
-- Two new nullable columns + a CHECK that keeps status and
-- cancelledAt consistent (you can't have cancelledAt set on a
-- not-CANCELLED row, but the inverse is fine — historical rows
-- whose CANCELLED status pre-dated this column have cancelledAt
-- IS NULL and that's expected).

ALTER TABLE appointments
  ADD COLUMN "cancelledAt"   TIMESTAMPTZ(6),
  ADD COLUMN "cancelledById" UUID;

ALTER TABLE appointments
  ADD CONSTRAINT "appointments_cancelledById_fkey"
    FOREIGN KEY ("cancelledById") REFERENCES users(id)
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE appointments
  ADD CONSTRAINT "appointments_cancelledAt_only_when_cancelled"
    CHECK (
      "cancelledAt" IS NULL
      OR status = 'CANCELLED'
    );

-- Index for "show me everything cancelled this month" reports.
CREATE INDEX appointments_cancelledAt_idx ON appointments("cancelledAt")
  WHERE "cancelledAt" IS NOT NULL;
