/**
 * @system MediCore ERP — Denial-reason update (v60)
 * @route PATCH /api/admin/denial-reasons/[id]
 *
 * ADMIN+. Tenant-scoped: caller can only touch their own tenant's
 * rows.
 */
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/require-auth";
import { logAudit } from "@/lib/audit";
import { logger } from "@/lib/logger";

const CODE_RE = /^[A-Z0-9][A-Z0-9-]{1,38}[A-Z0-9]$/;

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth({ minRole: "ADMIN" });
    if (auth.response) return auth.response;
    const { id } = await params;
    const body = await request.json().catch(() => ({}));

    const me = await prisma.user.findUnique({ where: { id: auth.user.id }, select: { tenantId: true } });
    if (!me) return NextResponse.json({ success: false, error: "User not found" }, { status: 404 });

    const existing = await prisma.denialReason.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    if (existing.tenantId !== me.tenantId) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = {};
    if (typeof body.code === "string") {
      const v = body.code.trim().toUpperCase();
      if (!CODE_RE.test(v)) {
        return NextResponse.json({ success: false, error: "Invalid code format" }, { status: 400 });
      }
      data.code = v;
    }
    if (typeof body.description === "string") {
      const v = body.description.trim();
      if (!v) return NextResponse.json({ success: false, error: "Description cannot be empty" }, { status: 400 });
      data.description = v.slice(0, 200);
    }
    if (typeof body.isCommon === "boolean") data.isCommon = body.isCommon;
    if (typeof body.isActive === "boolean") data.isActive = body.isActive;
    if (Object.keys(data).length === 0) {
      return NextResponse.json({ success: false, error: "Nothing to update" }, { status: 400 });
    }

    try {
      const updated = await prisma.denialReason.update({ where: { id }, data });
      await logAudit({
        userId: auth.user.id,
        action: "UPDATE",
        module: "ADMIN",
        entityType: "DenialReason",
        entityId: id,
        details: data,
      });
      return NextResponse.json({ success: true, data: updated });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        return NextResponse.json({ success: false, error: "Code conflict" }, { status: 409 });
      }
      throw err;
    }
  } catch (error) {
    logger.api("PATCH", "/api/admin/denial-reasons/[id]", error);
    return NextResponse.json({ success: false, error: "Failed" }, { status: 500 });
  }
}
