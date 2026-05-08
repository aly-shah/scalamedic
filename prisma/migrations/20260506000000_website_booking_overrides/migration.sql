-- CRM-side overrides for website booking-form submissions.
--
-- The upstream API (drnakhodas.com/api/appointments) is read-only —
-- it can't store our follow-up state. We keep a local row keyed by
-- the upstream id so admins can mark a booking CONTACTED / SCHEDULED
-- / CLOSED / REJECTED and add a follow-up note. Lives on whichever
-- box the admin uses; the mirror script preserves it across deploys
-- the same way it preserves visit_reviews.

CREATE TYPE "WebsiteBookingStatus" AS ENUM (
  'PENDING', 'CONTACTED', 'SCHEDULED', 'CLOSED', 'REJECTED'
);

CREATE TABLE "website_booking_overrides" (
  "id"          UUID                   PRIMARY KEY DEFAULT gen_random_uuid(),
  "upstreamId"  INTEGER                NOT NULL UNIQUE,
  "status"      "WebsiteBookingStatus" NOT NULL DEFAULT 'PENDING',
  "notes"       TEXT,
  "createdAt"   TIMESTAMPTZ            NOT NULL DEFAULT NOW(),
  "updatedAt"   TIMESTAMPTZ            NOT NULL DEFAULT NOW(),
  "updatedById" UUID                   REFERENCES "users"("id") ON DELETE SET NULL,
  CONSTRAINT "website_booking_overrides_notes_len"
    CHECK ("notes" IS NULL OR length("notes") <= 2000)
);

CREATE INDEX "website_booking_overrides_status_idx"      ON "website_booking_overrides" ("status");
CREATE INDEX "website_booking_overrides_updatedAt_idx"   ON "website_booking_overrides" ("updatedAt" DESC);
CREATE INDEX "website_booking_overrides_updatedById_idx" ON "website_booking_overrides" ("updatedById");
