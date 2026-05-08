-- Reception payment-gating: foundations for the check-in pay-then-proceed flow.
--
-- 1. users.consultationFee — per-doctor fee charged at check-in for any
--    appointment with this doctor (PKR, 2dp). NULL means "no default fee
--    set yet"; check-in still works, the line item just appears with 0
--    and the receptionist can override before collecting payment.
--
-- 2. appointments.treatmentId — optional FK to the treatment chosen at
--    booking. When set, its basePrice is added as a second line item on
--    the check-in invoice. SetNull on delete so killing a treatment row
--    later doesn't cascade-block past appointments. Indexed because the
--    check-in queue and admin reports filter on it.

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "consultationFee" DECIMAL(10,2);

ALTER TABLE "appointments"
  ADD COLUMN IF NOT EXISTS "treatmentId" UUID;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'appointments_treatmentId_fkey'
  ) THEN
    ALTER TABLE "appointments"
      ADD CONSTRAINT "appointments_treatmentId_fkey"
      FOREIGN KEY ("treatmentId") REFERENCES "treatments"("id") ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "appointments_treatmentId_idx" ON "appointments"("treatmentId");
