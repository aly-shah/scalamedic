/**
 * @system MediCore ERP — Single Treatment API
 * @route GET    /api/treatments/:id  — fetch with usage counts
 * @route PUT    /api/treatments/:id  — update editable fields
 * @route DELETE /api/treatments/:id  — soft delete (isActive=false)
 *
 * Hard delete is intentionally not supported: invoice_items.treatmentId
 * is Restrict (v11), so historical receipts must keep the row reachable
 * for reproducibility. The catalog UI hides isActive=false rows by
 * default, so a "delete" feels permanent to the user.
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
    const treatment = await prisma.treatment.findUnique({
      where: { id },
      include: {
        branches: { select: { branchId: true } },
        _count: {
          select: { procedures: true, invoiceItems: true, packageTreatments: true, appointments: true },
        },
      },
    });
    if (!treatment) {
      return NextResponse.json({ success: false, error: "Treatment not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: treatment });
  } catch (error) {
    logger.api("GET", "/api/treatments/[id]", error);
    return NextResponse.json({ success: false, error: "Failed to fetch treatment" }, { status: 500 });
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

    const existing = await prisma.treatment.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ success: false, error: "Treatment not found" }, { status: 404 });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const t = await tx.treatment.update({
        where: { id },
        data: {
          ...(body.name !== undefined && { name: body.name }),
          ...(body.code !== undefined && { code: body.code || null }),
          ...(body.category !== undefined && { category: body.category }),
          ...(body.taxCategory !== undefined && { taxCategory: body.taxCategory }),
          ...(body.description !== undefined && { description: body.description || null }),
          ...(body.duration !== undefined && { duration: Number(body.duration) }),
          ...(body.basePrice !== undefined && { basePrice: body.basePrice }),
          ...(body.preInstructions !== undefined && { preInstructions: body.preInstructions || null }),
          ...(body.postInstructions !== undefined && { postInstructions: body.postInstructions || null }),
          ...(body.contraindications !== undefined && { contraindications: body.contraindications || null }),
          ...(body.isActive !== undefined && { isActive: !!body.isActive }),
        },
      });

      // Replace branch availability when the caller actually sent it. Sending
      // [] means "no branches" (admin explicitly opted out of every branch);
      // sending undefined leaves the existing links alone. Same delete-all +
      // recreate pattern as the package treatment line items.
      if (Array.isArray(body.branchIds)) {
        await tx.treatmentBranch.deleteMany({ where: { treatmentId: id } });
        if (body.branchIds.length > 0) {
          await tx.treatmentBranch.createMany({
            data: body.branchIds
              .filter((b: unknown): b is string => typeof b === "string" && b.length > 0)
              .map((branchId: string) => ({ treatmentId: id, branchId })),
            skipDuplicates: true,
          });
        }
      }

      return t;
    });

    // Refetch with branches so the client renders the new state.
    const fresh = await prisma.treatment.findUnique({
      where: { id: updated.id },
      include: { branches: { select: { branchId: true } } },
    });

    return NextResponse.json({ success: true, data: fresh });
  } catch (error) {
    logger.api("PUT", "/api/treatments/[id]", error);
    return NextResponse.json({ success: false, error: "Failed to update treatment" }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if (auth.response) return auth.response;

    const { id } = await params;
    const existing = await prisma.treatment.findUnique({ where: { id }, select: { id: true } });
    if (!existing) {
      return NextResponse.json({ success: false, error: "Treatment not found" }, { status: 404 });
    }
    await prisma.treatment.update({ where: { id }, data: { isActive: false } });
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.api("DELETE", "/api/treatments/[id]", error);
    return NextResponse.json({ success: false, error: "Failed to deactivate treatment" }, { status: 500 });
  }
}
