-- Patient review form submitted from the public /review/[token] page.
-- One row per QR token (UNIQUE on tokenId) — if a patient scans twice
-- the second visit shows "thanks for your feedback" instead of the
-- form. Linked to qr_tokens (not invoices/appointments directly) so
-- the public page never has to expose patient ids.

CREATE TABLE "visit_reviews" (
  "id"             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  "tokenId"        UUID         NOT NULL REFERENCES "qr_tokens"("id") ON DELETE CASCADE,
  "rating"         INTEGER      NOT NULL,
  "feedback"       TEXT,
  "wouldRecommend" BOOLEAN,
  "submittedAt"    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  "ipAddress"      VARCHAR(45),
  "userAgent"      VARCHAR(300),
  CONSTRAINT "visit_reviews_rating_chk"   CHECK ("rating" BETWEEN 1 AND 5),
  CONSTRAINT "visit_reviews_feedback_len" CHECK ("feedback" IS NULL OR length("feedback") <= 2000)
);

-- One review per token; the unique index doubles as the lookup index.
CREATE UNIQUE INDEX "visit_reviews_tokenId_unique" ON "visit_reviews" ("tokenId");
CREATE INDEX "visit_reviews_submittedAt_idx" ON "visit_reviews" ("submittedAt");
