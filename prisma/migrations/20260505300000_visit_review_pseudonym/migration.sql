-- Optional pseudonym / display name on the review form. The patient
-- can leave this blank (anonymous) or pick any nickname — we never
-- require their real name. Capped to 60 chars; no CHECK on content
-- (allowed Unicode for non-Latin names).

ALTER TABLE "visit_reviews"
  ADD COLUMN "pseudonym" VARCHAR(60);
