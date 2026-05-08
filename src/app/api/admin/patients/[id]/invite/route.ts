/**
 * @system MediCore ERP — Issue patient invite
 * @route POST /api/admin/patients/:id/invite
 *
 * Generates a new invite token for the given patient. The token
 * plaintext is returned to the admin in the response and is NEVER
 * persisted (only its SHA-256 hash is stored). The admin then
 * dispatches the invite link to the patient via SMS / email /
 * WhatsApp out-of-band; the patient redeems through
 * /api/patient-invites/[token]/accept.
 *
 * Auth: ADMIN+. Patients who already have a User row (i.e. already
 * accepted a prior invite) are rejected with 409 — admin can revoke
 * the existing one explicitly first.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/require-auth";
import { logger } from "@/lib/logger";
import { logAudit } from "@/lib/audit";
import { issueInvite, INVITE_TTL_DAYS } from "@/lib/patient-invite";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth({ minRole: "ADMIN" });
    if (auth.response) return auth.response;
    const { id: patientId } = await params;

    const body = await request.json().catch(() => ({}));
    const channel = ["sms", "email", "whatsapp"].includes(body.channel) ? body.channel : null;

    const patient = await prisma.patient.findUnique({
      where: { id: patientId },
      select: { id: true, userId: true, firstName: true, lastName: true, isActive: true },
    });
    if (!patient) {
      return NextResponse.json({ success: false, error: "Patient not found" }, { status: 404 });
    }
    if (!patient.isActive) {
      return NextResponse.json({ success: false, error: "Patient is inactive" }, { status: 400 });
    }
    if (patient.userId) {
      return NextResponse.json(
        { success: false, error: "Patient already has a self-service account" },
        { status: 409 },
      );
    }

    // Revoke any prior PENDING invite for this patient — only one
    // active invite at a time keeps the audit trail clean.
    await prisma.patientInvite.updateMany({
      where: { patientId, status: "PENDING" },
      data: { status: "REVOKED" },
    });

    const issued = issueInvite();
    const invite = await prisma.patientInvite.create({
      data: {
        patientId,
        tokenHash: issued.tokenHash,
        expiresAt: issued.expiresAt,
        channel,
        createdById: auth.user.id,
      },
    });

    await logAudit({
      userId: auth.user.id,
      action: "ISSUE_PATIENT_INVITE",
      module: "PATIENT",
      entityType: "PatientInvite",
      entityId: invite.id,
      details: { patientId, channel, expiresAt: issued.expiresAt.toISOString() },
    });

    return NextResponse.json({
      success: true,
      data: {
        // Plaintext returned ONCE — admin must hand it to the
        // patient now. Lost tokens require re-issuing a new invite.
        token: issued.token,
        expiresAt: issued.expiresAt.toISOString(),
        ttlDays: INVITE_TTL_DAYS,
        inviteId: invite.id,
        patientName: `${patient.firstName} ${patient.lastName}`,
      },
    });
  } catch (error) {
    logger.api("POST", "/api/admin/patients/[id]/invite", error);
    return NextResponse.json(
      { success: false, error: "Failed to issue invite" },
      { status: 500 },
    );
  }
}
