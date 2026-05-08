/**
 * @system MediCore ERP — Convert website booking → CRM lead
 * @route POST /api/admin/website-bookings/:upstreamId/convert
 *
 * Promotes a row from drnakhodas.com/api/appointments into the
 * MediCore Leads pipeline so it shows on the call-center kanban
 * (status = NEW). Side effects:
 *   - Creates a Lead row owned by the current user, in their branch
 *   - Marks the local override CLOSED with a note "Converted to
 *     lead <id>" so the Bookings tab disables the convert button
 *   - Both writes happen in a single transaction
 *
 * Auth: ADMIN+. Idempotent: a booking already CLOSED returns 409 so
 * we don't double-convert if the agent double-clicks.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/require-auth";
import { logger } from "@/lib/logger";

const UPSTREAM = "https://drnakhodas.com/api/appointments";

interface UpstreamBooking {
  id: number;
  full_name: string;
  email: string;
  phone: string;
  service: string | null;
  status: string;
  created_at: string;
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ upstreamId: string }> },
) {
  try {
    const auth = await requireAuth({ minRole: "ADMIN" });
    if (auth.response) return auth.response;

    const { upstreamId: idStr } = await params;
    const upstreamId = parseInt(idStr, 10);
    if (!Number.isInteger(upstreamId) || upstreamId <= 0) {
      return NextResponse.json({ success: false, error: "Invalid upstreamId" }, { status: 400 });
    }

    // Refuse to double-convert. Override row may not exist yet (first
    // touch); if it does and is CLOSED, we assume that means converted.
    const existingOverride = await prisma.websiteBookingOverride.findUnique({
      where: { upstreamId },
      select: { status: true, notes: true },
    });
    if (existingOverride && existingOverride.status === "CLOSED") {
      return NextResponse.json(
        { success: false, error: "Booking already converted" },
        { status: 409 },
      );
    }

    // Fetch the row from upstream. We could pass it in from the
    // client to skip a round-trip, but pulling it server-side is
    // safer (no spoof risk) and the upstream is fast.
    const apiKey = process.env.WEBSITE_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { success: false, error: "WEBSITE_API_KEY not configured on this box" },
        { status: 500 },
      );
    }
    const res = await fetch(UPSTREAM, {
      cache: "no-store",
      headers: { authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) {
      return NextResponse.json(
        { success: false, error: `Upstream returned ${res.status}` },
        { status: 502 },
      );
    }
    const body = (await res.json()) as { success: boolean; data: UpstreamBooking[] };
    const booking = body.data.find((b) => b.id === upstreamId);
    if (!booking) {
      return NextResponse.json(
        { success: false, error: "Upstream booking not found" },
        { status: 404 },
      );
    }

    // Lead needs a branchId; use the agent's home branch as a sane
    // default. Agents can re-assign in the kanban detail panel later.
    const lead = await prisma.$transaction(async (tx) => {
      const created = await tx.lead.create({
        data: {
          name: booking.full_name || "Website lead",
          phone: booking.phone || "",
          email: booking.email || null,
          source: "WEBSITE",
          status: "NEW",
          interest: booking.service || null,
          notes: `Converted from website booking submitted ${new Date(booking.created_at).toLocaleString("en-PK", { timeZone: "Asia/Karachi" })}.`,
          assignedToId: auth.user.id,
          branchId: auth.user.branchId,
        },
      });

      // Link via the new convertedLeadId FK (v30). The legacy
      // "Converted to lead <uuid>" trail in notes is dropped — the
      // FK is the source of truth and survives lead deletion via
      // SET NULL.
      await tx.websiteBookingOverride.upsert({
        where: { upstreamId },
        create: {
          upstreamId,
          status: "CLOSED",
          convertedLeadId: created.id,
          notes: existingOverride?.notes ?? null,
          updatedById: auth.user.id,
        },
        update: {
          status: "CLOSED",
          convertedLeadId: created.id,
          updatedById: auth.user.id,
        },
      });

      return created;
    });

    return NextResponse.json({ success: true, data: { leadId: lead.id } });
  } catch (error) {
    logger.api("POST", "/api/admin/website-bookings/[upstreamId]/convert", error);
    return NextResponse.json(
      { success: false, error: "Failed to convert booking" },
      { status: 500 },
    );
  }
}
