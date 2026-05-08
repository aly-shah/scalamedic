/**
 * @system MediCore ERP - Admin Branches API
 * @route GET /api/admin/branches - List branches
 * @route POST /api/admin/branches - Create branch
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

import { requireAuth } from "@/lib/require-auth";
import { logger } from "@/lib/logger";
import { defaultTenantId } from "@/lib/tenant";
export async function GET(request: Request) {
  try {
    const auth = await requireAuth({ minRole: "ADMIN" });
    if (auth.response) return auth.response;

    const { searchParams } = new URL(request.url);
    const active = searchParams.get("active");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {};

    if (active === "true") where.isActive = true;
    else if (active === "false") where.isActive = false;

    const branches = await prisma.branch.findMany({
      where,
      include: {
        _count: { select: { users: true, patients: true, rooms: true } },
      },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({ success: true, data: branches });
  } catch (error) {
    logger.api("GET", "/api/admin/branches", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch branches" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAuth({ minRole: "ADMIN" });
    if (auth.response) return auth.response;

    const body = await request.json();

    // Single-tenant deployment: any new branch belongs to the only
    // active tenant. Multi-tenant deployments would resolve this from
    // the admin's own tenantId via auth.user.tenantId.
    const tenantId = await defaultTenantId();

    // v53: branch code is per-tenant unique. Same code can exist in
    // a different tenant — we only block within this tenant.
    const existing = await prisma.branch.findUnique({
      where: { tenantId_code: { tenantId, code: body.code } },
    });
    if (existing) {
      return NextResponse.json(
        { success: false, error: "A branch with this code already exists" },
        { status: 409 }
      );
    }

    const branch = await prisma.branch.create({
      data: {
        name: body.name,
        code: body.code,
        address: body.address,
        phone: body.phone,
        email: body.email,
        // Match schema default. Almost every clinic on this system runs in
        // PKT — falling back to UTC silently broke time-of-day comparisons.
        timezone: body.timezone || "Asia/Karachi",
        tenantId,
        isActive: true,
      },
    });

    return NextResponse.json({ success: true, data: branch }, { status: 201 });
  } catch (error) {
    logger.api("POST", "/api/admin/branches", error);
    return NextResponse.json(
      { success: false, error: "Failed to create branch" },
      { status: 500 }
    );
  }
}
