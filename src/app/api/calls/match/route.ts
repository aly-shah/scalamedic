/**
 * @system MediCore ERP — Caller Match API
 * @route GET /api/calls/match?phone=xxx — Match incoming number to patient/lead
 */
import { NextResponse } from "next/server";

import { requireAuth } from "@/lib/require-auth";
import { logger } from "@/lib/logger";
import { matchCaller } from "@/lib/call-match";

export async function GET(request: Request) {
  try {
    const auth = await requireAuth();
    if (auth.response) return auth.response;

    const { searchParams } = new URL(request.url);
    const phone = searchParams.get("phone");

    if (!phone) {
      return NextResponse.json({ success: false, error: "Phone number required" }, { status: 400 });
    }

    const data = await matchCaller(phone);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    logger.api("GET", "/api/calls/match", error);
    return NextResponse.json({ success: false, error: "Match failed" }, { status: 500 });
  }
}
