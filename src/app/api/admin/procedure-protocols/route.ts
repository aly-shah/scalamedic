/**
 * @system MediCore ERP — Procedure protocols (list + create)
 * @route GET  /api/admin/procedure-protocols
 * @route POST /api/admin/procedure-protocols
 *
 * Per-tenant reusable templates for in-clinic procedures. Listed by
 * the admin UI; consumed by procedure creation flows to pre-fill
 * consent / photos / settings / aftercare. Tenant scope is derived
 * from the calling admin's user.
 *
 * Auth: ADMIN+. Read available to any authenticated staff so the
 * doctor-app can later list them in a picker.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/require-auth";
import { logger } from "@/lib/logger";
import { logAudit } from "@/lib/audit";
import { Prisma } from "@prisma/client";

export async function GET(request: Request) {
  try {
    const auth = await requireAuth();
    if (auth.response) return auth.response;

    const { searchParams } = new URL(request.url);
    const includeInactive = searchParams.get("includeInactive") === "true";
    const treatmentId = searchParams.get("treatmentId");
    const branchId = searchParams.get("branchId");

    // Tenant scope: read the user's tenantId from the database
    // (not the JWT — keeps it minimal). Every protocol is bound
    // to a tenant so we can never leak across deployments.
    const me = await prisma.user.findUnique({
      where: { id: auth.user.id },
      select: { tenantId: true },
    });
    if (!me) return NextResponse.json({ success: false, error: "User not found" }, { status: 404 });

    const where: Prisma.ProcedureProtocolWhereInput = { tenantId: me.tenantId };
    if (!includeInactive) where.isActive = true;
    if (treatmentId) where.treatmentId = treatmentId;
    if (branchId) {
      // Branch filter: include both the specific branch's
      // protocols AND tenant-wide ones (branchId NULL).
      where.OR = [{ branchId }, { branchId: null }];
    }

    const protocols = await prisma.procedureProtocol.findMany({
      where,
      orderBy: { name: "asc" },
      include: {
        treatment: { select: { id: true, name: true, code: true } },
        branch:    { select: { id: true, name: true, code: true } },
        createdBy: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({ success: true, data: protocols });
  } catch (error) {
    logger.api("GET", "/api/admin/procedure-protocols", error);
    return NextResponse.json({ success: false, error: "Failed to load protocols" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAuth({ minRole: "ADMIN" });
    if (auth.response) return auth.response;

    const body = await request.json().catch(() => ({}));
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) {
      return NextResponse.json({ success: false, error: "Name is required" }, { status: 400 });
    }

    const me = await prisma.user.findUnique({
      where: { id: auth.user.id },
      select: { tenantId: true },
    });
    if (!me) return NextResponse.json({ success: false, error: "User not found" }, { status: 404 });

    // Sanitize array fields (UI may send through raw user input).
    const cleanArr = (raw: unknown): string[] =>
      Array.isArray(raw)
        ? raw.map((s) => (typeof s === "string" ? s.trim() : "")).filter((s) => s.length > 0)
        : [];

    const protocol = await prisma.procedureProtocol.create({
      data: {
        tenantId: me.tenantId,
        branchId: body.branchId || null,
        name,
        description: typeof body.description === "string" && body.description.trim() ? body.description.trim() : null,
        treatmentId: body.treatmentId || null,
        consentTemplate: typeof body.consentTemplate === "string" && body.consentTemplate.trim() ? body.consentTemplate.trim() : null,
        requiredBeforePhotos: cleanArr(body.requiredBeforePhotos),
        requiredAfterPhotos: cleanArr(body.requiredAfterPhotos),
        machineSettings: body.machineSettings && typeof body.machineSettings === "object" && !Array.isArray(body.machineSettings)
          ? body.machineSettings as Prisma.InputJsonValue
          : Prisma.JsonNull,
        aftercareInstructions: typeof body.aftercareInstructions === "string" && body.aftercareInstructions.trim() ? body.aftercareInstructions.trim() : null,
        suggestedFollowUpDays: typeof body.suggestedFollowUpDays === "number" && body.suggestedFollowUpDays > 0 ? Math.round(body.suggestedFollowUpDays) : null,
        rxKitName: typeof body.rxKitName === "string" && body.rxKitName.trim() ? body.rxKitName.trim() : null,
        estimatedDurationMinutes: typeof body.estimatedDurationMinutes === "number" && body.estimatedDurationMinutes >= 5 ? Math.round(body.estimatedDurationMinutes) : null,
        createdById: auth.user.id,
      },
    });

    await logAudit({
      userId: auth.user.id,
      action: "CREATE",
      module: "PROCEDURE_PROTOCOL",
      entityType: "ProcedureProtocol",
      entityId: protocol.id,
      details: { name, treatmentId: body.treatmentId ?? null },
    });

    return NextResponse.json({ success: true, data: protocol }, { status: 201 });
  } catch (error) {
    logger.api("POST", "/api/admin/procedure-protocols", error);
    return NextResponse.json({ success: false, error: "Failed to create protocol" }, { status: 500 });
  }
}
