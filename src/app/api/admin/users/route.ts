import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { requireAuth, isAdmin } from "@/lib/require-auth";
import { createUserSchema, validate } from "@/lib/validations";

import { logger } from "@/lib/logger";
import { tenantIdForBranch } from "@/lib/tenant";
export async function GET(request: Request) {
  try {
    const auth = await requireAuth({ minRole: "ADMIN" });
    if (auth.response) return auth.response;

    const { searchParams } = new URL(request.url);
    const role = searchParams.get("role");
    const branchId = searchParams.get("branchId");
    const active = searchParams.get("active");
    const search = searchParams.get("search")?.toLowerCase();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {};

    if (!isAdmin(auth.user)) where.branchId = auth.user.branchId;
    if (role) where.role = role;
    if (branchId && isAdmin(auth.user)) where.branchId = branchId;
    if (active === "true") where.isActive = true;
    else if (active === "false") where.isActive = false;
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
      ];
    }

    const users = await prisma.user.findMany({
      where,
      select: {
        id: true, email: true, name: true, phone: true, avatar: true,
        role: true, branchId: true,
        branch: { select: { id: true, name: true, code: true } },
        speciality: true, licenseNumber: true, consultationFee: true,
        isActive: true,
        lastLoginAt: true, createdAt: true, updatedAt: true,
      },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({ success: true, data: users });
  } catch (error) {
    logger.api("GET", "/api/admin/users", error);
    return NextResponse.json({ success: false, error: "Failed to fetch users" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAuth({ roles: ["SUPER_ADMIN", "ADMIN"] });
    if (auth.response) return auth.response;

    const body = await request.json();
    const v = validate(createUserSchema, body);
    if (!v.success) {
      return NextResponse.json({ success: false, error: v.error }, { status: 400 });
    }

    // Tenant scope follows the chosen branch — every user inherits
    // their tenantId from branch.tenantId. Looking it up rather
    // than trusting the client preserves the invariant that
    // user.tenantId == branch.tenantId.
    const tenantId = await tenantIdForBranch(v.data.branchId);

    // Email uniqueness is now per-tenant (v51). Same email may exist
    // in another tenant; we only reject within this tenant.
    const existing = await prisma.user.findUnique({
      where: { tenantId_email: { tenantId, email: v.data.email } },
    });
    if (existing) {
      return NextResponse.json({ success: false, error: "A user with this email already exists" }, { status: 409 });
    }

    const passwordHash = await hashPassword(v.data.password);

    const user = await prisma.user.create({
      data: {
        email: v.data.email,
        passwordHash,
        name: v.data.name,
        phone: v.data.phone || null,
        avatar: v.data.avatar || null,
        role: v.data.role,
        branchId: v.data.branchId,
        tenantId,
        speciality: v.data.speciality || null,
        licenseNumber: v.data.licenseNumber || null,
        consultationFee: v.data.consultationFee ?? null,
        isActive: true,
      },
      select: {
        id: true, email: true, name: true, phone: true, avatar: true,
        role: true, branchId: true,
        branch: { select: { id: true, name: true, code: true } },
        speciality: true, licenseNumber: true, isActive: true, createdAt: true,
      },
    });

    await logAudit({
      userId: auth.user.id,
      action: "CREATE",
      module: "STAFF",
      entityType: "User",
      entityId: user.id,
      details: { email: user.email, role: user.role },
    });

    return NextResponse.json({ success: true, data: user }, { status: 201 });
  } catch (error) {
    logger.api("POST", "/api/admin/users", error);
    return NextResponse.json({ success: false, error: "Failed to create user" }, { status: 500 });
  }
}
