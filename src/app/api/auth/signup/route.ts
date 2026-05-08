import { NextResponse } from "next/server";
import { hashPassword, setSessionCookie } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { signupSchema, validate } from "@/lib/validations";

import { logger } from "@/lib/logger";
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const v = validate(signupSchema, body);
    if (!v.success) {
      return NextResponse.json({ success: false, error: v.error }, { status: 400 });
    }
    const { name, email, password } = v.data;

    // Find a branch for the new user. v51 made email uniqueness
    // per-tenant — we look up by (tenantId, email) inside the
    // resolved branch's tenant, not globally.
    const branch = await prisma.branch.findFirst({
      where: { isActive: true },
      select: { id: true, tenantId: true },
    });
    if (!branch) {
      return NextResponse.json(
        { success: false, error: "No active branch found" },
        { status: 400 }
      );
    }

    const existing = await prisma.user.findUnique({
      where: { tenantId_email: { tenantId: branch.tenantId, email } },
    });
    if (existing) {
      return NextResponse.json(
        { success: false, error: "Email already registered" },
        { status: 409 }
      );
    }

    const passwordHash = await hashPassword(password);

    const user = await prisma.user.create({
      data: {
        name, email, passwordHash, role: "RECEPTIONIST",
        branchId: branch.id,
        tenantId: branch.tenantId,
      },
      include: { branch: true },
    });

    const sessionUser = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      branchId: user.branchId,
      branchName: user.branch.name,
    };

    await setSessionCookie(sessionUser);

    return NextResponse.json({ success: true, data: { user: sessionUser } }, { status: 201 });
  } catch (error) {
    logger.error("Signup failed", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
