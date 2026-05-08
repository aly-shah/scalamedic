/**
 * @system MediCore ERP - Patient Tags API
 * @route GET /api/patients/:id/tags - Get patient tags
 * @route POST /api/patients/:id/tags - Create patient tag
 * @route DELETE /api/patients/:id/tags - Delete patient tag
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

    const tags = await prisma.patientTag.findMany({
      where: { patientId: id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        tag: true,
        color: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ success: true, data: tags });
  } catch (error) {
    logger.api("GET", "/api/patients/[id]/tags", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch patient tags" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if (auth.response) return auth.response;

    const { id } = await params;
    const body = await request.json();

    const tag = await prisma.patientTag.create({
      data: {
        patientId: id,
        tag: body.tag,
        color: body.color,
      },
    });

    return NextResponse.json(
      { success: true, data: tag },
      { status: 201 }
    );
  } catch (error: unknown) {
    // Handle unique constraint violation (patientId + tag)
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "P2002"
    ) {
      return NextResponse.json(
        { success: false, error: "Tag already exists for this patient" },
        { status: 409 }
      );
    }
    logger.api("POST", "/api/patients/[id]/tags", error);
    return NextResponse.json(
      { success: false, error: "Failed to create patient tag" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if (auth.response) return auth.response;

    await params;
    const body = await request.json();

    await prisma.patientTag.delete({
      where: { id: body.tagId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.api("DELETE", "/api/patients/[id]/tags", error);
    return NextResponse.json(
      { success: false, error: "Failed to delete patient tag" },
      { status: 500 }
    );
  }
}
