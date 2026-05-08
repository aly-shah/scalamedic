-- v42 — Multi-doctor collaboration
-- =================================
-- Phase 2.4: threaded notes between staff anchored to a Patient
-- (and optionally to a specific Consultation Note or Procedure),
-- with @mentions stored as rows for read/unread tracking.
--
-- Three new tables. Tenant scoping flows through the patient
-- (every thread is anchored to one) — there's no shortcut FK from
-- comment to tenant; access checks query the patient.

CREATE TABLE collaboration_threads (
  id                    UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  "patientId"           UUID         NOT NULL,
  "tenantId"            UUID         NOT NULL,
  "consultationNoteId"  UUID,
  "procedureId"         UUID,
  title                 VARCHAR(160),
  "isResolved"          BOOLEAN      NOT NULL DEFAULT false,
  "createdById"         UUID         NOT NULL,
  "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"           TIMESTAMP(3) NOT NULL,

  CONSTRAINT collaboration_threads_patient_fkey
    FOREIGN KEY ("patientId") REFERENCES patients(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT collaboration_threads_tenant_fkey
    FOREIGN KEY ("tenantId") REFERENCES tenants(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT collaboration_threads_note_fkey
    FOREIGN KEY ("consultationNoteId") REFERENCES consultation_notes(id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT collaboration_threads_procedure_fkey
    FOREIGN KEY ("procedureId") REFERENCES procedures(id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT collaboration_threads_creator_fkey
    FOREIGN KEY ("createdById") REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,

  -- A thread anchors to AT MOST one sub-record (consultation note
  -- OR procedure). Both null = patient-level thread.
  CONSTRAINT collaboration_threads_one_subAnchor
    CHECK ((("consultationNoteId" IS NOT NULL)::int + ("procedureId" IS NOT NULL)::int) <= 1),
  CONSTRAINT collaboration_threads_title_nonempty
    CHECK (title IS NULL OR length(trim(title)) > 0)
);

CREATE INDEX collaboration_threads_patient_idx
  ON collaboration_threads("patientId");
CREATE INDEX collaboration_threads_tenant_idx
  ON collaboration_threads("tenantId");
CREATE INDEX collaboration_threads_consultationNote_idx
  ON collaboration_threads("consultationNoteId");
CREATE INDEX collaboration_threads_procedure_idx
  ON collaboration_threads("procedureId");
CREATE INDEX collaboration_threads_updatedAt_idx
  ON collaboration_threads("updatedAt" DESC);

CREATE TABLE collaboration_comments (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  "threadId"      UUID         NOT NULL,
  "authorId"      UUID         NOT NULL,
  body            TEXT         NOT NULL,
  "parentCommentId" UUID,
  "editedAt"      TIMESTAMPTZ(6),
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL,

  CONSTRAINT collaboration_comments_thread_fkey
    FOREIGN KEY ("threadId") REFERENCES collaboration_threads(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT collaboration_comments_author_fkey
    FOREIGN KEY ("authorId") REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT collaboration_comments_parent_fkey
    FOREIGN KEY ("parentCommentId") REFERENCES collaboration_comments(id) ON DELETE SET NULL ON UPDATE CASCADE,

  CONSTRAINT collaboration_comments_body_nonempty
    CHECK (length(trim(body)) > 0),
  CONSTRAINT collaboration_comments_editedAt_after_created
    CHECK ("editedAt" IS NULL OR "editedAt" >= "createdAt")
);

CREATE INDEX collaboration_comments_thread_created_idx
  ON collaboration_comments("threadId", "createdAt");
CREATE INDEX collaboration_comments_author_idx
  ON collaboration_comments("authorId");
CREATE INDEX collaboration_comments_parent_idx
  ON collaboration_comments("parentCommentId");

CREATE TABLE collaboration_mentions (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  "commentId" UUID         NOT NULL,
  "userId"    UUID         NOT NULL,
  "readAt"    TIMESTAMPTZ(6),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT collaboration_mentions_comment_fkey
    FOREIGN KEY ("commentId") REFERENCES collaboration_comments(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT collaboration_mentions_user_fkey
    FOREIGN KEY ("userId") REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE
);

-- One row per (comment, user) — mentioning the same person twice
-- in one comment dedups via this unique index.
CREATE UNIQUE INDEX collaboration_mentions_comment_user_uidx
  ON collaboration_mentions("commentId", "userId");

-- Unread-mentions queries hit this — partial index on rows where
-- readAt IS NULL keeps the index small.
CREATE INDEX collaboration_mentions_unread_idx
  ON collaboration_mentions("userId") WHERE "readAt" IS NULL;

-- ─── Cross-table tenant guard ──────────────────────────────────
-- thread.tenantId must equal the patient's tenant. Same pattern as
-- v37's users_enforce_branch_tenant; CHECK can't span tables so a
-- BEFORE INSERT/UPDATE trigger handles it.
CREATE OR REPLACE FUNCTION collaboration_threads_enforce_tenant() RETURNS TRIGGER AS $$
DECLARE
  patient_tenant UUID;
BEGIN
  SELECT b."tenantId" INTO patient_tenant
    FROM patients p
    JOIN branches b ON b.id = p."branchId"
   WHERE p.id = NEW."patientId";
  IF patient_tenant IS NULL THEN
    RAISE EXCEPTION 'collaboration_threads.patientId % refers to a non-existent patient', NEW."patientId";
  END IF;
  IF NEW."tenantId" <> patient_tenant THEN
    RAISE EXCEPTION 'collaboration_threads.tenantId (%) must match the patient''s tenant (%) for patient %',
      NEW."tenantId", patient_tenant, NEW."patientId";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER collaboration_threads_enforce_tenant_trg
  BEFORE INSERT OR UPDATE OF "tenantId", "patientId" ON collaboration_threads
  FOR EACH ROW EXECUTE FUNCTION collaboration_threads_enforce_tenant();
