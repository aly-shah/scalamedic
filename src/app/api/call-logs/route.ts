/**
 * @system MediCore ERP - Call Logs API
 * @route GET /api/call-logs - List call logs
 * @route POST /api/call-logs - Create call log
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
    const leadId = searchParams.get("leadId");
    const patientId = searchParams.get("patientId");
    const userId = searchParams.get("userId");
    const type = searchParams.get("type");
    const outcome = searchParams.get("outcome");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {};

    if (leadId) where.leadId = leadId;
    if (patientId) where.patientId = patientId;
    if (userId) where.userId = userId;
    if (type) where.type = type;
    if (outcome) where.outcome = outcome;

    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 200);
    const offset = parseInt(searchParams.get("offset") || "0");

    const [callLogs, total] = await Promise.all([
      prisma.callLog.findMany({
        where,
        include: {
          lead: { select: { id: true, name: true, phone: true } },
          patient: { select: { id: true, firstName: true, lastName: true, patientCode: true } },
          user: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      prisma.callLog.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      data: callLogs,
      pagination: { total, limit, offset, hasMore: offset + limit < total },
    });
  } catch (error) {
    logger.api("GET", "/api/call-logs", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch call logs" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAuth();
    if (auth.response) return auth.response;

    const body = await request.json();

    const callLog = await prisma.callLog.create({
      data: {
        leadId: body.leadId || null,
        patientId: body.patientId || null,
        userId: body.userId,
        type: body.type,
        duration: body.duration || null,
        notes: body.notes || null,
        outcome: body.outcome,
      },
      include: {
        lead: { select: { id: true, name: true } },
        patient: { select: { id: true, firstName: true, lastName: true } },
        user: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({ success: true, data: callLog }, { status: 201 });
  } catch (error) {
    logger.api("POST", "/api/call-logs", error);
    return NextResponse.json(
      { success: false, error: "Failed to create call log" },
      { status: 500 }
    );
  }
}
