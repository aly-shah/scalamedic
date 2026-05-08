-- Schema Refinements: Add updatedAt, missing indexes, FK relations
-- All updatedAt columns default to NOW() for existing rows

-- =============================================
-- ADD updatedAt TO ALL TABLES MISSING IT
-- =============================================

ALTER TABLE "ai_transcriptions" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "audit_logs" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "call_logs" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "communication_logs" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "consent_forms" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "follow_ups" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "insurances" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "lab_tests" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "medical_histories" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "notifications" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "patient_allergies" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "patient_documents" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "patient_medications" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "patient_packages" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "patient_tags" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "payments" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "permissions" ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "permissions" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "prescriptions" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "procedures" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "room_allocations" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "skin_histories" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "triage_records" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "waitlist" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- =============================================
-- FIX FK RELATIONS (RoomAllocation, Waitlist, PatientPackage, Refund)
-- =============================================

-- RoomAllocation: patientId FK
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'room_allocations_patientId_fkey') THEN
    ALTER TABLE "room_allocations" ADD CONSTRAINT "room_allocations_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- RoomAllocation: doctorId FK
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'room_allocations_doctorId_fkey') THEN
    ALTER TABLE "room_allocations" ADD CONSTRAINT "room_allocations_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- Waitlist: patientId FK
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'waitlist_patientId_fkey') THEN
    ALTER TABLE "waitlist" ADD CONSTRAINT "waitlist_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- Waitlist: doctorId FK
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'waitlist_doctorId_fkey') THEN
    ALTER TABLE "waitlist" ADD CONSTRAINT "waitlist_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Waitlist: bookedAppointmentId - change type to UUID if needed, add FK
ALTER TABLE "waitlist" ALTER COLUMN "bookedAppointmentId" TYPE UUID USING "bookedAppointmentId"::UUID;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'waitlist_bookedAppointmentId_fkey') THEN
    ALTER TABLE "waitlist" ADD CONSTRAINT "waitlist_bookedAppointmentId_fkey" FOREIGN KEY ("bookedAppointmentId") REFERENCES "appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- PatientPackage: invoiceId - change type to UUID if needed, add FK
ALTER TABLE "patient_packages" ALTER COLUMN "invoiceId" TYPE UUID USING "invoiceId"::UUID;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'patient_packages_invoiceId_fkey') THEN
    ALTER TABLE "patient_packages" ADD CONSTRAINT "patient_packages_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Refund: approvedById FK
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'refunds_approvedById_fkey') THEN
    ALTER TABLE "refunds" ADD CONSTRAINT "refunds_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- =============================================
-- ADD MISSING INDEXES
-- =============================================

CREATE INDEX IF NOT EXISTS "appointments_roomId_idx" ON "appointments"("roomId");
CREATE INDEX IF NOT EXISTS "appointments_createdById_idx" ON "appointments"("createdById");
CREATE INDEX IF NOT EXISTS "room_allocations_patientId_idx" ON "room_allocations"("patientId");
CREATE INDEX IF NOT EXISTS "room_allocations_doctorId_idx" ON "room_allocations"("doctorId");
CREATE INDEX IF NOT EXISTS "procedures_appointmentId_idx" ON "procedures"("appointmentId");
CREATE INDEX IF NOT EXISTS "procedures_doctorId_idx" ON "procedures"("doctorId");
CREATE INDEX IF NOT EXISTS "prescriptions_appointmentId_idx" ON "prescriptions"("appointmentId");
CREATE INDEX IF NOT EXISTS "lab_tests_appointmentId_idx" ON "lab_tests"("appointmentId");
CREATE INDEX IF NOT EXISTS "patient_documents_uploadedById_idx" ON "patient_documents"("uploadedById");
CREATE INDEX IF NOT EXISTS "invoices_appointmentId_idx" ON "invoices"("appointmentId");
CREATE INDEX IF NOT EXISTS "invoices_createdById_idx" ON "invoices"("createdById");
CREATE INDEX IF NOT EXISTS "payments_processedById_idx" ON "payments"("processedById");
CREATE INDEX IF NOT EXISTS "patient_packages_packageId_idx" ON "patient_packages"("packageId");
CREATE INDEX IF NOT EXISTS "leads_convertedPatientId_idx" ON "leads"("convertedPatientId");
CREATE INDEX IF NOT EXISTS "communication_logs_sentById_idx" ON "communication_logs"("sentById");
CREATE INDEX IF NOT EXISTS "follow_ups_appointmentId_idx" ON "follow_ups"("appointmentId");
CREATE INDEX IF NOT EXISTS "ai_transcriptions_doctorId_idx" ON "ai_transcriptions"("doctorId");
CREATE INDEX IF NOT EXISTS "ai_transcriptions_status_idx" ON "ai_transcriptions"("status");
CREATE INDEX IF NOT EXISTS "triage_records_recordedById_idx" ON "triage_records"("recordedById");
CREATE INDEX IF NOT EXISTS "refunds_approvedById_idx" ON "refunds"("approvedById");
CREATE INDEX IF NOT EXISTS "refunds_processedById_idx" ON "refunds"("processedById");
CREATE INDEX IF NOT EXISTS "waitlist_patientId_idx" ON "waitlist"("patientId");
CREATE INDEX IF NOT EXISTS "waitlist_bookedAppointmentId_idx" ON "waitlist"("bookedAppointmentId");
CREATE INDEX IF NOT EXISTS "medical_histories_patientId_status_idx" ON "medical_histories"("patientId", "status");
CREATE INDEX IF NOT EXISTS "skin_histories_patientId_severity_idx" ON "skin_histories"("patientId", "severity");
