/**
 * @system MediCore ERP - Single Patient API
 * @route GET    /api/patients/:id            - Get patient details
 * @route PUT    /api/patients/:id            - Update patient
 * @route DELETE /api/patients/:id            - Soft-deactivate (default)
 * @route DELETE /api/patients/:id?hard=true  - Hard delete (admin-only,
 *                                              refused if patient has
 *                                              ANY clinical history —
 *                                              guards billing + audit)
 * @route POST   /api/patients/:id/restore    - Re-activate (separate file)
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

import { requireAuth } from "@/lib/require-auth";
import { logger } from "@/lib/logger";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if (auth.response) return auth.response;

    const { id } = await params;

    const patient = await prisma.patient.findUnique({
      where: { id },
      include: {
        allergies: true,
        medications: true,
        insurance: true,
        assignedDoctor: {
          select: { id: true, name: true, speciality: true, avatar: true },
        },
        branch: {
          select: { id: true, name: true, code: true },
        },
        medicalHistory: true,
        skinHistory: true,
      },
    });

    if (!patient) {
      return NextResponse.json(
        { success: false, error: "Patient not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: patient });
  } catch (error) {
    logger.api("GET", "/api/patients/[id]", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch patient" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if (auth.response) return auth.response;

    const { id } = await params;
    const body = await request.json();

    // Check existence
    const existing = await prisma.patient.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Patient not found" },
        { status: 404 }
      );
    }

    const updated = await prisma.patient.update({
      where: { id },
      data: {
        ...(body.firstName !== undefined && { firstName: body.firstName }),
        ...(body.lastName !== undefined && { lastName: body.lastName }),
        ...(body.middleName !== undefined && { middleName: body.middleName }),
        ...(body.email !== undefined && { email: body.email }),
        ...(body.phone !== undefined && { phone: body.phone }),
        ...(body.dateOfBirth !== undefined && {
          // Allow clearing DOB — body.dateOfBirth = "" or null clears it.
          dateOfBirth: body.dateOfBirth ? new Date(body.dateOfBirth) : null,
        }),
        ...(body.gender !== undefined && { gender: body.gender }),
        ...(body.nationality !== undefined && {
          nationality: body.nationality,
        }),
        ...(body.address !== undefined && { address: body.address }),
        ...(body.city !== undefined && { city: body.city }),
        ...(body.emergencyContact !== undefined && {
          emergencyContact: body.emergencyContact,
        }),
        ...(body.emergencyPhone !== undefined && {
          emergencyPhone: body.emergencyPhone,
        }),
        ...(body.bloodType !== undefined && { bloodType: body.bloodType }),
        ...(body.skinType !== undefined && { skinType: body.skinType }),
        ...(body.branchId !== undefined && { branchId: body.branchId }),
        ...(body.assignedDoctorId !== undefined && {
          assignedDoctorId: body.assignedDoctorId,
        }),
        ...(body.profileImage !== undefined && {
          profileImage: body.profileImage,
        }),
        ...(body.notes !== undefined && { notes: body.notes }),
        ...(body.source !== undefined && { source: body.source }),
        ...(body.consentGiven !== undefined && {
          consentGiven: body.consentGiven,
        }),
        ...(body.isVip !== undefined && { isVip: body.isVip }),
        ...(body.isActive !== undefined && { isActive: body.isActive }),
      },
      include: {
        assignedDoctor: {
          select: { id: true, name: true, speciality: true },
        },
        branch: {
          select: { id: true, name: true, code: true },
        },
      },
    });

    await logAudit({
      userId: body.updatedById || "system",
      action: "UPDATE",
      module: "PATIENT",
      entityType: "Patient",
      entityId: updated.id,
      details: { patientCode: updated.patientCode },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    logger.api("PUT", "/api/patients/[id]", error);
    return NextResponse.json(
      { success: false, error: "Failed to update patient" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Both flavours require admin. Hard delete additionally needs the
    // patient to have zero clinical history — the FK fan-out below is
    // intentional: a hard delete has to be safe, not "destroy
    // everything that references the patient".
    const auth = await requireAuth({ roles: ["SUPER_ADMIN", "ADMIN"] });
    if (auth.response) return auth.response;

    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const hard = searchParams.get("hard") === "true";

    const existing = await prisma.patient.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Patient not found" },
        { status: 404 }
      );
    }

    if (hard) {
      // Refuse if there's anything referencing the patient that
      // would either get destroyed or block the cascade. Cheaper to
      // count once than to attempt the delete and parse a 23503.
      const [
        invoiceCount, appointmentCount, prescriptionCount,
        labTestCount, consultationNoteCount, followUpCount,
        roomAllocationCount, triageCount, waitlistCount, consentCount,
      ] = await Promise.all([
        prisma.invoice.count({ where: { patientId: id } }),
        prisma.appointment.count({ where: { patientId: id } }),
        prisma.prescription.count({ where: { patientId: id } }),
        prisma.labTest.count({ where: { patientId: id } }),
        prisma.consultationNote.count({ where: { patientId: id } }),
        prisma.followUp.count({ where: { patientId: id } }),
        prisma.roomAllocation.count({ where: { patientId: id } }),
        prisma.triage.count({ where: { patientId: id } }),
        prisma.waitlist.count({ where: { patientId: id } }),
        prisma.consentForm.count({ where: { patientId: id } }),
      ]);

      const blockers: Record<string, number> = {};
      if (invoiceCount)         blockers.invoices = invoiceCount;
      if (appointmentCount)     blockers.appointments = appointmentCount;
      if (prescriptionCount)    blockers.prescriptions = prescriptionCount;
      if (labTestCount)         blockers.labTests = labTestCount;
      if (consultationNoteCount) blockers.consultationNotes = consultationNoteCount;
      if (followUpCount)        blockers.followUps = followUpCount;
      if (roomAllocationCount)  blockers.roomAllocations = roomAllocationCount;
      if (triageCount)          blockers.triages = triageCount;
      if (waitlistCount)        blockers.waitlists = waitlistCount;
      if (consentCount)         blockers.consentForms = consentCount;

      if (Object.keys(blockers).length > 0) {
        return NextResponse.json(
          {
            success: false,
            error: "Patient has clinical history. Deactivate instead — hard delete would orphan or destroy billing and audit records.",
            blockers,
          },
          { status: 409 }
        );
      }

      // Cascade-safe deletes for the patient's owned children
      // (allergies / medications / insurance / tags / conditions /
      // documents / medical & skin history). Schema FKs already
      // cascade these on delete, so the patient.delete is enough.
      await prisma.patient.delete({ where: { id } });

      await logAudit({
        userId: auth.user.id,
        action: "HARD_DELETE",
        module: "PATIENT",
        entityType: "Patient",
        entityId: id,
        details: {
          patientCode: existing.patientCode,
          firstName: existing.firstName,
          lastName: existing.lastName,
        },
      });

      return NextResponse.json({ success: true, deleted: true });
    }

    // Soft delete (default) — keeps the row + every FK reference
    // intact, just hides the patient from pickers via isActive=false.
    const deactivated = await prisma.patient.update({
      where: { id },
      data: { isActive: false, deletedAt: new Date() },
    });

    await logAudit({
      userId: auth.user.id,
      action: "DEACTIVATE",
      module: "PATIENT",
      entityType: "Patient",
      entityId: deactivated.id,
      details: { patientCode: deactivated.patientCode },
    });

    return NextResponse.json({ success: true, data: deactivated });
  } catch (error) {
    logger.api("DELETE", "/api/patients/[id]", error);
    return NextResponse.json(
      { success: false, error: "Failed to delete patient" },
      { status: 500 }
    );
  }
}
