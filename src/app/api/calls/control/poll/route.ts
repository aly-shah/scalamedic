/**
 * @system MediCore ERP — Phone-control poll endpoint
 * @route GET /api/calls/control/poll?agentId=… — Phone drains its command queue
 *
 * Authenticated via X-Service-Token (the same token the companion app
 * uses for /api/calls/incoming). Phone polls every few seconds while
 * the foreground service is alive; each call returns and clears any
 * queued Answer/Hangup/Dial commands. Short-poll (returns immediately)
 * — long-polling adds latency wins that don't matter at this scale and
 * makes the Next.js runtime less happy.
 */
import { NextResponse } from "next/server";
import { drainControl } from "@/lib/call-control-store";
import { logger } from "@/lib/logger";

export async function GET(request: Request) {
  try {
    const token = request.headers.get("x-service-token");
    const expected = process.env.DIALER_SERVICE_TOKEN;
    if (!expected || token !== expected) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const agentId = searchParams.get("agentId");
    if (!agentId) {
      return NextResponse.json({ success: false, error: "agentId required" }, { status: 400 });
    }

    const commands = drainControl(agentId);
    return NextResponse.json({ success: true, data: commands });
  } catch (error) {
    logger.api("GET", "/api/calls/control/poll", error);
    return NextResponse.json({ success: false, error: "Failed" }, { status: 500 });
  }
}
