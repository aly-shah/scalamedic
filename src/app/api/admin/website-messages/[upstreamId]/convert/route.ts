/**
 * @system MediCore ERP — Convert website message → CRM lead
 * @route POST /api/admin/website-messages/:upstreamId/convert
 *
 * Mirror of the website-bookings convert route. Promotes a contact-
 * form submission from drnakhodas.com/api/messages into the leads
 * pipeline so the call-center can follow up. Records the link in
 * WebsiteMessageOverride so the Messages tab swaps "Convert" for
 * "View lead" on a refresh.
 *
 * Auth: ADMIN+. Idempotent — a message with a non-null
 * convertedLeadId returns 409.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/require-auth";
import { logger } from "@/lib/logger";

const UPSTREAM = "https://drnakhodas.com/api/messages";

interface UpstreamMessage {
  id: number;
  full_name: string;
  email: string;
  phone: string;
  message: string;
  created_at: string;
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ upstreamId: string }> },
) {
  try {
    const auth = await requireAuth({ minRole: "ADMIN" });
    if (auth.response) return auth.response;

    const apiKey = process.env.WEBSITE_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { success: false, error: "WEBSITE_API_KEY not configured on this box" },
        { status: 500 },
      );
    }

    const { upstreamId: idStr } = await params;
    const upstreamId = parseInt(idStr, 10);
    if (!Number.isInteger(upstreamId) || upstreamId <= 0) {
      return NextResponse.json({ success: false, error: "Invalid upstreamId" }, { status: 400 });
    }

    const existingOverride = await prisma.websiteMessageOverride.findUnique({
      where: { upstreamId },
      select: { convertedLeadId: true, notes: true },
    });
    if (existingOverride?.convertedLeadId) {
      return NextResponse.json(
        { success: false, error: "Message already converted" },
        { status: 409 },
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
    const body = (await res.json()) as { success: boolean; data: UpstreamMessage[] };
    const message = body.data.find((m) => m.id === upstreamId);
    if (!message) {
      return NextResponse.json(
        { success: false, error: "Upstream message not found" },
        { status: 404 },
      );
    }

    const lead = await prisma.$transaction(async (tx) => {
      // Stash the contact-form body in the lead notes so the agent
      // sees what the prospect originally wrote without bouncing
      // back to /admin/updates.
      const submittedAt = new Date(message.created_at).toLocaleString("en-PK", { timeZone: "Asia/Karachi" });
      const trimmed = message.message.length > 1500
        ? message.message.slice(0, 1500) + "…"
        : message.message;

      const created = await tx.lead.create({
        data: {
          name: message.full_name || "Website message",
          phone: message.phone || "",
          email: message.email || null,
          source: "WEBSITE",
          status: "NEW",
          interest: null,
          notes: `Converted from website contact-form message submitted ${submittedAt}.\n\n— ${trimmed}`,
          assignedToId: auth.user.id,
          branchId: auth.user.branchId,
        },
      });

      await tx.websiteMessageOverride.upsert({
        where: { upstreamId },
        create: {
          upstreamId,
          convertedLeadId: created.id,
          notes: existingOverride?.notes ?? null,
          updatedById: auth.user.id,
        },
        update: {
          convertedLeadId: created.id,
          updatedById: auth.user.id,
        },
      });

      return created;
    });

    return NextResponse.json({ success: true, data: { leadId: lead.id } });
  } catch (error) {
    logger.api("POST", "/api/admin/website-messages/[upstreamId]/convert", error);
    return NextResponse.json(
      { success: false, error: "Failed to convert message" },
      { status: 500 },
    );
  }
}
