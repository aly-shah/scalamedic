-- v38 — PATIENT role + invite flow
-- =================================
-- Phase 2.2 of the strategic roadmap.
--
-- Substrate for the Phase-3 patient companion app:
--   1. UserRole enum gains PATIENT (lowest tier).
--   2. PatientInviteStatus enum.
--   3. patients.userId FK (unique, nullable) — links a Patient to
--      their self-service User account.
--   4. patient_invites table with hashed token, expiry, status,
--      and the audit FKs.

-- ─── Enums ────────────────────────────────────────────────
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'PATIENT';

CREATE TYPE "PatientInviteStatus" AS ENUM (
  'PENDING',
  'ACCEPTED',
  'EXPIRED',
  'REVOKED'
);

-- ─── patients.userId ─────────────────────────────────────
ALTER TABLE patients
  ADD COLUMN "userId" UUID;

ALTER TABLE patients
  ADD CONSTRAINT patients_userId_fkey
    FOREIGN KEY ("userId") REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE;

-- Unique partial index — one Patient per User, but multiple
-- patients can have NULL userId (the common case).
CREATE UNIQUE INDEX patients_userId_uidx
  ON patients("userId") WHERE "userId" IS NOT NULL;

-- ─── patient_invites table ──────────────────────────────
CREATE TABLE patient_invites (
  id              UUID                  PRIMARY KEY DEFAULT gen_random_uuid(),
  "patientId"     UUID                  NOT NULL,
  "tokenHash"     VARCHAR(64)           NOT NULL UNIQUE,
  status          "PatientInviteStatus" NOT NULL DEFAULT 'PENDING',
  "expiresAt"     TIMESTAMPTZ(6)        NOT NULL,
  channel         VARCHAR(20),
  "createdById"   UUID                  NOT NULL,
  "acceptedAt"    TIMESTAMPTZ(6),
  "acceptedUserId" UUID,
  "createdAt"     TIMESTAMP(3)          NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3)          NOT NULL,

  CONSTRAINT patient_invites_patient_fkey
    FOREIGN KEY ("patientId") REFERENCES patients(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT patient_invites_creator_fkey
    FOREIGN KEY ("createdById") REFERENCES users(id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT patient_invites_acceptedUser_fkey
    FOREIGN KEY ("acceptedUserId") REFERENCES users(id)
    ON DELETE SET NULL ON UPDATE CASCADE,

  CONSTRAINT patient_invites_tokenHash_format
    CHECK ("tokenHash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT patient_invites_channel_known
    CHECK (channel IS NULL OR channel IN ('sms', 'email', 'whatsapp')),
  CONSTRAINT patient_invites_expiresAt_after_created
    CHECK ("expiresAt" > "createdAt"),
  -- ACCEPTED rows must capture both timestamp and the resulting
  -- user id; non-ACCEPTED rows must NOT have either set.
  CONSTRAINT patient_invites_accepted_consistency
    CHECK (
      (status = 'ACCEPTED' AND "acceptedAt" IS NOT NULL AND "acceptedUserId" IS NOT NULL)
      OR
      (status <> 'ACCEPTED' AND "acceptedAt" IS NULL AND "acceptedUserId" IS NULL)
    )
);

CREATE INDEX patient_invites_patient_idx
  ON patient_invites("patientId");
CREATE INDEX patient_invites_status_idx
  ON patient_invites(status);
CREATE INDEX patient_invites_expiresAt_idx
  ON patient_invites("expiresAt");
