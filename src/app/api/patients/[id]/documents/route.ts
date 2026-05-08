/**
 * @system MediCore ERP - Patient Documents API
 * @route GET /api/patients/:id/documents - Get patient documents
 * @route POST /api/patients/:id/documents - Upload document metadata
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

import { requireAuth } from "@/lib/require-auth";
import { logger } from "@/lib/logger";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if (auth.response) return auth.response;

    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");

    const where: Prisma.PatientDocumentWhereInput = { patientId: id };

    if (type) {
      where.type = type as Prisma.EnumDocumentTypeFilter;
    }

    const documents = await prisma.patientDocument.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        uploadedBy: {
          select: { id: true, name: true },
        },
      },
    });

    return NextResponse.json({ success: true, data: documents });
  } catch (error) {
    logger.api("GET", "/api/patients/[id]/documents", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch documents" },
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

    const document = await prisma.patientDocument.create({
      data: {
        patientId: id,
        name: body.name,
        type: body.type,
        fileUrl: body.fileUrl,
        fileSize: body.fileSize,
        mimeType: body.mimeType,
        uploadedById: body.uploadedById,
        notes: body.notes,
      },
      include: {
        uploadedBy: {
          select: { id: true, name: true },
        },
      },
    });

    return NextResponse.json(
      { success: true, data: document },
      { status: 201 }
    );
  } catch (error) {
    logger.api("POST", "/api/patients/[id]/documents", error);
    return NextResponse.json(
      { success: false, error: "Failed to create document" },
      { status: 500 }
    );
  }
}
