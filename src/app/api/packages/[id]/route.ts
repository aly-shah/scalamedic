/**
 * @system MediCore ERP — Single Package API
 * @route GET    /api/packages/:id  — fetch with treatments + subscriber count
 * @route PUT    /api/packages/:id  — update editable fields + replace
 *                                    treatment line items
 * @route DELETE /api/packages/:id  — soft delete (isActive=false)
 *
 * Hard delete is not supported: invoice_items.packageId is Restrict
 * (v11) and patient_packages.packageId is Restrict, so historical
 * receipts and active subscribers must keep the row reachable. The
 * catalog UI hides isActive=false rows by default, so a "delete" feels
 * permanent to the user.
 *
 * The treatments line items on PUT are replaced via delete-all + recreate
 * inside a single transaction. Diff-aware updates aren't worth the
 * complexity here — package_treatments rows are tiny, this endpoint is
 * called rarely, and recreating preserves no client-meaningful identity.
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
    const pkg = await prisma.package.findUnique({
      where: { id },
      include: {
        treatments: {
          include: { treatment: { select: { id: true, name: true, code: true } } },
          orderBy: { createdAt: "asc" },
        },
        branches: { select: { branchId: true } },
        _count: { select: { patientPackages: true, invoiceItems: true } },
      },
    });
    if (!pkg) {
      return NextResponse.json({ success: false, error: "Package not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: pkg });
  } catch (error) {
    logger.api("GET", "/api/packages/[id]", error);
    return NextResponse.json({ success: false, error: "Failed to fetch package" }, { status: 500 });
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

    const existing = await prisma.package.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ success: false, error: "Package not found" }, { status: 404 });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const pkg = await tx.package.update({
        where: { id },
        data: {
          ...(body.name !== undefined && { name: body.name }),
          ...(body.description !== undefined && { description: body.description || null }),
          ...(body.price !== undefined && { price: body.price }),
          ...(body.validityDays !== undefined && { validityDays: Number(body.validityDays) }),
          ...(body.maxRedemptions !== undefined && {
            maxRedemptions: body.maxRedemptions === null ? null : Number(body.maxRedemptions),
          }),
          ...(body.isActive !== undefined && { isActive: !!body.isActive }),
        },
      });

      // Replace the treatment line items only when the caller actually
      // sent a treatments array — sending nothing leaves them alone.
      if (Array.isArray(body.treatments)) {
        await tx.packageTreatment.deleteMany({ where: { packageId: id } });
        if (body.treatments.length > 0) {
          await tx.packageTreatment.createMany({
            data: body.treatments.map((t: Record<string, unknown>) => ({
              packageId: id,
              name: String(t.name || t.treatmentName || "Unnamed"),
              sessions: Math.max(1, Number(t.sessions ?? 1) || 1),
              treatmentId: (t.treatmentId as string) || null,
            })),
          });
        }
      }

      // Replace branch availability when the caller sent it.
      if (Array.isArray(body.branchIds)) {
        await tx.packageBranch.deleteMany({ where: { packageId: id } });
        if (body.branchIds.length > 0) {
          await tx.packageBranch.createMany({
            data: body.branchIds
              .filter((b: unknown): b is string => typeof b === "string" && b.length > 0)
              .map((branchId: string) => ({ packageId: id, branchId })),
            skipDuplicates: true,
          });
        }
      }

      return pkg;
    });

    // Refetch with relations so the client can render the new state without an extra round-trip.
    const fresh = await prisma.package.findUnique({
      where: { id: updated.id },
      include: {
        treatments: {
          include: { treatment: { select: { id: true, name: true, code: true } } },
          orderBy: { createdAt: "asc" },
        },
        branches: { select: { branchId: true } },
        _count: { select: { patientPackages: true, invoiceItems: true } },
      },
    });

    return NextResponse.json({ success: true, data: fresh });
  } catch (error) {
    logger.api("PUT", "/api/packages/[id]", error);
    return NextResponse.json({ success: false, error: "Failed to update package" }, { status: 500 });
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
    const existing = await prisma.package.findUnique({ where: { id }, select: { id: true } });
    if (!existing) {
      return NextResponse.json({ success: false, error: "Package not found" }, { status: 404 });
    }
    await prisma.package.update({ where: { id }, data: { isActive: false } });
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.api("DELETE", "/api/packages/[id]", error);
    return NextResponse.json({ success: false, error: "Failed to deactivate package" }, { status: 500 });
  }
}
