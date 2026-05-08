/**
 * @system MediCore ERP — Single Product API
 * @route PUT    /api/products/:id          — update product (every editable field)
 * @route DELETE /api/products/:id          — soft delete (isActive=false) since
 *                                            invoice items reference products
 * @route POST   /api/products/:id/adjust   — relative stock adjustment with reason
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/require-auth";
import { logger } from "@/lib/logger";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth();
    if (auth.response) return auth.response;

    const { id } = await params;
    const body = await request.json();

    const updated = await prisma.product.update({
      where: { id },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.sku !== undefined && { sku: body.sku || null }),
        ...(body.barcode !== undefined && { barcode: body.barcode || null }),
        ...(body.brand !== undefined && { brand: body.brand || null }),
        ...(body.category !== undefined && { category: body.category }),
        ...(body.description !== undefined && { description: body.description || null }),
        ...(body.unit !== undefined && { unit: body.unit || null }),
        ...(body.quantity !== undefined && { quantity: Number(body.quantity) }),
        ...(body.sellPrice !== undefined && { sellPrice: body.sellPrice }),
        ...(body.costPrice !== undefined && { costPrice: body.costPrice }),
        ...(body.reorderLevel !== undefined && { reorderLevel: Number(body.reorderLevel) }),
        ...(body.expiryDate !== undefined && {
          expiryDate: body.expiryDate ? new Date(body.expiryDate) : null,
        }),
        ...(body.isActive !== undefined && { isActive: body.isActive }),
      },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    logger.api("PUT", "/api/products/[id]", error);
    return NextResponse.json({ success: false, error: "Failed" }, { status: 500 });
  }
}

/**
 * Soft delete: flips isActive=false. Hard delete would fail because
 * historical invoice items have an FK to products and we shouldn't
 * cascade those — receipts must remain reproducible. The list endpoint
 * already filters on isActive=true so the row vanishes from the
 * pharmacy UI.
 */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth();
    if (auth.response) return auth.response;

    const { id } = await params;
    const existing = await prisma.product.findUnique({ where: { id }, select: { id: true } });
    if (!existing) {
      return NextResponse.json({ success: false, error: "Product not found" }, { status: 404 });
    }
    await prisma.product.update({ where: { id }, data: { isActive: false } });
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.api("DELETE", "/api/products/[id]", error);
    return NextResponse.json({ success: false, error: "Failed" }, { status: 500 });
  }
}
