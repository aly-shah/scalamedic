/**
 * @system MediCore ERP - Single Prescription API
 * @route GET /api/prescriptions/:id - Get prescription detail
 * @route PUT /api/prescriptions/:id - Update prescription
 * @route DELETE /api/prescriptions/:id - Delete prescription
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

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

    const prescription = await prisma.prescription.findUnique({
      where: { id },
      include: {
        items: true,
        patient: { select: { id: true, firstName: true, lastName: true, patientCode: true, phone: true, dateOfBirth: true, gender: true, allergies: { select: { allergen: true } } } },
        doctor: { select: { id: true, name: true, speciality: true, licenseNumber: true } },
        appointment: { select: { id: true, appointmentCode: true, date: true } },
      },
    });

    if (!prescription) {
      return NextResponse.json({ success: false, error: "Prescription not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: prescription });
  } catch (error) {
    logger.api("GET", "/api/prescriptions/[id]", error);
    return NextResponse.json({ success: false, error: "Failed to fetch prescription" }, { status: 500 });
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

    const existing = await prisma.prescription.findUnique({ where: { id }, include: { items: true } });
    if (!existing) {
      return NextResponse.json({ success: false, error: "Prescription not found" }, { status: 404 });
    }

    // Update prescription and replace items if provided
    const updated = await prisma.$transaction(async (tx) => {
      // Update prescription fields
      await tx.prescription.update({
        where: { id },
        data: {
          ...(body.notes !== undefined && { notes: body.notes }),
          ...(body.isActive !== undefined && { isActive: body.isActive }),
        },
      });

      // If new items provided, delete old and create new
      if (body.items && Array.isArray(body.items)) {
        await tx.prescriptionItem.deleteMany({ where: { prescriptionId: id } });
        await tx.prescriptionItem.createMany({
          data: body.items.map((item: Record<string, unknown>) => ({
            prescriptionId: id,
            medicineName: item.medicineName as string,
            dosage: (item.dosage as string) || null,
            frequency: (item.frequency as string) || null,
            duration: (item.duration as string) || null,
            route: (item.route as string) || null,
            instructions: (item.instructions as string) || null,
          })),
        });
      }

      return tx.prescription.findUnique({
        where: { id },
        include: {
          items: true,
          doctor: { select: { id: true, name: true, speciality: true } },
        },
      });
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    logger.api("PUT", "/api/prescriptions/[id]", error);
    return NextResponse.json({ success: false, error: "Failed to update prescription" }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if (auth.response) return auth.response;

    const { id } = await params;

    const existing = await prisma.prescription.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ success: false, error: "Prescription not found" }, { status: 404 });
    }

    // Soft delete by marking inactive
    await prisma.prescription.update({
      where: { id },
      data: { isActive: false },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.api("DELETE", "/api/prescriptions/[id]", error);
    return NextResponse.json({ success: false, error: "Failed to delete prescription" }, { status: 500 });
  }
}
