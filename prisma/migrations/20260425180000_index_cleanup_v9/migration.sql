-- Index cleanup v9: add 4 missing indexes on actively-queried filter
-- columns, remove 3 redundant standalone indexes that are already covered
-- by the leading columns of compound indexes.
--
-- Adds:
--   branches(isActive)                          — "active branches" filter
--   packages(isActive)                          — "active packages" list
--   packages(createdAt)                         — "recent packages" dashboards
--   communication_logs(createdAt)               — recent-activity dashboards
--   communication_logs(patientId, createdAt)    — per-patient timeline
--
-- Drops (superseded by compound indexes' leading-column prefixes):
--   follow_ups(doctorId)                        — covered by (doctorId, dueDate, status)
--   follow_ups(dueDate)                         — covered by (dueDate, status)
--   communication_logs(patientId)               — covered by (patientId, type) and the new (patientId, createdAt)

-- =============================================
-- Adds
-- =============================================
CREATE INDEX IF NOT EXISTS "branches_isActive_idx" ON "branches"("isActive");
CREATE INDEX IF NOT EXISTS "packages_isActive_idx" ON "packages"("isActive");
CREATE INDEX IF NOT EXISTS "packages_createdAt_idx" ON "packages"("createdAt");
CREATE INDEX IF NOT EXISTS "communication_logs_createdAt_idx" ON "communication_logs"("createdAt");
CREATE INDEX IF NOT EXISTS "communication_logs_patientId_createdAt_idx" ON "communication_logs"("patientId", "createdAt");

-- =============================================
-- Drops (redundant)
-- =============================================
DROP INDEX IF EXISTS "follow_ups_doctorId_idx";
DROP INDEX IF EXISTS "follow_ups_dueDate_idx";
DROP INDEX IF EXISTS "communication_logs_patientId_idx";
