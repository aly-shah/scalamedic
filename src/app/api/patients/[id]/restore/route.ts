/**
 * @system MediCore ERP — Patient restore (undo soft delete)
 * @route POST /api/patients/:id/restore
 *
 * Re-activates a soft-deactivated patient. Admin-only, same as the
 * delete endpoint — restoring a patient back into pickers is a
 * privilege not handed to reception.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/require-auth";
import { logAudit } from "@/lib/audit";
import { logger } from "@/lib/logger";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth({ roles: ["SUPER_ADMIN", "ADMIN"] });
    if (auth.response) return auth.response;

    const { id } = await params;
    const existing = await prisma.patient.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Patient not found" },
        { status: 404 }
      );
    }

    const restored = await prisma.patient.update({
      where: { id },
      data: { isActive: true, deletedAt: null },
    });

    await logAudit({
      userId: auth.user.id,
      action: "RESTORE",
      module: "PATIENT",
      entityType: "Patient",
      entityId: restored.id,
      details: { patientCode: restored.patientCode },
    });

    return NextResponse.json({ success: true, data: restored });
  } catch (error) {
    logger.api("POST", "/api/patients/[id]/restore", error);
    return NextResponse.json(
      { success: false, error: "Failed to restore patient" },
      { status: 500 }
    );
  }
}
