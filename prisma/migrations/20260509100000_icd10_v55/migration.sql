-- v55 — ICD-10 structured diagnosis
--
-- Adds:
--   1. consultation_notes.icd10Codes (text[] default {}) — array of
--      ICD-10 codes per note, primary first.
--   2. icd10_codes — master catalogue keyed by code (e.g. "L70.0"),
--      seeded with ~50 dermatology + common comorbidity entries that
--      the picker autocompletes against.
--
-- The relationship between consultation_notes.icd10Codes and the
-- master table is enforced at the API layer (Postgres array FKs are
-- awkward to model). The seed list can be expanded by inserting new
-- rows into icd10_codes — no migration needed for catalogue growth.

-- ============================================================
-- 1. Per-note structured diagnosis codes
-- ============================================================
ALTER TABLE "consultation_notes"
  ADD COLUMN IF NOT EXISTS "icd10Codes" TEXT[] NOT NULL DEFAULT '{}';

-- GIN index lets reports do "all notes mentioning L70.0" without a
-- full table scan. Bumps insert cost slightly; worth it for the
-- analytics use case.
CREATE INDEX IF NOT EXISTS "consultation_notes_icd10Codes_gin_idx"
  ON "consultation_notes" USING GIN ("icd10Codes");

-- ============================================================
-- 2. Master catalogue
-- ============================================================
CREATE TABLE IF NOT EXISTS "icd10_codes" (
  "code"        VARCHAR(10) PRIMARY KEY,
  "description" VARCHAR(200) NOT NULL,
  "category"    VARCHAR(120),
  "isCommon"    BOOLEAN NOT NULL DEFAULT false,
  "isActive"    BOOLEAN NOT NULL DEFAULT true,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "icd10_codes_code_format"
    CHECK ("code" ~ '^[A-Z][0-9]{2}(\.[0-9A-Z]{1,4})?$'),
  CONSTRAINT "icd10_codes_description_nonempty"
    CHECK (length(trim("description")) > 0)
);

CREATE INDEX IF NOT EXISTS "icd10_codes_category_idx"
  ON "icd10_codes" ("category");
CREATE INDEX IF NOT EXISTS "icd10_codes_isCommon_isActive_idx"
  ON "icd10_codes" ("isCommon", "isActive");

-- ============================================================
-- 3. Seed — dermatology-leaning subset
--
-- Categories follow ICD-10 chapter naming. `isCommon=true` flags
-- the bread-and-butter codes that show up at the top of the picker
-- without a search query.
-- ============================================================
INSERT INTO "icd10_codes" ("code", "description", "category", "isCommon") VALUES
  -- Skin / appendages
  ('L70.0', 'Acne vulgaris', 'Disorders of skin appendages', true),
  ('L70.1', 'Acne conglobata', 'Disorders of skin appendages', false),
  ('L70.5', 'Acne excoriée des jeunes filles', 'Disorders of skin appendages', false),
  ('L70.8', 'Other acne', 'Disorders of skin appendages', false),
  ('L70.9', 'Acne, unspecified', 'Disorders of skin appendages', false),
  ('L71.0', 'Perioral dermatitis', 'Disorders of skin appendages', true),
  ('L71.9', 'Rosacea, unspecified', 'Disorders of skin appendages', true),
  ('L72.0', 'Epidermal cyst', 'Disorders of skin appendages', false),
  ('L73.0', 'Acne keloid', 'Disorders of skin appendages', false),
  ('L73.2', 'Hidradenitis suppurativa', 'Disorders of skin appendages', true),
  ('L65.0', 'Telogen effluvium', 'Disorders of skin appendages', true),
  ('L65.9', 'Nonscarring hair loss, unspecified', 'Disorders of skin appendages', false),
  ('L63.9', 'Alopecia areata, unspecified', 'Disorders of skin appendages', true),
  ('L64.9', 'Androgenic alopecia, unspecified', 'Disorders of skin appendages', true),
  ('L66.9', 'Cicatricial alopecia, unspecified', 'Disorders of skin appendages', false),
  ('L68.0', 'Hirsutism', 'Disorders of skin appendages', true),
  ('L68.9', 'Hypertrichosis, unspecified', 'Disorders of skin appendages', false),
  ('L60.0', 'Ingrowing nail', 'Disorders of skin appendages', false),
  ('L60.1', 'Onycholysis', 'Disorders of skin appendages', false),

  -- Pigmentation / sun damage
  ('L81.0', 'Postinflammatory hyperpigmentation', 'Pigmentation disorders', true),
  ('L81.1', 'Chloasma (melasma)', 'Pigmentation disorders', true),
  ('L81.4', 'Other melanin hyperpigmentation', 'Pigmentation disorders', false),
  ('L81.5', 'Leukoderma, not elsewhere classified', 'Pigmentation disorders', false),
  ('L80',   'Vitiligo', 'Pigmentation disorders', true),
  ('L57.0', 'Actinic keratosis', 'Sun-related skin changes', true),
  ('L57.4', 'Cutis laxa senilis', 'Sun-related skin changes', false),
  ('L57.8', 'Other skin changes due to chronic UV exposure', 'Sun-related skin changes', false),

  -- Eczema / dermatitis
  ('L20.9', 'Atopic dermatitis, unspecified', 'Dermatitis and eczema', true),
  ('L21.0', 'Seborrhoea capitis', 'Dermatitis and eczema', false),
  ('L21.9', 'Seborrhoeic dermatitis, unspecified', 'Dermatitis and eczema', true),
  ('L23.9', 'Allergic contact dermatitis, unspecified cause', 'Dermatitis and eczema', true),
  ('L24.9', 'Irritant contact dermatitis, unspecified cause', 'Dermatitis and eczema', true),
  ('L25.9', 'Unspecified contact dermatitis', 'Dermatitis and eczema', false),
  ('L29.9', 'Pruritus, unspecified', 'Dermatitis and eczema', true),
  ('L30.9', 'Dermatitis, unspecified', 'Dermatitis and eczema', false),

  -- Psoriasis / papulosquamous
  ('L40.0', 'Psoriasis vulgaris', 'Papulosquamous disorders', true),
  ('L40.5', 'Arthropathic psoriasis', 'Papulosquamous disorders', false),
  ('L40.9', 'Psoriasis, unspecified', 'Papulosquamous disorders', false),
  ('L43.9', 'Lichen planus, unspecified', 'Papulosquamous disorders', false),
  ('L42',   'Pityriasis rosea', 'Papulosquamous disorders', true),

  -- Urticaria / autoimmune
  ('L50.0', 'Allergic urticaria', 'Urticaria and erythema', true),
  ('L50.9', 'Urticaria, unspecified', 'Urticaria and erythema', false),
  ('L93.0', 'Discoid lupus erythematosus', 'Connective tissue disorders', false),
  ('L94.0', 'Localized scleroderma (morphea)', 'Connective tissue disorders', false),

  -- Infections (skin)
  ('B00.1', 'Herpes simplex (vesicular dermatitis)', 'Infections of skin', false),
  ('B02.9', 'Herpes zoster, unspecified', 'Infections of skin', false),
  ('B07.9', 'Viral wart, unspecified', 'Infections of skin', true),
  ('B35.0', 'Tinea barbae and tinea capitis', 'Infections of skin', false),
  ('B35.4', 'Tinea corporis', 'Infections of skin', true),
  ('B35.6', 'Tinea cruris', 'Infections of skin', false),
  ('B36.0', 'Pityriasis versicolor', 'Infections of skin', true),
  ('L01.0', 'Impetigo', 'Infections of skin', false),
  ('L02.9', 'Cutaneous abscess, unspecified', 'Infections of skin', false),
  ('L03.9', 'Cellulitis, unspecified', 'Infections of skin', false),

  -- Tumours
  ('D22.9', 'Melanocytic naevus, unspecified', 'Benign neoplasms of skin', true),
  ('D23.9', 'Other benign neoplasm of skin, unspecified', 'Benign neoplasms of skin', false),
  ('L82',   'Seborrhoeic keratosis', 'Benign neoplasms of skin', true),
  ('L91.0', 'Hypertrophic scar / Keloid', 'Hypertrophic conditions', true),
  ('L98.8', 'Other specified disorders of skin', 'Other skin disorders', false),

  -- Cosmetic / wellness presentations (use with caution in claims)
  ('Z41.1', 'Encounter for cosmetic surgery', 'Encounter codes', false),
  ('Z51.89', 'Encounter for other specified aftercare', 'Encounter codes', false)
ON CONFLICT ("code") DO UPDATE SET
  description = EXCLUDED.description,
  category    = EXCLUDED.category,
  "isCommon"  = EXCLUDED."isCommon",
  "updatedAt" = NOW();
