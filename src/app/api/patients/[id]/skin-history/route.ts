/**
 * @system MediCore ERP - Patient Skin History API
 * @route GET /api/patients/:id/skin-history - Get skin history
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

    const skinHistory = await prisma.skinHistory.findMany({
      where: { patientId: id },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ success: true, data: skinHistory });
  } catch (error) {
    logger.api("GET", "/api/patients/[id]/skin-history", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch skin history" },
      { status: 500 }
    );
  }
}
