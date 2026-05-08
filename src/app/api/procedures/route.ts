/**
 * @system MediCore ERP — Procedures API
 * @route GET /api/procedures — List procedures
 * @route POST /api/procedures — Create/order a procedure
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

import { requireAuth } from "@/lib/require-auth";
import { logger } from "@/lib/logger";
export async function GET(request: Request) {
  try {
    const auth = await requireAuth();
    if (auth.response) return auth.response;

    const { searchParams } = new URL(request.url);
    const patientId = searchParams.get("patientId");
    const status = searchParams.get("status");

    const where: Record<string, unknown> = {};
    if (patientId) where.patientId = patientId;
    // Note: Procedure model doesn't have a status field yet, filter by date

    const procedures = await prisma.procedure.findMany({
      where,
      include: {
        patient: { select: { id: true, firstName: true, lastName: true, patientCode: true } },
        doctor: { select: { id: true, name: true } },
        treatment: { select: { id: true, name: true, category: true, basePrice: true } },
        appointment: { select: { id: true, appointmentCode: true, date: true } },
      },
      orderBy: { performedAt: "desc" },
    });

    return NextResponse.json({ success: true, data: procedures });
  } catch (error) {
    logger.api("GET", "/api/procedures", error);
    return NextResponse.json({ success: false, error: "Failed to fetch procedures" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAuth();
    if (auth.response) return auth.response;

    const body = await request.json();

    if (!body.patientId || !body.doctorId || !body.treatmentId || !body.appointmentId) {
      return NextResponse.json(
        { success: false, error: "Missing required: patientId, doctorId, treatmentId, appointmentId" },
        { status: 400 }
      );
    }

    const procedure = await prisma.procedure.create({
      data: {
        patientId: body.patientId,
        doctorId: body.doctorId,
        treatmentId: body.treatmentId,
        appointmentId: body.appointmentId,
        areasTreated: body.areasTreated || [],
        settings: body.settings || null,
        notes: body.notes || null,
        outcome: body.outcome || null,
        consentSigned: body.consentSigned || false,
      },
      include: {
        treatment: { select: { id: true, name: true, basePrice: true } },
        patient: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    // Auto-deduct from patient package if they have one for this treatment
    if (body.deductFromPackage) {
      const activePackage = await prisma.patientPackage.findFirst({
        where: {
          patientId: body.patientId,
          status: "ACTIVE",
          expiryDate: { gte: new Date() },
        },
        include: { package: true },
      });

      if (activePackage) {
        const remaining = activePackage.remainingSessions as Record<string, number>;
        const treatmentName = procedure.treatment.name;
        if (remaining[treatmentName] && remaining[treatmentName] > 0) {
          remaining[treatmentName]--;
          await prisma.patientPackage.update({
            where: { id: activePackage.id },
            data: { remainingSessions: remaining },
          });
        }
      }
    }

    await logAudit({
      userId: body.doctorId,
      action: "CREATE",
      module: "PROCEDURE",
      entityType: "Procedure",
      entityId: procedure.id,
      details: { treatmentName: procedure.treatment.name, patientId: body.patientId },
    });

    return NextResponse.json({ success: true, data: procedure }, { status: 201 });
  } catch (error) {
    logger.api("POST", "/api/procedures", error);
    return NextResponse.json({ success: false, error: "Failed to create procedure" }, { status: 500 });
  }
}
