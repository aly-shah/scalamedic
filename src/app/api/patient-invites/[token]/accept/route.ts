/**
 * @system MediCore ERP — Accept patient invite
 * @route POST /api/patient-invites/:token/accept
 *
 * Public (no auth). Body: { password, email? }. Atomically:
 *   1. Validates the invite is PENDING + not expired + patient has no
 *      existing user.
 *   2. Creates a new User row with role=PATIENT and the patient's
 *      branch + tenant inherited from the patient row.
 *   3. Links Patient.userId to the new user.
 *   4. Marks the invite ACCEPTED with the resulting userId.
 *
 * On success, returns just `{ success: true, data: { email } }`.
 * The patient is expected to log in normally on the next call —
 * we don't auto-issue a session here so the redeem flow stays
 * symmetric with the regular login flow (and goes through any
 * future MFA enrollment without extra branching).
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";
import { hashToken } from "@/lib/patient-invite";
import { logger } from "@/lib/logger";
import { logAudit } from "@/lib/audit";

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    if (!token) return NextResponse.json({ success: false, error: "Missing token" }, { status: 400 });

    const body = await request.json().catch(() => ({}));
    const password = typeof body.password === "string" ? body.password : "";
    if (password.length < 8) {
      return NextResponse.json(
        { success: false, error: "Password must be at least 8 characters" },
        { status: 400 },
      );
    }
    const overrideEmail = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";

    const invite = await prisma.patientInvite.findUnique({
      where: { tokenHash: hashToken(token) },
      include: {
        patient: {
          select: {
            id: true, firstName: true, lastName: true, email: true, phone: true,
            userId: true, branchId: true,
            // Patient doesn't have a tenantId column — it inherits
            // through the branch. Pull both at once.
            branch: { select: { tenantId: true } },
          },
        },
      },
    });
    if (!invite) return NextResponse.json({ success: false, error: "Invalid invite" }, { status: 404 });
    if (invite.status !== "PENDING") {
      return NextResponse.json({ success: false, error: "Invite already redeemed or revoked" }, { status: 410 });
    }
    if (invite.expiresAt < new Date()) {
      // Auto-promote to EXPIRED so subsequent calls return the right state.
      await prisma.patientInvite.update({ where: { id: invite.id }, data: { status: "EXPIRED" } });
      return NextResponse.json({ success: false, error: "Invite expired" }, { status: 410 });
    }
    if (invite.patient.userId) {
      return NextResponse.json({ success: false, error: "Patient already has an account" }, { status: 409 });
    }

    const email = overrideEmail || invite.patient.email?.toLowerCase().trim() || "";
    if (!email || !email.includes("@")) {
      return NextResponse.json(
        { success: false, error: "Email required — patient record has none on file" },
        { status: 400 },
      );
    }

    // v51: email uniqueness is per-tenant. The patient's tenant
    // (via branch) is the scope.
    const existingUser = await prisma.user.findUnique({
      where: { tenantId_email: { tenantId: invite.patient.branch.tenantId, email } },
    });
    if (existingUser) {
      return NextResponse.json(
        { success: false, error: "An account with this email already exists. Sign in instead." },
        { status: 409 },
      );
    }

    const passwordHash = await hashPassword(password);
    const fullName = `${invite.patient.firstName} ${invite.patient.lastName}`.trim();

    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email,
          passwordHash,
          name: fullName,
          phone: invite.patient.phone ?? null,
          role: "PATIENT",
          branchId: invite.patient.branchId,
          tenantId: invite.patient.branch.tenantId,
          isActive: true,
        },
      });
      await tx.patient.update({
        where: { id: invite.patient.id },
        data: { userId: user.id },
      });
      const updatedInvite = await tx.patientInvite.update({
        where: { id: invite.id },
        data: {
          status: "ACCEPTED",
          acceptedAt: new Date(),
          acceptedUserId: user.id,
        },
      });
      return { user, invite: updatedInvite };
    });

    await logAudit({
      userId: result.user.id,
      action: "ACCEPT_PATIENT_INVITE",
      module: "PATIENT",
      entityType: "PatientInvite",
      entityId: invite.id,
      details: { patientId: invite.patient.id, email },
    });

    return NextResponse.json({ success: true, data: { email } });
  } catch (error) {
    logger.api("POST", "/api/patient-invites/[token]/accept", error);
    return NextResponse.json(
      { success: false, error: "Failed to accept invite" },
      { status: 500 },
    );
  }
}
