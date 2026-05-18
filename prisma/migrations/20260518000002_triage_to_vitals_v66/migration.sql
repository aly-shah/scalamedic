-- v66: Triage → Vitals rename
--
-- The triage_records table actually stores patient vitals (BP,
-- pulse, temp, weight, BMI, SpO₂, etc.). The "triage" name dates
-- from a much earlier prototype that intended a separate triage
-- workflow; that workflow lives on Appointment.workflowStage
-- (WAITING / CONSULT / …) instead, and the table was repurposed
-- without ever being renamed.
--
-- This migration renames:
--   - the table itself                triage_records → vitals
--   - the primary key index           triage_records_pkey
--   - 6 non-PK indexes
--   - 3 foreign-key constraints
--   - 18 CHECK constraints
--
-- No data movement, no semantic change. All call sites + the
-- Prisma model are updated in the same commit.

ALTER TABLE triage_records RENAME TO vitals;

-- Primary key index (Postgres renames the corresponding constraint
-- when the backing index is renamed).
ALTER INDEX triage_records_pkey RENAME TO vitals_pkey;

-- Non-PK indexes
ALTER INDEX "triage_records_appointmentId_idx"          RENAME TO "vitals_appointmentId_idx";
ALTER INDEX "triage_records_patientId_idx"              RENAME TO "vitals_patientId_idx";
ALTER INDEX "triage_records_patientId_createdAt_idx"    RENAME TO "vitals_patientId_createdAt_idx";
ALTER INDEX "triage_records_recordedById_idx"           RENAME TO "vitals_recordedById_idx";
ALTER INDEX "triage_records_recordedById_createdAt_idx" RENAME TO "vitals_recordedById_createdAt_idx";
ALTER INDEX "triage_records_urgencyLevel_idx"           RENAME TO "vitals_urgencyLevel_idx";

-- Foreign keys
ALTER TABLE vitals RENAME CONSTRAINT "triage_records_patientId_fkey"     TO "vitals_patientId_fkey";
ALTER TABLE vitals RENAME CONSTRAINT "triage_records_appointmentId_fkey" TO "vitals_appointmentId_fkey";
ALTER TABLE vitals RENAME CONSTRAINT "triage_records_recordedById_fkey"  TO "vitals_recordedById_fkey";

-- CHECK constraints — the "triage_X" names (not all of them carry
-- "triage_records" as a prefix, blame the older migrations that
-- introduced them piecemeal).
ALTER TABLE vitals RENAME CONSTRAINT "triage_bmi_positive"                TO "vitals_bmi_positive";
ALTER TABLE vitals RENAME CONSTRAINT "triage_bmi_range"                   TO "vitals_bmi_range";
ALTER TABLE vitals RENAME CONSTRAINT "triage_diastolicBP_range"           TO "vitals_diastolicBP_range";
ALTER TABLE vitals RENAME CONSTRAINT "triage_heartRate_range"             TO "vitals_heartRate_range";
ALTER TABLE vitals RENAME CONSTRAINT "triage_height_positive"             TO "vitals_height_positive";
ALTER TABLE vitals RENAME CONSTRAINT "triage_height_range"                TO "vitals_height_range";
ALTER TABLE vitals RENAME CONSTRAINT "triage_moistureLevel_range"         TO "vitals_moistureLevel_range";
ALTER TABLE vitals RENAME CONSTRAINT "triage_oilinessLevel_range"         TO "vitals_oilinessLevel_range";
ALTER TABLE vitals RENAME CONSTRAINT "triage_oxygenSaturation_range"      TO "vitals_oxygenSaturation_range";
ALTER TABLE vitals RENAME CONSTRAINT "triage_painLevel_range"             TO "vitals_painLevel_range";
ALTER TABLE vitals RENAME CONSTRAINT "triage_respiratoryRate_range"       TO "vitals_respiratoryRate_range";
ALTER TABLE vitals RENAME CONSTRAINT "triage_systolicBP_range"            TO "vitals_systolicBP_range";
ALTER TABLE vitals RENAME CONSTRAINT "triage_temperatureUnit_known"       TO "vitals_temperatureUnit_known";
ALTER TABLE vitals RENAME CONSTRAINT "triage_temperature_range"           TO "vitals_temperature_range";
ALTER TABLE vitals RENAME CONSTRAINT "triage_weight_positive"             TO "vitals_weight_positive";
ALTER TABLE vitals RENAME CONSTRAINT "triage_weight_range"                TO "vitals_weight_range";
ALTER TABLE vitals RENAME CONSTRAINT "triage_records_notes_nonempty"      TO "vitals_notes_nonempty";
ALTER TABLE vitals RENAME CONSTRAINT "triage_records_skinObservations_nonempty" TO "vitals_skinObservations_nonempty";
