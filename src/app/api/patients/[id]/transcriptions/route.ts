/**
 * @system MediCore ERP - Patient AI Transcriptions API
 * @route GET /api/patients/:id/transcriptions - Get AI transcriptions
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

    const transcriptions = await prisma.aITranscription.findMany({
      where: { patientId: id },
      orderBy: { createdAt: "desc" },
      include: {
        doctor: {
          select: { id: true, name: true, speciality: true },
        },
        appointment: {
          select: { id: true, appointmentCode: true, date: true },
        },
      },
    });

    return NextResponse.json({ success: true, data: transcriptions });
  } catch (error) {
    logger.api("GET", "/api/patients/[id]/transcriptions", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch AI transcriptions" },
      { status: 500 }
    );
  }
}
