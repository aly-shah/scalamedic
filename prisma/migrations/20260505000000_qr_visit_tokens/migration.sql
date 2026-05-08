-- QR visit tokens — opaque random tokens printed on the thermal
-- receipt. Server resolves the token at /qr/[token]: logged-in staff
-- get redirected to the visit workflow page, anonymous scanners get
-- the public thank-you page. No patient data ever in the URL.

CREATE TABLE "qr_tokens" (
  "id"            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  -- base64url, 22 chars (16 random bytes). Unique → fast O(1) lookup
  -- at scan time. Allowed slightly larger to leave headroom for
  -- alternate encodings.
  "token"         VARCHAR(32)  NOT NULL UNIQUE,
  -- Either appointmentId or invoiceId must be set; appointment is the
  -- preferred target (drives the staff workflow). Invoice fallback for
  -- standalone (non-appointment) bills.
  "appointmentId" UUID         REFERENCES "appointments"("id") ON DELETE CASCADE,
  "invoiceId"     UUID         REFERENCES "invoices"("id")     ON DELETE CASCADE,
  -- Revocation + optional expiry. Both nullable; the staff workflow
  -- refuses revoked/expired tokens but the public thank-you page still
  -- renders so old printed receipts don't break.
  "revokedAt"     TIMESTAMPTZ,
  "expiresAt"     TIMESTAMPTZ,
  "createdAt"     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  "createdById"   UUID         REFERENCES "users"("id") ON DELETE SET NULL,
  CONSTRAINT "qr_tokens_target_chk" CHECK ("appointmentId" IS NOT NULL OR "invoiceId" IS NOT NULL)
);

CREATE INDEX "qr_tokens_appointmentId_idx" ON "qr_tokens" ("appointmentId");
CREATE INDEX "qr_tokens_invoiceId_idx"     ON "qr_tokens" ("invoiceId");

-- Audit trail — one row per scan. Captures who (or null for public),
-- when, where (IP/UA), and what outcome the resolver returned.
CREATE TABLE "qr_scan_logs" (
  "id"         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  "tokenId"    UUID         NOT NULL REFERENCES "qr_tokens"("id") ON DELETE CASCADE,
  -- null = unauthenticated public scan (sent to /thank-you).
  "userId"     UUID         REFERENCES "users"("id") ON DELETE SET NULL,
  "scannedAt"  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  "ipAddress"  VARCHAR(45),
  "userAgent"  VARCHAR(300),
  -- STAFF_VISIT, PUBLIC_THANKYOU, REVOKED, EXPIRED, NOT_FOUND
  "outcome"    VARCHAR(20)  NOT NULL,
  CONSTRAINT "qr_scan_logs_outcome_chk" CHECK ("outcome" IN ('STAFF_VISIT','PUBLIC_THANKYOU','REVOKED','EXPIRED','NOT_FOUND'))
);

CREATE INDEX "qr_scan_logs_tokenId_idx"   ON "qr_scan_logs" ("tokenId");
CREATE INDEX "qr_scan_logs_userId_idx"    ON "qr_scan_logs" ("userId");
CREATE INDEX "qr_scan_logs_scannedAt_idx" ON "qr_scan_logs" ("scannedAt");
