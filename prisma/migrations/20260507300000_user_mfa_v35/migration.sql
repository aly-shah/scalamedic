-- v35 — User MFA (TOTP)
-- ======================
-- Phase 0.3 of the strategic roadmap.
--
-- Adds TOTP-based two-factor authentication. The TOTP secret is
-- encrypted-at-rest using AES-256-GCM with a server-side key
-- (MFA_SECRET_KEY env var) so a DB dump alone doesn't yield
-- code-generation capability. Ciphertext + IV + auth tag are all
-- stored as base64 strings; lib/mfa-crypto.ts handles the round-trip.
--
-- Backup codes are deliberately *not* added in this migration —
-- recovery in v1 is admin-reset (admin clears mfaEnabled, user
-- re-enrolls). Backup codes can be a follow-up migration.

ALTER TABLE users
  ADD COLUMN "mfaEnabled"           BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "mfaSecretCiphertext"  TEXT,
  ADD COLUMN "mfaSecretIv"          VARCHAR(32),
  ADD COLUMN "mfaSecretAuthTag"     VARCHAR(32),
  ADD COLUMN "mfaEnrolledAt"        TIMESTAMPTZ(6);

-- If MFA is enabled, all four secret components must be set.
-- If MFA is disabled, none of them should be set (avoids stale
-- ciphertext lingering after a disable).
ALTER TABLE users
  ADD CONSTRAINT users_mfa_consistency
    CHECK (
      ("mfaEnabled" = false
        AND "mfaSecretCiphertext" IS NULL
        AND "mfaSecretIv" IS NULL
        AND "mfaSecretAuthTag" IS NULL
        AND "mfaEnrolledAt" IS NULL)
      OR
      ("mfaEnabled" = true
        AND "mfaSecretCiphertext" IS NOT NULL
        AND "mfaSecretIv" IS NOT NULL
        AND "mfaSecretAuthTag" IS NOT NULL
        AND "mfaEnrolledAt" IS NOT NULL)
    );

-- IV is 12 bytes for GCM → 16 chars base64.
-- Auth tag is 16 bytes → 24 chars base64.
ALTER TABLE users
  ADD CONSTRAINT users_mfaSecretIv_format
    CHECK ("mfaSecretIv" IS NULL OR "mfaSecretIv" ~ '^[A-Za-z0-9+/]+=*$'),
  ADD CONSTRAINT users_mfaSecretAuthTag_format
    CHECK ("mfaSecretAuthTag" IS NULL OR "mfaSecretAuthTag" ~ '^[A-Za-z0-9+/]+=*$');

-- "MFA enrolled this week" + "doctors with MFA" admin queries.
CREATE INDEX users_mfaEnabled_idx ON users("mfaEnabled");
