/**
 * @system MediCore ERP — Combined invoices for an appointment
 * @route GET /api/billing/invoices/combined?appointmentId=...
 *
 * Returns the patient + branch + every non-cancelled invoice belonging
 * to a single appointment, with full line items + payments. Powers the
 * combined-receipt route (/billing/invoices/combined/[appointmentId])
 * so reception can print one consolidated bill at checkout when an
 * appointment generated multiple invoices (check-in fee + extra
 * procedures added mid-consult is the common case).
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/require-auth";
import { logger } from "@/lib/logger";

export async function GET(request: Request) {
  try {
    const auth = await requireAuth();
    if (auth.response) return auth.response;

    const { searchParams } = new URL(request.url);
    const appointmentId = searchParams.get("appointmentId");
    if (!appointmentId) {
      return NextResponse.json(
        { success: false, error: "appointmentId is required" },
        { status: 400 }
      );
    }

    const appointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      select: {
        id: true, appointmentCode: true, date: true, startTime: true, endTime: true,
        patient: {
          select: { id: true, firstName: true, lastName: true, patientCode: true, phone: true, dateOfBirth: true },
        },
        branch: { select: { id: true, name: true, code: true, address: true, phone: true } },
        doctor: { select: { id: true, name: true, speciality: true } },
        invoices: {
          where: { status: { notIn: ["CANCELLED"] } },
          orderBy: { createdAt: "asc" },
          include: {
            items: {
              include: {
                treatment: { select: { id: true, name: true, category: true, taxCategory: true } },
              },
            },
            payments: {
              orderBy: { processedAt: "asc" },
              include: { processedBy: { select: { name: true } } },
            },
          },
        },
      },
    });

    if (!appointment) {
      return NextResponse.json(
        { success: false, error: "Appointment not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: appointment });
  } catch (error) {
    logger.api("GET", "/api/billing/invoices/combined", error);
    return NextResponse.json(
      { success: false, error: "Failed to load combined invoices" },
      { status: 500 }
    );
  }
}
