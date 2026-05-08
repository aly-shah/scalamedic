/**
 * @system MediCore ERP - Patient Communications API
 * @route GET /api/patients/:id/communications - Get communication logs
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

    const communications = await prisma.communicationLog.findMany({
      where: { patientId: id },
      orderBy: { createdAt: "desc" },
      include: {
        sentBy: {
          select: { id: true, name: true },
        },
      },
    });

    return NextResponse.json({ success: true, data: communications });
  } catch (error) {
    logger.api("GET", "/api/patients/[id]/communications", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch communication logs" },
      { status: 500 }
    );
  }
}
