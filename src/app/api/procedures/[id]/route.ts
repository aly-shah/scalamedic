/**
 * @system MediCore ERP — Single Procedure API
 * @route GET /api/procedures/:id
 * @route PUT /api/procedures/:id — Update procedure (outcome, images, notes)
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
    const procedure = await prisma.procedure.findUnique({
      where: { id },
      include: {
        patient: { select: { id: true, firstName: true, lastName: true, patientCode: true } },
        doctor: { select: { id: true, name: true } },
        treatment: true,
        appointment: { select: { id: true, appointmentCode: true, date: true } },
      },
    });
    if (!procedure) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    return NextResponse.json({ success: true, data: procedure });
  } catch (error) {
    logger.api("GET", "/api/procedures/[id]", error);
    return NextResponse.json({ success: false, error: "Failed" }, { status: 500 });
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

    const existing = await prisma.procedure.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });

    const updated = await prisma.procedure.update({
      where: { id },
      data: {
        ...(body.outcome !== undefined && { outcome: body.outcome }),
        ...(body.complications !== undefined && { complications: body.complications }),
        ...(body.notes !== undefined && { notes: body.notes }),
        ...(body.areasTreated !== undefined && { areasTreated: body.areasTreated }),
        ...(body.settings !== undefined && { settings: body.settings }),
        ...(body.beforeImages !== undefined && { beforeImages: body.beforeImages }),
        ...(body.afterImages !== undefined && { afterImages: body.afterImages }),
        ...(body.consentSigned !== undefined && { consentSigned: body.consentSigned }),
      },
    });

    await logAudit({
      userId: body.userId || "system",
      action: "UPDATE",
      module: "PROCEDURE",
      entityType: "Procedure",
      entityId: id,
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    logger.api("PUT", "/api/procedures/[id]", error);
    return NextResponse.json({ success: false, error: "Failed" }, { status: 500 });
  }
}
