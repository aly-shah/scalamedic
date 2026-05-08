-- Patient uniqueness: email + phone
--
-- Prod data probed on 2026-04-24: 10582 patients, 147 non-null emails
-- (0 duplicates), 10519 non-empty phones (0 duplicates). 63 patients have
-- phone = '' (empty string). Safe to add @unique once empties are nulled.
--
-- Changes:
--   1. phone column: DROP NOT NULL (some patients legitimately have no phone)
--   2. Normalize empty-string → NULL on both email and phone
--   3. Add UNIQUE constraints on both
--      (Postgres UNIQUE on nullable column allows multiple NULLs)

-- =============================================
-- 1. Make phone nullable
-- =============================================
ALTER TABLE "patients" ALTER COLUMN "phone" DROP NOT NULL;

-- =============================================
-- 2. Normalize empties → NULL (prevents UNIQUE collisions on "")
-- =============================================
UPDATE "patients" SET "email" = NULL WHERE "email" IS NOT NULL AND TRIM("email") = '';
UPDATE "patients" SET "phone" = NULL WHERE "phone" IS NOT NULL AND TRIM("phone") = '';

-- =============================================
-- 3. Unique constraints — idempotent
-- =============================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'patients' AND indexname = 'patients_email_key'
  ) THEN
    CREATE UNIQUE INDEX "patients_email_key" ON "patients"("email");
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'patients' AND indexname = 'patients_phone_key'
  ) THEN
    CREATE UNIQUE INDEX "patients_phone_key" ON "patients"("phone");
  END IF;
END $$;
