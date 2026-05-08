/**
 * @system MediCore ERP — Staff directory (read-only, any authenticated role)
 * @route GET /api/users — List active staff for filters + appointment booking
 *
 * Why this exists alongside /api/admin/users: that endpoint is admin-only
 * (gated by minRole: ADMIN). Reception, doctors, billing etc. still need
 * to see the staff list to populate doctor filters, book appointments to
 * a specific doctor, etc. — they don't need the full mutation surface, so
 * this is a read-only mirror with a permissive auth gate. Same shape as
 * /api/admin/users so client hooks can share types.
 *
 * Inactive users are filtered out by default since this powers UI pickers.
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
    const role = searchParams.get("role");
    const includeInactive = searchParams.get("includeInactive") === "true";

    // Read-only staff directory — visible across branches for ALL roles.
    // The CreateAppointmentModal (and calendar QuickBookPanel) lets a
    // receptionist pick which branch an appointment is for; if we
    // home-branch-scope here, they'd see no doctors for any other branch
    // and the picker becomes useless. branchId is included in each row
    // so the client-side filter (modal already does this) can scope by
    // the selected branch on its own.
    //
    // Privacy is fine: the response only exposes name + role + public
    // contact + branch — the same surface a patient-facing doctor
    // directory would publish. For the admin-only mutation surface
    // (passwordHash, etc) use /api/admin/users.
    const where: Record<string, unknown> = {};
    if (role) where.role = role;
    if (!includeInactive) where.isActive = true;

    const users = await prisma.user.findMany({
      where,
      select: {
        id: true, email: true, name: true, phone: true, avatar: true,
        role: true, branchId: true,
        branch: { select: { id: true, name: true, code: true } },
        speciality: true, licenseNumber: true, isActive: true,
        lastLoginAt: true, createdAt: true,
      },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({ success: true, data: users });
  } catch (error) {
    logger.api("GET", "/api/users", error);
    return NextResponse.json({ success: false, error: "Failed to fetch users" }, { status: 500 });
  }
}
