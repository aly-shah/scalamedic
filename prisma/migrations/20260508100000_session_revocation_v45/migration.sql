-- v45 — Session revocation
-- =========================
-- Until now a stolen session JWT was valid for its full 7-day TTL
-- with no kill-switch. This adds a `revoked_sessions` table the
-- auth middleware checks on every request: a JWT carrying a
-- revoked `jti` is rejected even if its signature + expiry are
-- valid.
--
-- Records auto-purge at expiry — keeping a row past the JWT's own
-- expiresAt buys nothing (the signature gate already rejects
-- expired tokens). A nightly cron sweeps the table; until that
-- lands, the table stays small because we only insert one row per
-- explicit logout.

CREATE TABLE revoked_sessions (
  -- The JWT's `jti` claim. SHA-256 hex of crypto-random bytes,
  -- minted at login, embedded in the token payload.
  jti         VARCHAR(64)    PRIMARY KEY,
  "userId"    UUID           NOT NULL,
  -- When the underlying token expires. Used by the cron to know
  -- when this row can be deleted.
  "expiresAt" TIMESTAMPTZ(6) NOT NULL,
  reason      VARCHAR(40),
  "revokedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT revoked_sessions_user_fkey
    FOREIGN KEY ("userId") REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT revoked_sessions_jti_format
    CHECK (jti ~ '^[0-9a-f]{64}$'),
  CONSTRAINT revoked_sessions_reason_known
    CHECK (reason IS NULL OR reason IN ('logout', 'admin-revoke', 'password-change', 'mfa-change', 'security'))
);

CREATE INDEX revoked_sessions_user_idx ON revoked_sessions("userId");
CREATE INDEX revoked_sessions_expiresAt_idx ON revoked_sessions("expiresAt");
