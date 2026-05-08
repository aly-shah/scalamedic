/**
 * @system MediCore ERP — Procedure protocol (read / update / archive)
 * @route GET    /api/admin/procedure-protocols/:id
 * @route PUT    /api/admin/procedure-protocols/:id
 * @route DELETE /api/admin/procedure-protocols/:id  (soft — flips isActive=false)
 *
 * Updates bump `version` so the audit reader can see how the
 * template evolved over time. Existing Procedure rows that linked
 * this protocol retain their frozen snapshot; future Procedures
 * pre-fill from the new version.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/require-auth";
import { logger } from "@/lib/logger";
import { logAudit } from "@/lib/audit";
import { Prisma } from "@prisma/client";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth();
    if (auth.response) return auth.response;
    const { id } = await params;

    const me = await prisma.user.findUnique({ where: { id: auth.user.id }, select: { tenantId: true } });
    if (!me) return NextResponse.json({ success: false, error: "User not found" }, { status: 404 });

    const protocol = await prisma.procedureProtocol.findFirst({
      where: { id, tenantId: me.tenantId },
      include: {
        treatment: { select: { id: true, name: true, code: true } },
        branch:    { select: { id: true, name: true, code: true } },
        createdBy: { select: { id: true, name: true } },
      },
    });
    if (!protocol) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    return NextResponse.json({ success: true, data: protocol });
  } catch (error) {
    logger.api("GET", "/api/admin/procedure-protocols/[id]", error);
    return NextResponse.json({ success: false, error: "Failed" }, { status: 500 });
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth({ minRole: "ADMIN" });
    if (auth.response) return auth.response;
    const { id } = await params;

    const me = await prisma.user.findUnique({ where: { id: auth.user.id }, select: { tenantId: true } });
    if (!me) return NextResponse.json({ success: false, error: "User not found" }, { status: 404 });

    const existing = await prisma.procedureProtocol.findFirst({ where: { id, tenantId: me.tenantId } });
    if (!existing) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });

    const body = await request.json().catch(() => ({}));
    const cleanArr = (raw: unknown): string[] =>
      Array.isArray(raw)
        ? raw.map((s) => (typeof s === "string" ? s.trim() : "")).filter((s) => s.length > 0)
        : [];
    const trimOrNull = (raw: unknown): string | null =>
      typeof raw === "string" && raw.trim() ? raw.trim() : null;

    const data: Prisma.ProcedureProtocolUpdateInput = {
      version: { increment: 1 },
    };
    if ("name" in body && typeof body.name === "string" && body.name.trim()) data.name = body.name.trim();
    if ("description" in body) data.description = trimOrNull(body.description);
    if ("branchId" in body) data.branch = body.branchId ? { connect: { id: body.branchId } } : { disconnect: true };
    if ("treatmentId" in body) data.treatment = body.treatmentId ? { connect: { id: body.treatmentId } } : { disconnect: true };
    if ("consentTemplate" in body) data.consentTemplate = trimOrNull(body.consentTemplate);
    if ("requiredBeforePhotos" in body) data.requiredBeforePhotos = cleanArr(body.requiredBeforePhotos);
    if ("requiredAfterPhotos" in body) data.requiredAfterPhotos = cleanArr(body.requiredAfterPhotos);
    if ("machineSettings" in body) {
      data.machineSettings = body.machineSettings && typeof body.machineSettings === "object" && !Array.isArray(body.machineSettings)
        ? body.machineSettings as Prisma.InputJsonValue
        : Prisma.JsonNull;
    }
    if ("aftercareInstructions" in body) data.aftercareInstructions = trimOrNull(body.aftercareInstructions);
    if ("suggestedFollowUpDays" in body) data.suggestedFollowUpDays = typeof body.suggestedFollowUpDays === "number" && body.suggestedFollowUpDays > 0 ? Math.round(body.suggestedFollowUpDays) : null;
    if ("rxKitName" in body) data.rxKitName = trimOrNull(body.rxKitName);
    if ("estimatedDurationMinutes" in body) data.estimatedDurationMinutes = typeof body.estimatedDurationMinutes === "number" && body.estimatedDurationMinutes >= 5 ? Math.round(body.estimatedDurationMinutes) : null;
    if ("isActive" in body) data.isActive = !!body.isActive;

    const updated = await prisma.procedureProtocol.update({ where: { id }, data });

    await logAudit({
      userId: auth.user.id,
      action: "UPDATE",
      module: "PROCEDURE_PROTOCOL",
      entityType: "ProcedureProtocol",
      entityId: id,
      details: { fields: Object.keys(body), version: updated.version },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    logger.api("PUT", "/api/admin/procedure-protocols/[id]", error);
    return NextResponse.json({ success: false, error: "Failed to update" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth({ minRole: "ADMIN" });
    if (auth.response) return auth.response;
    const { id } = await params;

    const me = await prisma.user.findUnique({ where: { id: auth.user.id }, select: { tenantId: true } });
    if (!me) return NextResponse.json({ success: false, error: "User not found" }, { status: 404 });

    const existing = await prisma.procedureProtocol.findFirst({ where: { id, tenantId: me.tenantId } });
    if (!existing) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });

    // Soft delete — old Procedure rows with `protocolId = id` keep
    // their snapshot, the row stays referenceable, but new
    // Procedures can't pick this protocol from the picker.
    await prisma.procedureProtocol.update({
      where: { id },
      data: { isActive: false },
    });

    await logAudit({
      userId: auth.user.id,
      action: "ARCHIVE",
      module: "PROCEDURE_PROTOCOL",
      entityType: "ProcedureProtocol",
      entityId: id,
      details: {},
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.api("DELETE", "/api/admin/procedure-protocols/[id]", error);
    return NextResponse.json({ success: false, error: "Failed" }, { status: 500 });
  }
}
