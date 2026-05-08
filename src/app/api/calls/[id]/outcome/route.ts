/**
 * @system MediCore ERP — Call Outcome API
 * @route POST /api/calls/:id/outcome — Update call outcome
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

import { requireAuth } from "@/lib/require-auth";
import { logger } from "@/lib/logger";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth();
    if (auth.response) return auth.response;

    const { id } = await params;
    const body = await request.json();

    const updated = await prisma.callLog.update({
      where: { id },
      data: { outcome: body.outcome },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    logger.api("POST", "/api/calls/[id]/outcome", error);
    return NextResponse.json({ success: false, error: "Failed" }, { status: 500 });
  }
}
