/**
 * @system MediCore ERP — MFA status check
 * @route GET /api/auth/mfa/status
 *
 * Returns the calling user's MFA enablement state. Cheap query;
 * the settings page hits this on mount and after enroll/disable
 * actions to refresh the panel.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/require-auth";

export async function GET() {
  const auth = await requireAuth();
  if (auth.response) return auth.response;

  const user = await prisma.user.findUnique({
    where: { id: auth.user.id },
    select: { mfaEnabled: true, mfaEnrolledAt: true },
  });

  return NextResponse.json({
    success: true,
    data: {
      mfaEnabled: user?.mfaEnabled ?? false,
      mfaEnrolledAt: user?.mfaEnrolledAt?.toISOString() ?? null,
    },
  });
}
