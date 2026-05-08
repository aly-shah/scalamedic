/**
 * @system MediCore ERP — Mobile Agent App Session API
 * @route POST /api/app/session — Register/heartbeat device session
 * @route GET /api/app/session — Get session status
 */
import { NextResponse } from "next/server";

import { logger } from "@/lib/logger";
// In-memory device sessions (use Redis in production)
const deviceSessions: Map<string, {
  deviceId: string;
  agentId: string;
  agentName: string;
  branchId: string;
  status: "connected" | "disconnected";
  lastHeartbeat: number;
  appVersion: string;
  platform: string;
}> = new Map();

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { deviceId, agentId, agentName, branchId, action, appVersion, platform } = body;

    if (!deviceId || !agentId) {
      return NextResponse.json({ success: false, error: "Missing: deviceId, agentId" }, { status: 400 });
    }

    if (action === "register" || action === "heartbeat") {
      deviceSessions.set(agentId, {
        deviceId, agentId, agentName: agentName || "", branchId: branchId || "",
        status: "connected", lastHeartbeat: Date.now(),
        appVersion: appVersion || "1.0", platform: platform || "android",
      });
      return NextResponse.json({ success: true, data: { status: "connected", serverTime: Date.now() } });
    }

    if (action === "disconnect") {
      const session = deviceSessions.get(agentId);
      if (session) session.status = "disconnected";
      return NextResponse.json({ success: true, data: { status: "disconnected" } });
    }

    return NextResponse.json({ success: false, error: "Invalid action" }, { status: 400 });
  } catch (error) {
    logger.api("POST", "/api/app/session", error);
    return NextResponse.json({ success: false, error: "Failed" }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const agentId = searchParams.get("agentId");

    if (agentId) {
      const session = deviceSessions.get(agentId);
      if (!session) return NextResponse.json({ success: true, data: null });
      // Mark stale if no heartbeat in 60s
      if (Date.now() - session.lastHeartbeat > 60000) session.status = "disconnected";
      return NextResponse.json({ success: true, data: session });
    }

    // Return all active sessions (for admin/supervisor)
    const sessions = Array.from(deviceSessions.values())
      .map((s) => ({ ...s, status: Date.now() - s.lastHeartbeat > 60000 ? "disconnected" : s.status }));
    return NextResponse.json({ success: true, data: sessions });
  } catch (error) {
    logger.api("GET", "/api/app/session", error);
    return NextResponse.json({ success: false, error: "Failed" }, { status: 500 });
  }
}
