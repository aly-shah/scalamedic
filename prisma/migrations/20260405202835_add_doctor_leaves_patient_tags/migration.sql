-- CreateEnum
CREATE TYPE "LeaveType" AS ENUM ('VACATION', 'SICK', 'PERSONAL', 'CONFERENCE', 'TRAINING');

-- CreateEnum
CREATE TYPE "LeaveStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "doctor_leaves" (
    "id" UUID NOT NULL,
    "doctorId" UUID NOT NULL,
    "type" "LeaveType" NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "reason" TEXT,
    "status" "LeaveStatus" NOT NULL DEFAULT 'PENDING',
    "approvedBy" VARCHAR(120),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "doctor_leaves_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patient_tags" (
    "id" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "tag" VARCHAR(50) NOT NULL,
    "color" VARCHAR(7),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "patient_tags_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "doctor_leaves_doctorId_idx" ON "doctor_leaves"("doctorId");

-- CreateIndex
CREATE INDEX "doctor_leaves_startDate_endDate_idx" ON "doctor_leaves"("startDate", "endDate");

-- CreateIndex
CREATE INDEX "doctor_leaves_status_idx" ON "doctor_leaves"("status");

-- CreateIndex
CREATE INDEX "patient_tags_patientId_idx" ON "patient_tags"("patientId");

-- CreateIndex
CREATE INDEX "patient_tags_tag_idx" ON "patient_tags"("tag");

-- CreateIndex
CREATE UNIQUE INDEX "patient_tags_patientId_tag_key" ON "patient_tags"("patientId", "tag");

-- AddForeignKey
ALTER TABLE "doctor_leaves" ADD CONSTRAINT "doctor_leaves_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_tags" ADD CONSTRAINT "patient_tags_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
