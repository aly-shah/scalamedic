-- v39 — Schema hardening: cross-table invariants from v38
-- =========================================================
-- Plugs the integrity gaps introduced by v38's Patient ↔ User
-- linkage:
--
--   1. `patients.userId` must point to a User with role=PATIENT.
--      Wrong role would mean a doctor or receptionist account is
--      acting AS a patient through Patient.userId — the Phase-3
--      companion app would then display the wrong person's chart.
--
--   2. ACCEPTED invites must agree with the corresponding Patient
--      row: `patient_invites.acceptedUserId` must equal the
--      `patients.userId` for that invite's patient. Drift here
--      means the invite says "user X claimed me" but the patient
--      record is linked to user Y.
--
-- Both are cross-table — CHECK can't reference another table — so
-- they're implemented as BEFORE INSERT/UPDATE triggers. Application
-- code already preserves both invariants (the accept route writes
-- both in a single transaction) so this is belt-and-suspenders for
-- direct DB writes.
--
-- Also tightens `ai_suggestions.acceptedEntityType` to a known set
-- of artifact types. A typo or future drift would otherwise silently
-- break the audit trail's "what artifact was created" link.
--
-- Pre-flight on production: 0 violators across all 3 invariants.

-- ─── patients.userId → role=PATIENT ────────────────────────────
CREATE OR REPLACE FUNCTION patients_enforce_user_role() RETURNS TRIGGER AS $$
DECLARE
  linked_role TEXT;
BEGIN
  IF NEW."userId" IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT role::text INTO linked_role FROM users WHERE id = NEW."userId";
  IF linked_role IS NULL THEN
    RAISE EXCEPTION 'patients.userId % refers to a non-existent user', NEW."userId";
  END IF;
  IF linked_role <> 'PATIENT' THEN
    RAISE EXCEPTION 'patients.userId must point to a PATIENT-role user (got role=%)', linked_role;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER patients_enforce_user_role_trg
  BEFORE INSERT OR UPDATE OF "userId" ON patients
  FOR EACH ROW EXECUTE FUNCTION patients_enforce_user_role();

-- ─── ACCEPTED invites must reflect the patient.userId link ─────
CREATE OR REPLACE FUNCTION patient_invites_enforce_accepted_link() RETURNS TRIGGER AS $$
DECLARE
  patient_user UUID;
BEGIN
  IF NEW.status <> 'ACCEPTED' THEN
    RETURN NEW;
  END IF;
  IF NEW."acceptedUserId" IS NULL THEN
    -- Already enforced by patient_invites_accepted_consistency, but
    -- defensive against a future migration that loosens it.
    RAISE EXCEPTION 'ACCEPTED invite must record acceptedUserId';
  END IF;
  SELECT "userId" INTO patient_user FROM patients WHERE id = NEW."patientId";
  IF patient_user IS NULL OR patient_user <> NEW."acceptedUserId" THEN
    RAISE EXCEPTION 'ACCEPTED invite acceptedUserId (%) does not match patient.userId (%) for patient %',
      NEW."acceptedUserId", COALESCE(patient_user::text, 'NULL'), NEW."patientId";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER patient_invites_enforce_accepted_link_trg
  BEFORE INSERT OR UPDATE OF status, "acceptedUserId" ON patient_invites
  FOR EACH ROW EXECUTE FUNCTION patient_invites_enforce_accepted_link();

-- ─── ai_suggestions.acceptedEntityType bounded ─────────────────
-- The accept route writes one of these literals; anything else is
-- a typo or a future drift we want to catch at write time. Keeping
-- it as a CHECK with an IN-list (rather than a Postgres enum) so
-- adding a new artifact kind is a one-line CHECK change rather
-- than a data-type migration.
ALTER TABLE ai_suggestions
  ADD CONSTRAINT ai_suggestions_acceptedEntityType_known
    CHECK (
      "acceptedEntityType" IS NULL
      OR "acceptedEntityType" IN (
        'PrescriptionItem',
        'LabTest',
        'FollowUp',
        'Procedure',
        'ConsultationNote'
      )
    );
