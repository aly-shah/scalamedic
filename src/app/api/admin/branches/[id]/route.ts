/**
 * @system MediCore ERP — Single Branch API (admin)
 * @route GET    /api/admin/branches/:id  — fetch with usage counts
 * @route PUT    /api/admin/branches/:id  — update editable fields
 * @route DELETE /api/admin/branches/:id  — soft delete (isActive=false)
 *
 * Hard delete isn't supported: user/patient/room/etc. FKs all reference
 * branches with onDelete: Restrict, so historical staff and patient
 * rosters keep the row reachable. The catalog UI hides isActive=false
 * branches by default, so a "delete" feels permanent to the user.
 *
 * Code uniqueness is enforced at the schema level (Branch.code @unique),
 * but we surface a friendlier 409 on PUT here too.
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
    const auth = await requireAuth({ minRole: "ADMIN" });
    if (auth.response) return auth.response;

    const { id } = await params;
    const branch = await prisma.branch.findUnique({
      where: { id },
      include: {
        _count: { select: { users: true, patients: true, rooms: true, appointments: true, invoices: true } },
      },
    });
    if (!branch) {
      return NextResponse.json({ success: false, error: "Branch not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: branch });
  } catch (error) {
    logger.api("GET", "/api/admin/branches/[id]", error);
    return NextResponse.json({ success: false, error: "Failed to fetch branch" }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth({ minRole: "ADMIN" });
    if (auth.response) return auth.response;

    const { id } = await params;
    const body = await request.json();

    const existing = await prisma.branch.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ success: false, error: "Branch not found" }, { status: 404 });
    }

    // If the caller is changing the code, make sure no other branch
    // in the same tenant already uses it (v53: code is per-tenant unique).
    if (body.code && body.code !== existing.code) {
      const clash = await prisma.branch.findUnique({
        where: { tenantId_code: { tenantId: existing.tenantId, code: body.code } },
      });
      if (clash) {
        return NextResponse.json(
          { success: false, error: "A branch with this code already exists" },
          { status: 409 }
        );
      }
    }

    const updated = await prisma.branch.update({
      where: { id },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.code !== undefined && { code: body.code }),
        ...(body.address !== undefined && { address: body.address }),
        ...(body.phone !== undefined && { phone: body.phone }),
        ...(body.email !== undefined && { email: body.email }),
        ...(body.timezone !== undefined && { timezone: body.timezone || "Asia/Karachi" }),
        ...(body.isActive !== undefined && { isActive: !!body.isActive }),
      },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    logger.api("PUT", "/api/admin/branches/[id]", error);
    return NextResponse.json({ success: false, error: "Failed to update branch" }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth({ minRole: "ADMIN" });
    if (auth.response) return auth.response;

    const { id } = await params;
    const existing = await prisma.branch.findUnique({ where: { id }, select: { id: true } });
    if (!existing) {
      return NextResponse.json({ success: false, error: "Branch not found" }, { status: 404 });
    }
    await prisma.branch.update({ where: { id }, data: { isActive: false } });
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.api("DELETE", "/api/admin/branches/[id]", error);
    return NextResponse.json({ success: false, error: "Failed to deactivate branch" }, { status: 500 });
  }
}
