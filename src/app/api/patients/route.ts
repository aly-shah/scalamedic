/**
 * @system MediCore ERP - Patient List & Creation API
 * @route GET /api/patients - List patients with search/filter
 * @route POST /api/patients - Create a new patient
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { logAudit } from "@/lib/audit";

import { requireAuth } from "@/lib/require-auth";
import { logger } from "@/lib/logger";
import { tenantIdForBranch } from "@/lib/tenant";
export async function GET(request: Request) {
  try {
    const auth = await requireAuth();
    if (auth.response) return auth.response;

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search")?.toLowerCase();
    const branchId = searchParams.get("branchId");
    const doctorId = searchParams.get("doctorId");
    const status = searchParams.get("status"); // "active" | "inactive"
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const skip = (page - 1) * limit;

    const where: Prisma.PatientWhereInput = {};

    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: "insensitive" } },
        { lastName: { contains: search, mode: "insensitive" } },
        { phone: { contains: search } },
        { patientCode: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
      ];
    }

    if (branchId) {
      where.branchId = branchId;
    }

    if (doctorId) {
      where.assignedDoctorId = doctorId;
    }

    if (status === "active") {
      where.isActive = true;
    } else if (status === "inactive") {
      where.isActive = false;
    }

    const [data, total] = await Promise.all([
      prisma.patient.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          assignedDoctor: {
            select: { id: true, name: true, speciality: true },
          },
          branch: {
            select: { id: true, name: true, code: true },
          },
        },
      }),
      prisma.patient.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    logger.api("GET", "/api/patients", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch patients" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAuth();
    if (auth.response) return auth.response;

    const body = await request.json();

    // patientCode generation is deferred until after branchId is
    // resolved — the sequence is per-tenant (v53), so we need the
    // tenantId before scanning for the max.

    // Validate required fields. dateOfBirth is intentionally optional —
    // walk-ins / urgent registrations often arrive without confirmed DOB
    // and the receptionist fills it in later via Edit.
    if (!body.firstName || !body.lastName || !body.phone || !body.gender) {
      return NextResponse.json(
        { success: false, error: "Missing required fields: firstName, lastName, phone, gender" },
        { status: 400 }
      );
    }

    // Ensure branchId — fall back to first active branch if not provided
    let branchId = body.branchId;
    if (!branchId) {
      const defaultBranch = await prisma.branch.findFirst({ where: { isActive: true }, select: { id: true } });
      if (!defaultBranch) {
        return NextResponse.json(
          { success: false, error: "No active branch found. Please create a branch first." },
          { status: 400 }
        );
      }
      branchId = defaultBranch.id;
    }

    const tenantId = await tenantIdForBranch(branchId);
    const lastPatient = await prisma.patient.findFirst({
      where: { tenantId },
      orderBy: { patientCode: "desc" },
      select: { patientCode: true },
    });
    const nextNum = lastPatient
      ? parseInt(lastPatient.patientCode.replace("PT-", "")) + 1
      : 1;
    const patientCode = `PT-${String(nextNum).padStart(4, "0")}`;

    const patient = await prisma.patient.create({
      data: {
        patientCode,
        firstName: body.firstName,
        lastName: body.lastName,
        middleName: body.middleName || null,
        email: body.email || null,
        phone: body.phone,
        dateOfBirth: body.dateOfBirth ? new Date(body.dateOfBirth) : null,
        gender: body.gender,
        nationality: body.nationality || null,
        address: body.address || null,
        city: body.city || null,
        emergencyContact: body.emergencyContact || null,
        emergencyPhone: body.emergencyPhone || null,
        bloodType: body.bloodType || null,
        skinType: body.skinType || null,
        branchId,
        tenantId,
        assignedDoctorId: body.assignedDoctorId,
        profileImage: body.profileImage,
        notes: body.notes,
        source: body.source,
        consentGiven: body.consentGiven ?? false,
        isVip: body.isVip ?? false,
      },
      include: {
        assignedDoctor: {
          select: { id: true, name: true, speciality: true },
        },
        branch: {
          select: { id: true, name: true, code: true },
        },
      },
    });

    await logAudit({
      userId: body.createdById || "system",
      action: "CREATE",
      module: "PATIENT",
      entityType: "Patient",
      entityId: patient.id,
      details: { patientCode: patient.patientCode },
    });

    return NextResponse.json(
      { success: true, data: patient },
      { status: 201 }
    );
  } catch (error) {
    logger.api("POST", "/api/patients", error);
    return NextResponse.json(
      { success: false, error: "Failed to create patient" },
      { status: 500 }
    );
  }
}
