/**
 * @system MediCore ERP — Denial-reason taxonomy (v60)
 * @route GET  /api/admin/denial-reasons
 * @route POST /api/admin/denial-reasons  (ADMIN+)
 *
 * GET is open to any authenticated staff so the claims decide-modal
 * can populate its picker.
 */
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/require-auth";
import { logger } from "@/lib/logger";
import { logAudit } from "@/lib/audit";

const CODE_RE = /^[A-Z0-9][A-Z0-9-]{1,38}[A-Z0-9]$/;

export async function GET(request: Request) {
  try {
    const auth = await requireAuth();
    if (auth.response) return auth.response;
    const me = await prisma.user.findUnique({
      where: { id: auth.user.id },
      select: { tenantId: true },
    });
    if (!me) return NextResponse.json({ success: false, error: "User not found" }, { status: 404 });

    const { searchParams } = new URL(request.url);
    const active = searchParams.get("active");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = { tenantId: me.tenantId };
    if (active === "true") where.isActive = true;
    else if (active === "false") where.isActive = false;

    const rows = await prisma.denialReason.findMany({
      where,
      orderBy: [{ isActive: "desc" }, { isCommon: "desc" }, { code: "asc" }],
    });
    return NextResponse.json({ success: true, data: rows });
  } catch (error) {
    logger.api("GET", "/api/admin/denial-reasons", error);
    return NextResponse.json({ success: false, error: "Failed" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAuth({ minRole: "ADMIN" });
    if (auth.response) return auth.response;
    const body = await request.json();

    const code = typeof body.code === "string" ? body.code.trim().toUpperCase() : "";
    const description = typeof body.description === "string" ? body.description.trim() : "";
    if (!CODE_RE.test(code)) {
      return NextResponse.json({ success: false, error: "Code must be 3-40 chars, uppercase letters / digits / hyphens" }, { status: 400 });
    }
    if (!description) {
      return NextResponse.json({ success: false, error: "Description is required" }, { status: 400 });
    }

    const me = await prisma.user.findUnique({
      where: { id: auth.user.id },
      select: { tenantId: true },
    });
    if (!me) return NextResponse.json({ success: false, error: "User not found" }, { status: 404 });

    try {
      const created = await prisma.denialReason.create({
        data: {
          tenantId: me.tenantId,
          code,
          description: description.slice(0, 200),
          isCommon: !!body.isCommon,
          isActive: body.isActive !== false,
        },
      });
      await logAudit({
        userId: auth.user.id,
        action: "CREATE",
        module: "ADMIN",
        entityType: "DenialReason",
        entityId: created.id,
        details: { code, description },
      });
      return NextResponse.json({ success: true, data: created }, { status: 201 });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        return NextResponse.json({ success: false, error: "A denial reason with this code already exists" }, { status: 409 });
      }
      throw err;
    }
  } catch (error) {
    logger.api("POST", "/api/admin/denial-reasons", error);
    return NextResponse.json({ success: false, error: "Failed" }, { status: 500 });
  }
}
