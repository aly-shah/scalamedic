/**
 * @system MediCore ERP — Pending consultation notes
 * @route GET /api/consultation-notes/pending
 *
 * Returns consultation notes that haven't been signed yet, scoped to
 * the calling doctor by default (admins can pass ?doctorId=all to
 * see every doctor's). Drives the "Pending sign-off" card on the
 * doctor-app home screen — clinical safety win since unsigned notes
 * tend to get forgotten between patients.
 *
 * Filters:
 *   - doctorId: explicit doctor (admin-only override; doctors are
 *     always pinned to their own id regardless of this param)
 *   - days: how far back to look. Defaults to 14 days; longer than a
 *     month and the list becomes noise rather than actionable.
 *   - limit: hard cap, default 25.
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
    const role = auth.user.role;
    const isAdmin = role === "ADMIN" || role === "SUPER_ADMIN";

    // Doctors are always scoped to themselves; admins can pass an
    // explicit doctorId or "all" to see across the clinic.
    const requestedDoctor = searchParams.get("doctorId");
    const doctorScope: string | null =
      role === "DOCTOR" ? auth.user.id
      : isAdmin && requestedDoctor && requestedDoctor !== "all" ? requestedDoctor
      : isAdmin ? null
      : auth.user.id;

    const days = Math.max(1, Math.min(60, parseInt(searchParams.get("days") || "14", 10) || 14));
    const limit = Math.max(1, Math.min(100, parseInt(searchParams.get("limit") || "25", 10) || 25));

    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const notes = await prisma.consultationNote.findMany({
      where: {
        isSigned: false,
        createdAt: { gte: cutoff },
        ...(doctorScope ? { doctorId: doctorScope } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        patient: { select: { id: true, firstName: true, lastName: true, patientCode: true } },
        doctor: { select: { id: true, name: true } },
        appointment: { select: { id: true, appointmentCode: true, date: true } },
      },
    });

    return NextResponse.json({ success: true, data: notes, count: notes.length });
  } catch (error) {
    logger.api("GET", "/api/consultation-notes/pending", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch pending notes" },
      { status: 500 },
    );
  }
}
