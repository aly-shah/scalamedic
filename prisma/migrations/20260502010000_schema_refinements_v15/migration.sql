-- v15 — schema integrity refinements (round 5)
--
-- Pre-flight on prod confirmed every CHECK candidate had zero violations.
-- The vital ranges are deliberately wide enough to admit unusual but
-- plausible patient states (a 25 °C reading on a hypothermic case is
-- still allowed, anything outside that is almost certainly typo'd).
--
-- The intent is to catch obvious data-entry mistakes — a heart rate of
-- "1500" instead of "150", an oxygen reading entered as percentage *
-- 10, a colour value pasted without the leading #. Tighter ranges
-- belong in domain-specific UI validation, not at the schema layer.
--
-- Summary:
--   Vitals (all NULL-safe):
--     temperature in [25, 45] °C
--     heartRate in [20, 250] bpm
--     systolicBP in [50, 300] mmHg, diastolicBP in [30, 200] mmHg
--     respiratoryRate in [5, 80] breaths/min
--     oxygenSaturation in [0, 100] %
--     painLevel in [0, 10] (numeric pain scale)
--     moistureLevel and oilinessLevel in [1, 5] (skin assessment)
--     weight, height, bmi: positive when set
--   Other CHECKs:
--     doctor_schedules.slotMinutes > 0
--     ai_transcriptions.duration > 0 when set
--     patient_tags.color must match #RRGGBB when set
--   Indexes:
--     patients(createdAt) — "new patients this week" reports
--     communication_logs(type, createdAt) — channel-specific recent
--       activity feed (e.g. "WhatsApp messages today")

BEGIN;

-- ─────────────────────────────────────────────────────────────────
-- Triage vital ranges
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE "triage_records" ADD CONSTRAINT "triage_temperature_range"
  CHECK (temperature IS NULL OR (temperature >= 25 AND temperature <= 45));
ALTER TABLE "triage_records" ADD CONSTRAINT "triage_heartRate_range"
  CHECK ("heartRate" IS NULL OR ("heartRate" >= 20 AND "heartRate" <= 250));
ALTER TABLE "triage_records" ADD CONSTRAINT "triage_systolicBP_range"
  CHECK ("systolicBP" IS NULL OR ("systolicBP" >= 50 AND "systolicBP" <= 300));
ALTER TABLE "triage_records" ADD CONSTRAINT "triage_diastolicBP_range"
  CHECK ("diastolicBP" IS NULL OR ("diastolicBP" >= 30 AND "diastolicBP" <= 200));
ALTER TABLE "triage_records" ADD CONSTRAINT "triage_respiratoryRate_range"
  CHECK ("respiratoryRate" IS NULL OR ("respiratoryRate" >= 5 AND "respiratoryRate" <= 80));
ALTER TABLE "triage_records" ADD CONSTRAINT "triage_oxygenSaturation_range"
  CHECK ("oxygenSaturation" IS NULL OR ("oxygenSaturation" >= 0 AND "oxygenSaturation" <= 100));
ALTER TABLE "triage_records" ADD CONSTRAINT "triage_painLevel_range"
  CHECK ("painLevel" IS NULL OR ("painLevel" >= 0 AND "painLevel" <= 10));
ALTER TABLE "triage_records" ADD CONSTRAINT "triage_moistureLevel_range"
  CHECK ("moistureLevel" IS NULL OR ("moistureLevel" >= 1 AND "moistureLevel" <= 5));
ALTER TABLE "triage_records" ADD CONSTRAINT "triage_oilinessLevel_range"
  CHECK ("oilinessLevel" IS NULL OR ("oilinessLevel" >= 1 AND "oilinessLevel" <= 5));

ALTER TABLE "triage_records" ADD CONSTRAINT "triage_weight_positive"
  CHECK (weight IS NULL OR weight > 0);
ALTER TABLE "triage_records" ADD CONSTRAINT "triage_height_positive"
  CHECK (height IS NULL OR height > 0);
ALTER TABLE "triage_records" ADD CONSTRAINT "triage_bmi_positive"
  CHECK (bmi IS NULL OR bmi > 0);

-- ─────────────────────────────────────────────────────────────────
-- Other sanity CHECKs
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE "doctor_schedules" ADD CONSTRAINT "doctor_schedules_slotMinutes_positive"
  CHECK ("slotMinutes" > 0);

ALTER TABLE "ai_transcriptions" ADD CONSTRAINT "ai_transcriptions_duration_positive"
  CHECK (duration IS NULL OR duration > 0);

-- Hex colour format on patient_tags — catches values without the
-- leading # or with the wrong number of hex digits.
ALTER TABLE "patient_tags" ADD CONSTRAINT "patient_tags_color_format"
  CHECK (color IS NULL OR color ~ '^#[0-9A-Fa-f]{6}$');

-- ─────────────────────────────────────────────────────────────────
-- Indexes — drive specific reporting queries.
-- ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "patients_createdAt_idx"
  ON "patients" ("createdAt");

CREATE INDEX IF NOT EXISTS "communication_logs_type_createdAt_idx"
  ON "communication_logs" ("type", "createdAt");

COMMIT;
