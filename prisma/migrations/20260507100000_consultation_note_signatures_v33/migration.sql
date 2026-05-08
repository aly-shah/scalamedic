-- v33 — Consultation note e-signatures + immutable revisions
-- ===========================================================
-- Phase 0.1 of the strategic roadmap.
--
-- Two changes:
--   1. Extend `consultation_notes` with signer FK, content-hash,
--      amendment reason, and a revision counter.
--   2. Add `consultation_note_revisions` table to store every prior
--      state of a note as an immutable snapshot.
--
-- Pre-flight on production: 0 rows in consultation_notes, so no
-- backfill is needed and the new NOT-VALID-style constraints can be
-- added immediately as enforced.

-- ─── consultation_notes — new columns ──────────────────────────
ALTER TABLE consultation_notes
  ADD COLUMN "signedById"          UUID,
  ADD COLUMN "signedContentHash"   VARCHAR(64),
  ADD COLUMN "amendmentReason"     TEXT,
  ADD COLUMN "revisionCount"       INTEGER NOT NULL DEFAULT 0;

-- FK to users for the signer. Nullable because pre-signature notes
-- have no signer yet. ON DELETE SET NULL — losing the signer's user
-- record shouldn't cascade to clinical data.
ALTER TABLE consultation_notes
  ADD CONSTRAINT consultation_notes_signedBy_fkey
    FOREIGN KEY ("signedById") REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX consultation_notes_signedById_idx
  ON consultation_notes("signedById");

-- ─── consultation_notes — new CHECKs ──────────────────────────
-- A signed note must capture WHO signed, not just THAT it was signed.
ALTER TABLE consultation_notes
  ADD CONSTRAINT consultation_notes_signedById_when_signed
    CHECK ("isSigned" = false OR "signedById" IS NOT NULL);

-- A signed note must bind the signature to a content hash. Without
-- this, "signed" is just a flag; with it, post-signature edits are
-- detectable by re-hashing.
ALTER TABLE consultation_notes
  ADD CONSTRAINT consultation_notes_signedContentHash_when_signed
    CHECK ("isSigned" = false OR "signedContentHash" IS NOT NULL);

-- SHA-256 hex is exactly 64 lowercase chars 0-9a-f. Reject anything
-- that doesn't match so a tampered hash literal can't sneak through
-- the application layer.
ALTER TABLE consultation_notes
  ADD CONSTRAINT consultation_notes_signedContentHash_format
    CHECK ("signedContentHash" IS NULL OR "signedContentHash" ~ '^[0-9a-f]{64}$');

ALTER TABLE consultation_notes
  ADD CONSTRAINT consultation_notes_amendmentReason_nonempty
    CHECK ("amendmentReason" IS NULL OR length(trim("amendmentReason")) > 0);

ALTER TABLE consultation_notes
  ADD CONSTRAINT consultation_notes_revisionCount_nonneg
    CHECK ("revisionCount" >= 0);

-- ─── consultation_note_revisions — new table ───────────────────
CREATE TABLE consultation_note_revisions (
  id                          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  "consultationNoteId"        UUID         NOT NULL,
  "revisionNumber"            INTEGER      NOT NULL,
  snapshot                    JSONB        NOT NULL,
  "wasSigned"                 BOOLEAN      NOT NULL DEFAULT false,
  "signedAtSnapshot"          TIMESTAMPTZ(6),
  "signedByIdSnapshot"        UUID,
  "signedContentHashSnapshot" VARCHAR(64),
  "amendmentReason"           TEXT,
  "authorId"                  UUID,
  "createdAt"                 TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT consultation_note_revisions_note_fkey
    FOREIGN KEY ("consultationNoteId") REFERENCES consultation_notes(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT consultation_note_revisions_author_fkey
    FOREIGN KEY ("authorId") REFERENCES users(id)
    ON DELETE SET NULL ON UPDATE CASCADE,

  CONSTRAINT consultation_note_revisions_revisionNumber_positive
    CHECK ("revisionNumber" > 0),
  CONSTRAINT consultation_note_revisions_signedContentHashSnapshot_format
    CHECK ("signedContentHashSnapshot" IS NULL OR "signedContentHashSnapshot" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT consultation_note_revisions_amendmentReason_nonempty
    CHECK ("amendmentReason" IS NULL OR length(trim("amendmentReason")) > 0),
  CONSTRAINT consultation_note_revisions_snapshot_is_object
    CHECK (jsonb_typeof(snapshot) = 'object'),
  -- If the snapshot says it was signed, it must carry the signer
  -- timestamp + id + hash. Mirrors the live-row constraints.
  CONSTRAINT consultation_note_revisions_signed_consistency
    CHECK (
      "wasSigned" = false
      OR (
        "signedAtSnapshot" IS NOT NULL
        AND "signedByIdSnapshot" IS NOT NULL
        AND "signedContentHashSnapshot" IS NOT NULL
      )
    )
);

-- Monotonic revision numbers per note — prevents two writers from
-- producing the same revisionNumber in a race.
CREATE UNIQUE INDEX consultation_note_revisions_note_revno_uidx
  ON consultation_note_revisions("consultationNoteId", "revisionNumber");

CREATE INDEX consultation_note_revisions_note_idx
  ON consultation_note_revisions("consultationNoteId");

CREATE INDEX consultation_note_revisions_author_idx
  ON consultation_note_revisions("authorId");
