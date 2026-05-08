-- v43 — Schema hardening: collaboration cross-table invariants
-- ===============================================================
-- Plugs three integrity gaps in v42's collaboration tables:
--
--   1. When a thread is sub-anchored to a consultation note OR
--      procedure, that record must belong to the same patient as
--      the thread. Otherwise we'd silently allow a thread "about
--      patient A's note" to display on patient B.
--
--   2. Comment replies (parentCommentId) must point to a comment
--      in the same thread. CHECK can verify the FK exists, but
--      not that it stays within the thread — trigger required.
--
--   3. Mention targets must be active non-PATIENT staff. Without
--      this, a future bug could mention a deactivated user (whose
--      unread badge would be invisible) or a self-service patient
--      (privacy leak — patients can't be mentioned in clinical
--      threads).
--
-- All three are cross-table; CHECK can't span tables. Pre-flight
-- on production: 0 rows in any of the collaboration tables, so
-- no existing data violates either invariant.

-- ─── Thread sub-anchor patient consistency ────────────────────
CREATE OR REPLACE FUNCTION collaboration_threads_enforce_subanchor() RETURNS TRIGGER AS $$
DECLARE
  note_patient UUID;
  proc_patient UUID;
BEGIN
  IF NEW."consultationNoteId" IS NOT NULL THEN
    SELECT "patientId" INTO note_patient FROM consultation_notes WHERE id = NEW."consultationNoteId";
    IF note_patient IS NULL THEN
      RAISE EXCEPTION 'collaboration_threads.consultationNoteId % refers to a non-existent note', NEW."consultationNoteId";
    END IF;
    IF note_patient <> NEW."patientId" THEN
      RAISE EXCEPTION 'collaboration_threads.consultationNoteId belongs to patient % but thread anchors to patient %',
        note_patient, NEW."patientId";
    END IF;
  END IF;
  IF NEW."procedureId" IS NOT NULL THEN
    SELECT "patientId" INTO proc_patient FROM procedures WHERE id = NEW."procedureId";
    IF proc_patient IS NULL THEN
      RAISE EXCEPTION 'collaboration_threads.procedureId % refers to a non-existent procedure', NEW."procedureId";
    END IF;
    IF proc_patient <> NEW."patientId" THEN
      RAISE EXCEPTION 'collaboration_threads.procedureId belongs to patient % but thread anchors to patient %',
        proc_patient, NEW."patientId";
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER collaboration_threads_enforce_subanchor_trg
  BEFORE INSERT OR UPDATE OF "patientId", "consultationNoteId", "procedureId" ON collaboration_threads
  FOR EACH ROW EXECUTE FUNCTION collaboration_threads_enforce_subanchor();

-- ─── Reply must be in the same thread ─────────────────────────
CREATE OR REPLACE FUNCTION collaboration_comments_enforce_reply_thread() RETURNS TRIGGER AS $$
DECLARE
  parent_thread UUID;
BEGIN
  IF NEW."parentCommentId" IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT "threadId" INTO parent_thread FROM collaboration_comments WHERE id = NEW."parentCommentId";
  IF parent_thread IS NULL THEN
    RAISE EXCEPTION 'collaboration_comments.parentCommentId % refers to a non-existent comment', NEW."parentCommentId";
  END IF;
  IF parent_thread <> NEW."threadId" THEN
    RAISE EXCEPTION 'reply parentCommentId belongs to thread % but reply is on thread %',
      parent_thread, NEW."threadId";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER collaboration_comments_enforce_reply_thread_trg
  BEFORE INSERT OR UPDATE OF "parentCommentId", "threadId" ON collaboration_comments
  FOR EACH ROW EXECUTE FUNCTION collaboration_comments_enforce_reply_thread();

-- ─── Mention target: active staff, never PATIENT ──────────────
CREATE OR REPLACE FUNCTION collaboration_mentions_enforce_target() RETURNS TRIGGER AS $$
DECLARE
  target_role TEXT;
  target_active BOOLEAN;
BEGIN
  SELECT role::text, "isActive" INTO target_role, target_active FROM users WHERE id = NEW."userId";
  IF target_role IS NULL THEN
    RAISE EXCEPTION 'collaboration_mentions.userId % refers to a non-existent user', NEW."userId";
  END IF;
  IF target_role = 'PATIENT' THEN
    RAISE EXCEPTION 'collaboration_mentions cannot target PATIENT-role users (privacy leak)';
  END IF;
  IF target_active IS NOT TRUE THEN
    RAISE EXCEPTION 'collaboration_mentions.userId % is not an active user', NEW."userId";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER collaboration_mentions_enforce_target_trg
  BEFORE INSERT OR UPDATE OF "userId" ON collaboration_mentions
  FOR EACH ROW EXECUTE FUNCTION collaboration_mentions_enforce_target();
