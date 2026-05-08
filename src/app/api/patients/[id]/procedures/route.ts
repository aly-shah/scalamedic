/**
 * @system MediCore ERP - Patient Procedures API
 * @route GET  /api/patients/:id/procedures - List procedures for a patient
 * @route POST /api/patients/:id/procedures - Record a new procedure
 *
 * The POST path accepts an optional `protocolId`. When provided, the
 * route fetches the active protocol (same tenant as the calling user)
 * and freezes the relevant fields onto `protocolSnapshot`. Future
 * edits to the protocol template never rewrite the historical row.
 *
 * E-consent: when `consentSigned=true`, the route records both
 * `consentSignedAt = now()` and `consentSignedById = auth.user.id`
 * (whoever's signed in is the witnessing staff member). The schema-
 * level CHECKs reject the row if either is missing.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/require-auth";
import { logger } from "@/lib/logger";
import { logAudit } from "@/lib/audit";
import { Prisma } from "@prisma/client";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if (auth.response) return auth.response;

    const { id } = await params;

    const procedures = await prisma.procedure.findMany({
      where: { patientId: id },
      orderBy: { createdAt: "desc" },
      include: {
        treatment: true,
        doctor: {
          select: { id: true, name: true, speciality: true },
        },
        appointment: {
          select: { id: true, appointmentCode: true, date: true },
        },
        protocol: {
          select: { id: true, name: true, version: true },
        },
        consentSignedBy: {
          select: { id: true, name: true },
        },
      },
    });

    return NextResponse.json({ success: true, data: procedures });
  } catch (error) {
    logger.api("GET", "/api/patients/[id]/procedures", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch procedures" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if (auth.response) return auth.response;

    const { id: patientId } = await params;
    const body = await request.json().catch(() => ({}));

    const appointmentId = typeof body.appointmentId === "string" ? body.appointmentId : "";
    const treatmentId = typeof body.treatmentId === "string" ? body.treatmentId : "";
    if (!appointmentId || !treatmentId) {
      return NextResponse.json(
        { success: false, error: "appointmentId and treatmentId are required" },
        { status: 400 },
      );
    }
    const doctorId = typeof body.doctorId === "string" && body.doctorId ? body.doctorId : auth.user.id;

    // ─── Protocol freeze ───────────────────────────────
    let protocolId: string | null = null;
    let protocolSnapshot: Prisma.InputJsonValue | undefined = undefined;
    if (typeof body.protocolId === "string" && body.protocolId) {
      // Verify the protocol exists, is active, and lives in the
      // calling user's tenant. The v41 trigger will block any
      // mismatch even if we forgot to check here, but failing
      // early gives a clearer error to the doctor.
      const me = await prisma.user.findUnique({
        where: { id: auth.user.id },
        select: { tenantId: true },
      });
      const protocol = await prisma.procedureProtocol.findFirst({
        where: {
          id: body.protocolId,
          isActive: true,
          tenantId: me?.tenantId,
        },
      });
      if (!protocol) {
        return NextResponse.json(
          { success: false, error: "Protocol not found or inactive in your tenant" },
          { status: 404 },
        );
      }
      protocolId = protocol.id;
      protocolSnapshot = {
        // Frozen at execution time. Schema CHECKs require this be a
        // JSON object (procedures_protocolSnapshot_is_object).
        protocolId: protocol.id,
        version: protocol.version,
        name: protocol.name,
        description: protocol.description,
        consentTemplate: protocol.consentTemplate,
        requiredBeforePhotos: protocol.requiredBeforePhotos,
        requiredAfterPhotos: protocol.requiredAfterPhotos,
        machineSettings: protocol.machineSettings,
        aftercareInstructions: protocol.aftercareInstructions,
        suggestedFollowUpDays: protocol.suggestedFollowUpDays,
        rxKitName: protocol.rxKitName,
        estimatedDurationMinutes: protocol.estimatedDurationMinutes,
        snapshotAt: new Date().toISOString(),
      } as unknown as Prisma.InputJsonValue;
    }

    const consentSigned = !!body.consentSigned;
    const now = new Date();

    // Sanitize array fields (UI may pass through raw input).
    const cleanArr = (raw: unknown): string[] =>
      Array.isArray(raw)
        ? raw.map((s) => (typeof s === "string" ? s.trim() : "")).filter((s) => s.length > 0)
        : [];

    const procedure = await prisma.procedure.create({
      data: {
        patientId,
        appointmentId,
        treatmentId,
        doctorId,
        areasTreated: cleanArr(body.areasTreated),
        settings: body.settings && typeof body.settings === "object" && !Array.isArray(body.settings)
          ? body.settings as Prisma.InputJsonValue
          : Prisma.JsonNull,
        notes: typeof body.notes === "string" && body.notes.trim() ? body.notes.trim() : null,
        outcome: typeof body.outcome === "string" && body.outcome.trim() ? body.outcome.trim() : null,
        complications: typeof body.complications === "string" && body.complications.trim() ? body.complications.trim() : null,
        beforeImages: cleanArr(body.beforeImages),
        afterImages: cleanArr(body.afterImages),
        consentSigned,
        consentSignedAt: consentSigned ? now : null,
        consentSignedById: consentSigned ? auth.user.id : null,
        protocolId,
        protocolSnapshot,
        performedAt: body.performedAt ? new Date(body.performedAt) : now,
      },
      include: {
        treatment: { select: { id: true, name: true } },
        doctor: { select: { id: true, name: true } },
        protocol: { select: { id: true, name: true, version: true } },
      },
    });

    await logAudit({
      userId: auth.user.id,
      action: "CREATE",
      module: "PROCEDURE",
      entityType: "Procedure",
      entityId: procedure.id,
      details: {
        patientId,
        protocolId: protocolId ?? null,
        consentSigned,
      },
    });

    return NextResponse.json({ success: true, data: procedure }, { status: 201 });
  } catch (error) {
    logger.api("POST", "/api/patients/[id]/procedures", error);
    return NextResponse.json(
      { success: false, error: "Failed to record procedure" },
      { status: 500 },
    );
  }
}
