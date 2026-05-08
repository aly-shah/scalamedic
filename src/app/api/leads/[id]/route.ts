/**
 * @system MediCore ERP - Single Lead API
 * @route GET /api/leads/:id - Get lead details
 * @route PUT /api/leads/:id - Update lead
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

import { requireAuth } from "@/lib/require-auth";
import { logger } from "@/lib/logger";
import { tenantIdForBranch } from "@/lib/tenant";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if (auth.response) return auth.response;

    const { id } = await params;
    const lead = await prisma.lead.findUnique({
      where: { id },
      include: {
        assignedTo: { select: { id: true, name: true } },
        branch: { select: { id: true, name: true, code: true } },
        convertedPatient: { select: { id: true, firstName: true, lastName: true, patientCode: true } },
        callLogs: {
          include: { user: { select: { id: true, name: true } } },
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!lead) {
      return NextResponse.json(
        { success: false, error: "Lead not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: lead });
  } catch (error) {
    logger.api("GET", "/api/leads/[id]", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch lead" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if (auth.response) return auth.response;

    const { id } = await params;
    const body = await request.json();

    const existing = await prisma.lead.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Lead not found" },
        { status: 404 }
      );
    }

    // If status is moving to BOOKED and we don't already have a
    // linked patient, auto-promote the lead into a Patient row in the
    // same transaction. Saves the agent from filling the create-
    // patient form by hand for someone who's already a known contact.
    const transitioningToBooked =
      body.status === "BOOKED" &&
      existing.status !== "BOOKED" &&
      !existing.convertedPatientId;

    const lead = await prisma.$transaction(async (tx) => {
      let convertedPatientId: string | null | undefined =
        body.convertedPatientId !== undefined
          ? body.convertedPatientId || null
          : undefined;

      if (transitioningToBooked && convertedPatientId === undefined) {
        // Split "First Last" → first / last names. Patients table
        // requires a non-null lastName; fall back to "—" so the row
        // is valid and the agent can fill it in later. patientCode
        // is auto-generated the same way /api/patients does it.
        const fullName = (body.name || existing.name || "").trim();
        const parts = fullName.split(/\s+/);
        const firstName = parts[0] || "Patient";
        const lastName = parts.slice(1).join(" ") || "—";

        // v53: patientCode is per-tenant.
        const leadTenantId = await tenantIdForBranch(existing.branchId);
        const lastPatient = await tx.patient.findFirst({
          where: { tenantId: leadTenantId },
          orderBy: { patientCode: "desc" },
          select: { patientCode: true },
        });
        const nextNum = lastPatient
          ? parseInt(lastPatient.patientCode.replace("PT-", ""), 10) + 1
          : 1;
        const patientCode = `PT-${String(nextNum).padStart(4, "0")}`;

        const newPatient = await tx.patient.create({
          data: {
            patientCode,
            firstName,
            lastName,
            email: existing.email,
            phone: existing.phone,
            // Required field; agent edits the patient later when
            // they take a real intake. OTHER avoids guessing.
            gender: "OTHER",
            branchId: existing.branchId,
            tenantId: leadTenantId,
            assignedDoctorId: null,
            source: existing.source,
            notes: existing.notes
              ? `Converted from lead. Lead notes: ${existing.notes}`
              : "Converted from lead",
            consentGiven: false,
          },
          select: { id: true },
        });
        convertedPatientId = newPatient.id;
      }

      return tx.lead.update({
        where: { id },
        data: {
          ...(body.name && { name: body.name }),
          ...(body.phone && { phone: body.phone }),
          ...(body.email !== undefined && { email: body.email || null }),
          ...(body.source && { source: body.source }),
          ...(body.status && { status: body.status }),
          ...(body.interest !== undefined && { interest: body.interest }),
          ...(body.assignedToId && { assignedToId: body.assignedToId }),
          ...(body.notes !== undefined && { notes: body.notes }),
          ...(convertedPatientId !== undefined && { convertedPatientId }),
          ...(body.callbackDate !== undefined && { callbackDate: body.callbackDate ? new Date(body.callbackDate) : null }),
        },
        include: {
          assignedTo: { select: { id: true, name: true } },
          branch: { select: { id: true, name: true } },
          convertedPatient: { select: { id: true, patientCode: true, firstName: true, lastName: true } },
        },
      });
    });

    return NextResponse.json({ success: true, data: lead });
  } catch (error) {
    logger.api("PUT", "/api/leads/[id]", error);
    return NextResponse.json(
      { success: false, error: "Failed to update lead" },
      { status: 500 }
    );
  }
}
