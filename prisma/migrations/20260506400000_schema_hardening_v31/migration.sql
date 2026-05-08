-- Schema hardening v31
-- =====================
-- Plugs CHECK gaps on tables that were entirely uncovered (rooms,
-- room_allocations, package_treatments, daily_closings) plus a few
-- per-field gaps on tables that had partial coverage (prescription_items
-- extras, consultation_notes text fields, payments processedAt
-- invariant, waitlist notes, appointments code format).
--
-- Pre-flight on production confirmed zero existing rows violate any
-- of these constraints (see commit message). All checks tolerate NULL
-- on optional fields so they only kick in when a non-null bad value
-- is presented.

-- ─── daily_closings ────────────────────────────────────────────
-- Money amounts are always >= 0 (refund/discount columns aren't
-- represented as negative; the close stores them as positive
-- magnitudes). Counts are non-negative ints. Remarks rejects an
-- empty-string-with-whitespace ghost.
ALTER TABLE daily_closings
  ADD CONSTRAINT daily_closings_openingTill_nonneg   CHECK ("openingTill"  >= 0),
  ADD CONSTRAINT daily_closings_cashCounted_nonneg   CHECK ("cashCounted"  >= 0),
  ADD CONSTRAINT daily_closings_grossSale_nonneg     CHECK ("grossSale"    >= 0),
  ADD CONSTRAINT daily_closings_netSale_nonneg       CHECK ("netSale"      >= 0),
  ADD CONSTRAINT daily_closings_totalDiscount_nonneg CHECK ("totalDiscount" >= 0),
  ADD CONSTRAINT daily_closings_totalTax_nonneg      CHECK ("totalTax"     >= 0),
  ADD CONSTRAINT daily_closings_totalPayments_nonneg CHECK ("totalPayments" >= 0),
  ADD CONSTRAINT daily_closings_totalExpenses_nonneg CHECK ("totalExpenses" >= 0),
  ADD CONSTRAINT daily_closings_invoiceCount_nonneg  CHECK ("invoiceCount" >= 0),
  ADD CONSTRAINT daily_closings_paymentCount_nonneg  CHECK ("paymentCount" >= 0),
  ADD CONSTRAINT daily_closings_expenseCount_nonneg  CHECK ("expenseCount" >= 0),
  ADD CONSTRAINT daily_closings_remarks_nonempty
    CHECK (remarks IS NULL OR length(trim(remarks)) > 0);

-- ─── package_treatments ───────────────────────────────────────
ALTER TABLE package_treatments
  ADD CONSTRAINT package_treatments_name_nonempty
    CHECK (length(trim(name)) > 0),
  ADD CONSTRAINT package_treatments_sessions_positive
    CHECK (sessions > 0);

-- ─── rooms ─────────────────────────────────────────────────────
-- floor (Int?) is unconstrained — clinics legitimately label floor 0
-- (ground) and -1 (basement). Capacity must be >= 1; you can't
-- allocate to a 0-capacity room.
ALTER TABLE rooms
  ADD CONSTRAINT rooms_name_nonempty      CHECK (length(trim(name)) > 0),
  ADD CONSTRAINT rooms_capacity_positive  CHECK (capacity > 0),
  ADD CONSTRAINT rooms_number_nonempty
    CHECK (number IS NULL OR length(trim(number)) > 0),
  ADD CONSTRAINT rooms_equipment_nonempty
    CHECK (equipment IS NULL OR length(trim(equipment)) > 0);

-- ─── room_allocations ──────────────────────────────────────────
ALTER TABLE room_allocations
  ADD CONSTRAINT room_allocations_bedNumber_nonempty
    CHECK ("bedNumber" IS NULL OR length(trim("bedNumber")) > 0),
  ADD CONSTRAINT room_allocations_dates_ordered
    CHECK ("dischargeDate" IS NULL OR "dischargeDate" >= "admissionDate"),
  ADD CONSTRAINT room_allocations_notes_nonempty
    CHECK (notes IS NULL OR length(trim(notes)) > 0);

-- ─── prescription_items extras ────────────────────────────────
-- Existing constraint medicineName_nonempty stays as the canonical
-- requirement; these are the optional fields' "no whitespace ghost"
-- guards.
ALTER TABLE prescription_items
  ADD CONSTRAINT prescription_items_dosage_nonempty
    CHECK (dosage IS NULL OR length(trim(dosage)) > 0),
  ADD CONSTRAINT prescription_items_frequency_nonempty
    CHECK (frequency IS NULL OR length(trim(frequency)) > 0),
  ADD CONSTRAINT prescription_items_duration_nonempty
    CHECK (duration IS NULL OR length(trim(duration)) > 0),
  ADD CONSTRAINT prescription_items_route_nonempty
    CHECK (route IS NULL OR length(trim(route)) > 0),
  ADD CONSTRAINT prescription_items_instructions_nonempty
    CHECK (instructions IS NULL OR length(trim(instructions)) > 0);

-- ─── consultation_notes ───────────────────────────────────────
-- All clinical-text fields nullable in the schema; if they're set,
-- they must be a real, non-blank string.
ALTER TABLE consultation_notes
  ADD CONSTRAINT consultation_notes_chiefComplaint_nonempty
    CHECK ("chiefComplaint" IS NULL OR length(trim("chiefComplaint")) > 0),
  ADD CONSTRAINT consultation_notes_symptoms_nonempty
    CHECK (symptoms IS NULL OR length(trim(symptoms)) > 0),
  ADD CONSTRAINT consultation_notes_examination_nonempty
    CHECK (examination IS NULL OR length(trim(examination)) > 0),
  ADD CONSTRAINT consultation_notes_skinAssessment_nonempty
    CHECK ("skinAssessment" IS NULL OR length(trim("skinAssessment")) > 0),
  ADD CONSTRAINT consultation_notes_diagnosis_nonempty
    CHECK (diagnosis IS NULL OR length(trim(diagnosis)) > 0),
  ADD CONSTRAINT consultation_notes_differentialDx_nonempty
    CHECK ("differentialDx" IS NULL OR length(trim("differentialDx")) > 0),
  ADD CONSTRAINT consultation_notes_treatmentPlan_nonempty
    CHECK ("treatmentPlan" IS NULL OR length(trim("treatmentPlan")) > 0),
  ADD CONSTRAINT consultation_notes_advice_nonempty
    CHECK (advice IS NULL OR length(trim(advice)) > 0),
  ADD CONSTRAINT consultation_notes_internalNotes_nonempty
    CHECK ("internalNotes" IS NULL OR length(trim("internalNotes")) > 0),
  ADD CONSTRAINT consultation_notes_followUpNotes_nonempty
    CHECK ("followUpNotes" IS NULL OR length(trim("followUpNotes")) > 0);

-- ─── payments ──────────────────────────────────────────────────
-- A COMPLETED payment must have a processedAt — otherwise the
-- daily-closing math can't anchor the cash to a date.
ALTER TABLE payments
  ADD CONSTRAINT payments_processedAt_when_completed
    CHECK (status <> 'COMPLETED' OR "processedAt" IS NOT NULL);

-- ─── waitlist ──────────────────────────────────────────────────
ALTER TABLE waitlist
  ADD CONSTRAINT waitlist_notes_nonempty
    CHECK (notes IS NULL OR length(trim(notes)) > 0);

-- ─── appointments code format ─────────────────────────────────
-- All existing rows match `^APT-[0-9]+$`. Locks the format so
-- generators can't drift (e.g. accidentally minting `APPT-…`).
ALTER TABLE appointments
  ADD CONSTRAINT appointments_appointmentCode_format
    CHECK ("appointmentCode" ~ '^APT-[0-9]+$');

-- ─── patient code format ──────────────────────────────────────
-- Mirror of invoices_invoiceNumber_format / appointments_appointmentCode_format.
-- Existing rows all `PT-NNNN`; lock it.
ALTER TABLE patients
  ADD CONSTRAINT patients_patientCode_format
    CHECK ("patientCode" ~ '^PT-[0-9]+$');
