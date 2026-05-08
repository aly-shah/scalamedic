/**
 * @system MediCore ERP - Packages API
 * @route GET /api/packages - List packages
 * @route POST /api/packages - Create package
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
    const active = searchParams.get("active");
    const search = searchParams.get("search")?.toLowerCase();
    const branchId = searchParams.get("branchId");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {};

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

    const packages = await prisma.package.findMany({
      where,
      include: {
        treatments: {
          include: { treatment: { select: { id: true, name: true, code: true } } },
          orderBy: { createdAt: "asc" },
        },
        branches: { select: { branchId: true } },
        _count: { select: { patientPackages: true } },
      },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({ success: true, data: packages });
  } catch (error) {
    logger.api("GET", "/api/packages", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch packages" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAuth();
    if (auth.response) return auth.response;

    const body = await request.json();

    const rawTreatments = Array.isArray(body.treatments) ? body.treatments : [];
    const rawBranches = Array.isArray(body.branchIds) ? body.branchIds.filter(Boolean) : [];
    const branchIds: string[] = rawBranches.length > 0
      ? rawBranches
      : (await prisma.branch.findMany({ where: { isActive: true }, select: { id: true } })).map((b) => b.id);

    const pkg = await prisma.package.create({
      data: {
        name: body.name,
        description: body.description || null,
        price: body.price,
        validityDays: body.validityDays,
        maxRedemptions: body.maxRedemptions || null,
        isActive: true,
        treatments: {
          create: rawTreatments.map((t: Record<string, unknown>) => ({
            name: String(t.name || t.treatmentName || "Unnamed"),
            sessions: Number(t.sessions ?? 1),
            treatmentId: (t.treatmentId as string) || null,
          })),
        },
        branches: {
          create: branchIds.map((branchId: string) => ({ branchId })),
        },
      },
      include: {
        treatments: {
          include: { treatment: { select: { id: true, name: true, code: true } } },
        },
        branches: { select: { branchId: true } },
      },
    });

    return NextResponse.json({ success: true, data: pkg }, { status: 201 });
  } catch (error) {
    logger.api("POST", "/api/packages", error);
    return NextResponse.json(
      { success: false, error: "Failed to create package" },
      { status: 500 }
    );
  }
}
