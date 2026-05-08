/**
 * @system MediCore ERP — Payer master (v59 / Tier 4 follow-on)
 * @route GET  /api/admin/payers
 * @route POST /api/admin/payers
 *
 * GET: list per-tenant payers with optional ?active filter and
 * ?search across name + code. Available to any authenticated staff
 * (the picker uses this on the patient insurance form, so locking
 * to ADMIN-only would block receptionists from selecting a payer).
 *
 * POST: ADMIN / SUPER_ADMIN only. Validates code format up-front so
 * the user gets a clean error rather than a constraint violation.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { requireAuth, isAdmin } from "@/lib/require-auth";
import { logger } from "@/lib/logger";
import { logAudit } from "@/lib/audit";
import { defaultTenantId } from "@/lib/tenant";

const CODE_RE = /^[A-Z0-9][A-Z0-9-]{1,38}[A-Z0-9]$/;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// ---------- GET ----------
export async function GET(request: Request) {
  try {
    const auth = await requireAuth();
    if (auth.response) return auth.response;

    const { searchParams } = new URL(request.url);
    const active = searchParams.get("active");
    const search = (searchParams.get("search") || "").trim().toLowerCase();

    // Scope to caller's own tenant. Admins on multi-tenant deployments
    // could pass a tenantId override later; not needed today.
    const me = await prisma.user.findUnique({
      where: { id: auth.user.id },
      select: { tenantId: true },
    });
    if (!me) return NextResponse.json({ success: false, error: "User not found" }, { status: 404 });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = { tenantId: me.tenantId };
    if (active === "true") where.isActive = true;
    else if (active === "false") where.isActive = false;
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { code: { contains: search.toUpperCase() } },
      ];
    }

    const payers = await prisma.payer.findMany({
      where,
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
      include: {
        _count: { select: { insurances: true } },
      },
    });
    return NextResponse.json({ success: true, data: payers });
  } catch (error) {
    logger.api("GET", "/api/admin/payers", error);
    return NextResponse.json({ success: false, error: "Failed to load payers" }, { status: 500 });
  }
}

// ---------- POST ----------
export async function POST(request: Request) {
  try {
    const auth = await requireAuth({ minRole: "ADMIN" });
    if (auth.response) return auth.response;

    const body = await request.json();
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const code = typeof body.code === "string" ? body.code.trim().toUpperCase() : "";
    if (!name) return NextResponse.json({ success: false, error: "Name is required" }, { status: 400 });
    if (!CODE_RE.test(code)) {
      return NextResponse.json(
        { success: false, error: "Code must be 3-40 chars, uppercase letters / digits / hyphens, no leading or trailing hyphen" },
        { status: 400 },
      );
    }

    const contactEmail = typeof body.contactEmail === "string" && body.contactEmail.trim() ? body.contactEmail.trim() : null;
    const claimSubmissionEmail = typeof body.claimSubmissionEmail === "string" && body.claimSubmissionEmail.trim() ? body.claimSubmissionEmail.trim() : null;
    if (contactEmail && !EMAIL_RE.test(contactEmail)) {
      return NextResponse.json({ success: false, error: "contactEmail is not a valid email" }, { status: 400 });
    }
    if (claimSubmissionEmail && !EMAIL_RE.test(claimSubmissionEmail)) {
      return NextResponse.json({ success: false, error: "claimSubmissionEmail is not a valid email" }, { status: 400 });
    }

    const tenantId = isAdmin(auth.user)
      ? (await prisma.user.findUnique({ where: { id: auth.user.id }, select: { tenantId: true } }))?.tenantId
        ?? await defaultTenantId()
      : await defaultTenantId();

    try {
      const created = await prisma.payer.create({
        data: {
          tenantId,
          name,
          code,
          contactEmail,
          claimSubmissionEmail,
          contactPhone: typeof body.contactPhone === "string" && body.contactPhone.trim() ? body.contactPhone.trim() : null,
          notes: typeof body.notes === "string" && body.notes.trim() ? body.notes.trim() : null,
          isActive: body.isActive !== false,
        },
      });
      await logAudit({
        userId: auth.user.id,
        action: "CREATE",
        module: "ADMIN",
        entityType: "Payer",
        entityId: created.id,
        details: { code, name },
      });
      return NextResponse.json({ success: true, data: created }, { status: 201 });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        return NextResponse.json(
          { success: false, error: "A payer with this code or name already exists" },
          { status: 409 },
        );
      }
      throw err;
    }
  } catch (error) {
    logger.api("POST", "/api/admin/payers", error);
    return NextResponse.json({ success: false, error: "Failed to create payer" }, { status: 500 });
  }
}
