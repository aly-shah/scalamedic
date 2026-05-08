/**
 * @system MediCore ERP — Admin user mutation
 * @route PATCH /api/admin/users/[id] — Update editable fields
 *
 * Email is intentionally NOT editable here — it's the auth identity and
 * changing it would break sessions / SSO. Use a dedicated email-change
 * flow with re-verification if that's ever needed.
 *
 * Soft delete only. The User model is referenced by 30+ tables
 * (appointments, invoices, call logs, audit log, etc.) — hard-deleting
 * would orphan or block on FK constraints. Login already refuses
 * isActive=false accounts (see lib/auth.ts), so flipping the flag
 * immediately bars sign-in while preserving every historical record
 * the user touched.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/require-auth";
import { logAudit } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { validate } from "@/lib/validations";

const ROLE_VALUES = [
  "SUPER_ADMIN", "ADMIN", "DOCTOR", "RECEPTIONIST", "BILLING", "CALL_CENTER", "ASSISTANT",
  "AESTHETICIAN", "OPERATOR",
] as const;

const patchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  phone: z.string().max(32).nullable().optional(),
  avatar: z.string().nullable().optional(),
  role: z.enum(ROLE_VALUES).optional(),
  branchId: z.string().uuid().optional(),
  speciality: z.string().max(100).nullable().optional(),
  licenseNumber: z.string().max(60).nullable().optional(),
  consultationFee: z.number().nonnegative().nullable().optional(),
  isActive: z.boolean().optional(),
}).refine(
  (v) => Object.keys(v).length > 0,
  { message: "Provide at least one field to update" },
);

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth({ roles: ["SUPER_ADMIN", "ADMIN"] });
    if (auth.response) return auth.response;

    const { id } = await params;

    const body = await request.json();
    const v = validate(patchSchema, body);
    if (!v.success) {
      return NextResponse.json({ success: false, error: v.error }, { status: 400 });
    }

    const target = await prisma.user.findUnique({
      where: { id },
      select: { id: true, role: true, email: true, name: true, isActive: true },
    });
    if (!target) {
      return NextResponse.json({ success: false, error: "User not found" }, { status: 404 });
    }

    // Self-deactivation guard.
    if (target.id === auth.user.id && v.data.isActive === false) {
      return NextResponse.json(
        { success: false, error: "You can't deactivate your own account" },
        { status: 400 },
      );
    }

    // Only a Super Admin can mutate another Super Admin (covers role
    // change, deactivation, branch reassignment — anything privileged).
    if (target.role === "SUPER_ADMIN" && auth.user.role !== "SUPER_ADMIN") {
      return NextResponse.json(
        { success: false, error: "Only a Super Admin can edit another Super Admin" },
        { status: 403 },
      );
    }

    // Granting Super Admin requires being one already.
    if (v.data.role === "SUPER_ADMIN" && auth.user.role !== "SUPER_ADMIN") {
      return NextResponse.json(
        { success: false, error: "Only a Super Admin can grant Super Admin role" },
        { status: 403 },
      );
    }

    // Validate branchId actually exists when changing it.
    if (v.data.branchId) {
      const branch = await prisma.branch.findUnique({ where: { id: v.data.branchId }, select: { id: true } });
      if (!branch) {
        return NextResponse.json({ success: false, error: "Branch not found" }, { status: 400 });
      }
    }

    const data: Record<string, unknown> = {};
    if (v.data.name !== undefined) data.name = v.data.name;
    if (v.data.phone !== undefined) data.phone = v.data.phone || null;
    if (v.data.avatar !== undefined) data.avatar = v.data.avatar || null;
    if (v.data.role !== undefined) data.role = v.data.role;
    if (v.data.branchId !== undefined) data.branchId = v.data.branchId;
    if (v.data.speciality !== undefined) data.speciality = v.data.speciality || null;
    if (v.data.licenseNumber !== undefined) data.licenseNumber = v.data.licenseNumber || null;
    if (v.data.consultationFee !== undefined) data.consultationFee = v.data.consultationFee;
    if (v.data.isActive !== undefined) data.isActive = v.data.isActive;

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ success: true, data: { id: target.id } });
    }

    const updated = await prisma.user.update({
      where: { id: target.id },
      data,
      select: {
        id: true, email: true, name: true, phone: true, avatar: true,
        role: true, branchId: true,
        branch: { select: { id: true, name: true, code: true } },
        speciality: true, licenseNumber: true, consultationFee: true,
        isActive: true, lastLoginAt: true, createdAt: true, updatedAt: true,
      },
    });

    const action = v.data.isActive === false
      ? "DEACTIVATED"
      : v.data.isActive === true
        ? "REACTIVATED"
        : "USER_UPDATED";

    await logAudit({
      userId: auth.user.id,
      action,
      module: "STAFF",
      entityType: "User",
      entityId: target.id,
      details: { targetEmail: target.email, targetName: target.name, ...v.data },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    logger.api("PATCH", "/api/admin/users/[id]", error);
    return NextResponse.json({ success: false, error: "Failed" }, { status: 500 });
  }
}
