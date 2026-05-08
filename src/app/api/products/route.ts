/**
 * @system MediCore ERP — Products/Pharmacy API
 * @route GET /api/products — List products with stock levels
 * @route POST /api/products — Add product
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

import { requireAuth } from "@/lib/require-auth";
import { logger } from "@/lib/logger";
export async function GET(request: Request) {
  try {
    const auth = await requireAuth();
    if (auth.response) return auth.response;

    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category");
    const search = searchParams.get("search")?.toLowerCase();
    const lowStock = searchParams.get("lowStock") === "true";

    const where: Record<string, unknown> = { isActive: true };
    if (category) where.category = category;
    if (lowStock) where.quantity = { lte: prisma.product.fields?.reorderLevel || 5 };

    const products = await prisma.product.findMany({
      where: {
        ...where,
        ...(search && {
          OR: [
            { name: { contains: search, mode: "insensitive" as const } },
            { sku: { contains: search, mode: "insensitive" as const } },
            { brand: { contains: search, mode: "insensitive" as const } },
          ],
        }),
      },
      include: { branch: { select: { id: true, name: true } } },
      orderBy: { name: "asc" },
    });

    const now = Date.now();
    const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
    const stats = {
      total: products.length,
      lowStock: products.filter((p) => p.quantity > 0 && p.quantity <= p.reorderLevel).length,
      outOfStock: products.filter((p) => p.quantity === 0).length,
      // Expiring within 30 days (and not already past) — surfaces on the
      // dashboard so reception/pharmacist can act before write-offs.
      expiringSoon: products.filter((p) => {
        if (!p.expiryDate) return false;
        const t = new Date(p.expiryDate).getTime();
        return t > now && t - now <= THIRTY_DAYS;
      }).length,
      // Already-expired count separately so it's not double-counted with
      // expiringSoon.
      expired: products.filter((p) => p.expiryDate && new Date(p.expiryDate).getTime() <= now).length,
      totalValue: products.reduce((s, p) => s + Number(p.sellPrice) * p.quantity, 0),
    };

    return NextResponse.json({ success: true, data: products, stats });
  } catch (error) {
    logger.api("GET", "/api/products", error);
    return NextResponse.json({ success: false, error: "Failed" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAuth();
    if (auth.response) return auth.response;

    const body = await request.json();
    if (!body.name || !body.branchId) {
      return NextResponse.json({ success: false, error: "Missing: name, branchId" }, { status: 400 });
    }

    const product = await prisma.product.create({
      data: {
        name: body.name,
        sku: body.sku || null,
        barcode: body.barcode || null,
        category: body.category || "OTHER",
        brand: body.brand || null,
        description: body.description || null,
        costPrice: body.costPrice || 0,
        sellPrice: body.sellPrice || 0,
        quantity: body.quantity || 0,
        reorderLevel: body.reorderLevel || 5,
        unit: body.unit || null,
        expiryDate: body.expiryDate ? new Date(body.expiryDate) : null,
        branchId: body.branchId,
      },
    });

    return NextResponse.json({ success: true, data: product }, { status: 201 });
  } catch (error) {
    logger.api("POST", "/api/products", error);
    return NextResponse.json({ success: false, error: "Failed" }, { status: 500 });
  }
}
