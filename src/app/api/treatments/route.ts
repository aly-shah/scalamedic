/**
 * @system MediCore ERP - Treatments Catalog API
 * @route GET /api/treatments - List treatments (filter by branch / category / search)
 * @route POST /api/treatments - Create treatment with branch availability
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { requireAuth } from "@/lib/require-auth";
import { logger } from "@/lib/logger";

export async function GET(request: Request) {
  try {
    const auth = await requireAuth();
    if (auth.response) return auth.response;

    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category");
    const active = searchParams.get("active");
    const search = searchParams.get("search")?.toLowerCase();
    // Filter to treatments offered at a specific branch — used by the
    // CreateAppointmentModal to scope the procedure list.
    const branchId = searchParams.get("branchId");

    const where: Prisma.TreatmentWhereInput = {};

    if (category) where.category = category as Prisma.TreatmentWhereInput["category"];
    if (active === "true") where.isActive = true;
    else if (active === "false") where.isActive = false;
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
      ];
    }
    if (branchId) {
      where.branches = { some: { branchId } };
    }

    const treatments = await prisma.treatment.findMany({
      where,
      orderBy: { name: "asc" },
      include: {
        // Branch availability — flat list for the form to round-trip and the
        // catalog UI to render chips.
        branches: { select: { branchId: true } },
        // Surface usage so the catalog UI can show "12 performed" / "in 3 packages"
        // without N+1 round-trips. _count adds a single grouped subquery per row.
        _count: {
          select: { procedures: true, invoiceItems: true, packageTreatments: true, appointments: true },
        },
      },
    });

    return NextResponse.json({ success: true, data: treatments });
  } catch (error) {
    logger.api("GET", "/api/treatments", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch treatments" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAuth();
    if (auth.response) return auth.response;

    const body = await request.json();
    // Default to "all branches" when the caller doesn't specify any —
    // matches the v24 backfill semantics.
    const rawBranches = Array.isArray(body.branchIds) ? body.branchIds.filter(Boolean) : [];
    const branchIds = rawBranches.length > 0
      ? rawBranches
      : (await prisma.branch.findMany({ where: { isActive: true }, select: { id: true } })).map((b) => b.id);

    const treatment = await prisma.treatment.create({
      data: {
        name: body.name,
        code: body.code || null,
        category: body.category,
        // Falls back to MEDICAL via the schema default if the client
        // omits taxCategory (older form versions etc.).
        ...(body.taxCategory && { taxCategory: body.taxCategory }),
        description: body.description || null,
        duration: body.duration,
        basePrice: body.basePrice,
        preInstructions: body.preInstructions || null,
        postInstructions: body.postInstructions || null,
        contraindications: body.contraindications || null,
        isActive: true,
        branches: {
          create: branchIds.map((branchId: string) => ({ branchId })),
        },
      },
      include: { branches: { select: { branchId: true } } },
    });

    return NextResponse.json({ success: true, data: treatment }, { status: 201 });
  } catch (error) {
    logger.api("POST", "/api/treatments", error);
    return NextResponse.json(
      { success: false, error: "Failed to create treatment" },
      { status: 500 }
    );
  }
}
