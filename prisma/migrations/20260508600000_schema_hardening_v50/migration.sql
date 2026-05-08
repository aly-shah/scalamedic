-- v50 — Schema hardening: cross-tenant invariants on patient_invites + collaboration
-- ====================================================================================
-- Two cross-table invariants that the route layer enforces today
-- but can drift in future endpoints / direct DB writes:
--
--   1. patient_invites.createdBy must be a staff member of the
--      same tenant as the patient. Otherwise an admin from
--      tenant A could (via a misconfigured route) issue an invite
--      to a tenant B patient — the patient would log in linked to
--      a foreign clinic's data.
--
--   2. collaboration_comments.author must be in the thread's
--      tenant. Threads are tenant-scoped (v42 trigger); without
--      this guard a leaky API could let staff from tenant A post
--      messages on tenant B's clinical threads.
--
-- Both are belt-and-suspenders defense — application code routes
-- already filter by tenant. Triggers catch the case where a future
-- developer forgets the filter.
--
-- Pre-flight on production: 0 violators (single tenant deployment
-- so cross-tenant drift can't physically happen yet).

-- ─── patient_invites.createdBy tenant must match patient ──────
CREATE OR REPLACE FUNCTION patient_invites_enforce_creator_tenant() RETURNS TRIGGER AS $$
DECLARE
  patient_tenant UUID;
  creator_tenant UUID;
BEGIN
  SELECT b."tenantId" INTO patient_tenant
    FROM patients p
    JOIN branches b ON b.id = p."branchId"
   WHERE p.id = NEW."patientId";
  IF patient_tenant IS NULL THEN
    RAISE EXCEPTION 'patient_invites.patientId % refers to a non-existent patient', NEW."patientId";
  END IF;
  SELECT "tenantId" INTO creator_tenant FROM users WHERE id = NEW."createdById";
  IF creator_tenant IS NULL THEN
    RAISE EXCEPTION 'patient_invites.createdById % refers to a non-existent user', NEW."createdById";
  END IF;
  IF creator_tenant <> patient_tenant THEN
    RAISE EXCEPTION 'patient_invites.createdBy (tenant %) does not match patient''s tenant (%)',
      creator_tenant, patient_tenant;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER patient_invites_enforce_creator_tenant_trg
  BEFORE INSERT OR UPDATE OF "patientId", "createdById" ON patient_invites
  FOR EACH ROW EXECUTE FUNCTION patient_invites_enforce_creator_tenant();

-- ─── collaboration_comments.author tenant must match thread ───
CREATE OR REPLACE FUNCTION collaboration_comments_enforce_author_tenant() RETURNS TRIGGER AS $$
DECLARE
  thread_tenant UUID;
  author_tenant UUID;
BEGIN
  SELECT "tenantId" INTO thread_tenant FROM collaboration_threads WHERE id = NEW."threadId";
  IF thread_tenant IS NULL THEN
    RAISE EXCEPTION 'collaboration_comments.threadId % refers to a non-existent thread', NEW."threadId";
  END IF;
  SELECT "tenantId" INTO author_tenant FROM users WHERE id = NEW."authorId";
  IF author_tenant IS NULL THEN
    RAISE EXCEPTION 'collaboration_comments.authorId % refers to a non-existent user', NEW."authorId";
  END IF;
  IF author_tenant <> thread_tenant THEN
    RAISE EXCEPTION 'collaboration_comments.author (tenant %) does not match thread tenant (%)',
      author_tenant, thread_tenant;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER collaboration_comments_enforce_author_tenant_trg
  BEFORE INSERT OR UPDATE OF "threadId", "authorId" ON collaboration_comments
  FOR EACH ROW EXECUTE FUNCTION collaboration_comments_enforce_author_tenant();
