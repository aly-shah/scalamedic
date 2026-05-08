/**
 * @system MediCore ERP — Inspect a patient invite
 * @route GET /api/patient-invites/:token
 *
 * Public (no auth). Used by the redeem page to show "Welcome
 * <patient name>, set a password." and confirm the token is still
 * redeemable. Doesn't reveal sensitive patient detail beyond first
 * + last name.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashToken } from "@/lib/patient-invite";

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!token) return NextResponse.json({ success: false, error: "Missing token" }, { status: 400 });

  const invite = await prisma.patientInvite.findUnique({
    where: { tokenHash: hashToken(token) },
    include: {
      patient: { select: { firstName: true, lastName: true, userId: true } },
    },
  });
  if (!invite) {
    return NextResponse.json({ success: false, error: "Invalid invite" }, { status: 404 });
  }
  if (invite.status !== "PENDING" || invite.expiresAt < new Date()) {
    return NextResponse.json(
      { success: false, error: "Invite is no longer valid", status: invite.status },
      { status: 410 },
    );
  }
  if (invite.patient.userId) {
    return NextResponse.json(
      { success: false, error: "Patient already has an account" },
      { status: 409 },
    );
  }

  return NextResponse.json({
    success: true,
    data: {
      patient: { firstName: invite.patient.firstName, lastName: invite.patient.lastName },
      expiresAt: invite.expiresAt.toISOString(),
    },
  });
}
