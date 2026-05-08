/**
 * @system MediCore ERP - System Settings API
 * @route GET /api/settings — list settings (filterable by ?group=)
 * @route PUT /api/settings — upsert a setting by key
 *
 * SystemSetting is a flat key-value store grouped by module area
 * ("billing", "appointments", "general", …). Values are stored as text; the
 * type column is a hint for UI rendering.
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
    const group = searchParams.get("group");

    const settings = await prisma.systemSetting.findMany({
      where: group ? { group } : undefined,
      orderBy: [{ group: "asc" }, { key: "asc" }],
    });

    return NextResponse.json({ success: true, data: settings });
  } catch (error) {
    logger.api("GET", "/api/settings", error);
    return NextResponse.json({ success: false, error: "Failed to fetch settings" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const auth = await requireAuth({ roles: ["SUPER_ADMIN", "ADMIN"] });
    if (auth.response) return auth.response;

    const body = await request.json();
    if (!body.key || typeof body.key !== "string") {
      return NextResponse.json({ success: false, error: "key is required" }, { status: 400 });
    }

    const setting = await prisma.systemSetting.upsert({
      where: { key: body.key },
      create: {
        key: body.key,
        value: String(body.value ?? ""),
        group: body.group || "general",
        label: body.label || body.key,
        type: body.type || "string",
      },
      update: {
        value: String(body.value ?? ""),
        ...(body.label && { label: body.label }),
        ...(body.group && { group: body.group }),
        ...(body.type && { type: body.type }),
      },
    });

    return NextResponse.json({ success: true, data: setting });
  } catch (error) {
    logger.api("PUT", "/api/settings", error);
    return NextResponse.json({ success: false, error: "Failed to update setting" }, { status: 500 });
  }
}
