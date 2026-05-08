/**
 * @system MediCore ERP — Payer master per-row (v59)
 * @route PATCH /api/admin/payers/[id]
 *
 * ADMIN / SUPER_ADMIN only. Cross-tenant access blocked. Validates
 * the same fields as the create route.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { requireAuth } from "@/lib/require-auth";
import { logAudit } from "@/lib/audit";
import { logger } from "@/lib/logger";

const CODE_RE = /^[A-Z0-9][A-Z0-9-]{1,38}[A-Z0-9]$/;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth({ minRole: "ADMIN" });
    if (auth.response) return auth.response;
    const { id } = await params;
    const body = await request.json().catch(() => ({}));

    // Tenant scope: the admin can only touch their own tenant's payers.
    const me = await prisma.user.findUnique({
      where: { id: auth.user.id },
      select: { tenantId: true },
    });
    if (!me) return NextResponse.json({ success: false, error: "User not found" }, { status: 404 });

    const existing = await prisma.payer.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ success: false, error: "Payer not found" }, { status: 404 });
    if (existing.tenantId !== me.tenantId) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = {};
    if (typeof body.name === "string") {
      const v = body.name.trim();
      if (!v) return NextResponse.json({ success: false, error: "Name cannot be empty" }, { status: 400 });
      data.name = v;
    }
    if (typeof body.code === "string") {
      const v = body.code.trim().toUpperCase();
      if (!CODE_RE.test(v)) {
        return NextResponse.json({ success: false, error: "Code must be 3-40 chars, uppercase letters / digits / hyphens" }, { status: 400 });
      }
      data.code = v;
    }
    if ("contactEmail" in body) {
      const v = typeof body.contactEmail === "string" && body.contactEmail.trim() ? body.contactEmail.trim() : null;
      if (v && !EMAIL_RE.test(v)) return NextResponse.json({ success: false, error: "contactEmail invalid" }, { status: 400 });
      data.contactEmail = v;
    }
    if ("claimSubmissionEmail" in body) {
      const v = typeof body.claimSubmissionEmail === "string" && body.claimSubmissionEmail.trim() ? body.claimSubmissionEmail.trim() : null;
      if (v && !EMAIL_RE.test(v)) return NextResponse.json({ success: false, error: "claimSubmissionEmail invalid" }, { status: 400 });
      data.claimSubmissionEmail = v;
    }
    if ("contactPhone" in body) {
      const v = typeof body.contactPhone === "string" && body.contactPhone.trim() ? body.contactPhone.trim() : null;
      data.contactPhone = v;
    }
    if ("notes" in body) {
      const v = typeof body.notes === "string" && body.notes.trim() ? body.notes.trim() : null;
      data.notes = v;
    }
    if (typeof body.isActive === "boolean") data.isActive = body.isActive;

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ success: false, error: "No fields to update" }, { status: 400 });
    }

    try {
      const updated = await prisma.payer.update({ where: { id }, data });
      await logAudit({
        userId: auth.user.id,
        action: "UPDATE",
        module: "ADMIN",
        entityType: "Payer",
        entityId: id,
        details: data,
      });
      return NextResponse.json({ success: true, data: updated });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        return NextResponse.json({ success: false, error: "A payer with this code or name already exists" }, { status: 409 });
      }
      throw err;
    }
  } catch (error) {
    logger.api("PATCH", "/api/admin/payers/[id]", error);
    return NextResponse.json({ success: false, error: "Failed to update payer" }, { status: 500 });
  }
}
