/**
 * @system MediCore ERP - Notifications API
 * @route GET /api/notifications - Get user notifications
 * @route PUT /api/notifications - Mark notifications as read
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
    const userId = searchParams.get("userId");
    const unreadOnly = searchParams.get("unreadOnly");
    const type = searchParams.get("type");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {};

    if (userId) where.userId = userId;
    if (unreadOnly === "true") where.isRead = false;
    if (type) where.type = type;

    const notifications = await prisma.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });

    const unreadCount = await prisma.notification.count({
      where: { ...where, isRead: false },
    });

    return NextResponse.json({
      success: true,
      data: notifications,
      unreadCount,
    });
  } catch (error) {
    logger.api("GET", "/api/notifications", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch notifications" },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const auth = await requireAuth();
    if (auth.response) return auth.response;

    const body = await request.json();
    const { notificationIds, markAllRead, userId } = body;

    if (markAllRead && userId) {
      await prisma.notification.updateMany({
        where: { userId, isRead: false },
        data: { isRead: true },
      });

      const updated = await prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
      });

      return NextResponse.json({ success: true, data: updated });
    }

    if (notificationIds && Array.isArray(notificationIds)) {
      await prisma.notification.updateMany({
        where: { id: { in: notificationIds } },
        data: { isRead: true },
      });

      const updated = await prisma.notification.findMany({
        where: { id: { in: notificationIds } },
      });

      return NextResponse.json({ success: true, data: updated });
    }

    return NextResponse.json(
      { success: false, error: "Provide notificationIds or markAllRead with userId" },
      { status: 400 }
    );
  } catch (error) {
    logger.api("PUT", "/api/notifications", error);
    return NextResponse.json(
      { success: false, error: "Failed to update notifications" },
      { status: 500 }
    );
  }
}
