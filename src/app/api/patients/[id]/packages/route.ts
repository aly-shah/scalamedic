/**
 * @system MediCore ERP - Patient Packages API
 * @route GET /api/patients/:id/packages - Get patient packages
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

    const packages = await prisma.patientPackage.findMany({
      where: { patientId: id },
      orderBy: { createdAt: "desc" },
      include: {
        package: {
          include: {
            treatments: {
              include: { treatment: { select: { id: true, name: true, code: true } } },
              orderBy: { createdAt: "asc" },
            },
          },
        },
      },
    });

    return NextResponse.json({ success: true, data: packages });
  } catch (error) {
    logger.api("GET", "/api/patients/[id]/packages", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch patient packages" },
      { status: 500 }
    );
  }
}
