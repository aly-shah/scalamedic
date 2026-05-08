/**
 * @system MediCore ERP — Branches list (read-only, any authenticated role)
 * @route GET /api/branches — List branches for filters / appointment booking
 *
 * Why this exists alongside /api/admin/branches: that endpoint is admin-only
 * (gated by minRole: ADMIN). Reception, doctors, billing etc. still need
 * to see the branch list to populate the booking branch picker, scope
 * patient lists, etc. — they don't need the admin mutation surface, so
 * this is a read-only mirror with a permissive auth gate. Same shape as
 * /api/admin/branches so client hooks can share types.
 *
 * Inactive branches are filtered out by default since this powers UI pickers.
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
    const includeInactive = searchParams.get("includeInactive") === "true";

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {};
    if (active === "true") where.isActive = true;
    else if (active === "false") where.isActive = false;
    else if (!includeInactive) where.isActive = true;

    const branches = await prisma.branch.findMany({
      where,
      select: {
        id: true, name: true, code: true, address: true,
        phone: true, email: true, timezone: true, isActive: true,
        createdAt: true,
      },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({ success: true, data: branches });
  } catch (error) {
    logger.api("GET", "/api/branches", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch branches" },
      { status: 500 }
    );
  }
}
