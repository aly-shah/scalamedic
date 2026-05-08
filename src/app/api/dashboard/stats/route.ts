/**
 * @system MediCore ERP - Dashboard Stats API
 * @route GET /api/dashboard/stats - Get dashboard statistics by role
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/require-auth";

import { getClinicToday } from "@/lib/utils";
import { logger } from "@/lib/logger";
export async function GET(request: Request) {
  try {
    const auth = await requireAuth();
    if (auth.response) return auth.response;

    const { searchParams } = new URL(request.url);
    const role = auth.user.role;
    const date = searchParams.get("date") || getClinicToday();
    const doctorId = auth.user.role === "DOCTOR" ? auth.user.id : searchParams.get("doctorId");

    const targetDate = new Date(date);

    // Base stats: today's appointments
    const todayAppointments = await prisma.appointment.count({ where: { date: targetDate } });
    const completedToday = await prisma.appointment.count({ where: { date: targetDate, status: "COMPLETED" } });
    const inProgress = await prisma.appointment.count({ where: { date: targetDate, status: "IN_PROGRESS" } });
    const waiting = await prisma.appointment.count({ where: { date: targetDate, status: { in: ["WAITING", "CHECKED_IN"] } } });
    const noShows = await prisma.appointment.count({ where: { date: targetDate, status: "NO_SHOW" } });

    // Recent audit log entries as activities
    const recentActivities = await prisma.auditLog.findMany({
      take: 5,
      orderBy: { createdAt: "desc" },
      include: { user: { select: { id: true, name: true } } },
    });

    const baseStats = {
      todayAppointments,
      completedToday,
      inProgress,
      waiting,
      noShows,
      recentActivities,
    };

    let roleStats = {};

    switch (role.toUpperCase()) {
      case "ADMIN":
      case "SUPER_ADMIN": {
        const [
          totalPatients,
          paidInvoicesAgg,
          pendingInvoicesAgg,
          overdueInvoices,
          newLeads,
          availableRooms,
          occupiedRooms,
          pendingFollowUps,
        ] = await Promise.all([
          prisma.patient.count({ where: { isActive: true } }),
          prisma.invoice.aggregate({ where: { status: "PAID" }, _sum: { total: true } }),
          prisma.invoice.aggregate({ where: { status: { in: ["PENDING", "PARTIAL", "OVERDUE"] } }, _sum: { total: true } }),
          prisma.invoice.count({ where: { status: "OVERDUE" } }),
          prisma.lead.count({ where: { status: "NEW" } }),
          prisma.room.count({ where: { isAvailable: true } }),
          prisma.room.count({ where: { status: "OCCUPIED" } }),
          prisma.followUp.count({ where: { status: "PENDING" } }),
        ]);

        roleStats = {
          totalPatients,
          totalRevenue: Number(paidInvoicesAgg._sum.total || 0),
          pendingPayments: Number(pendingInvoicesAgg._sum.total || 0),
          overdueInvoices,
          newLeads,
          availableRooms,
          occupiedRooms,
          pendingFollowUps,
        };
        break;
      }

      case "DOCTOR": {
        const doctorWhere = doctorId ? { doctorId } : {};
        const [myAppointments, pendingNotes, pendingLabResults, myFollowUps] = await Promise.all([
          prisma.appointment.count({ where: { ...doctorWhere, date: targetDate } }),
          prisma.appointment.count({ where: { ...doctorWhere, date: targetDate, status: "COMPLETED" } }),
          prisma.labTest.count({ where: { ...(doctorId ? { doctorId } : {}), status: { not: "COMPLETED" } } }),
          prisma.followUp.count({ where: { ...(doctorId ? { doctorId } : {}), status: "PENDING" } }),
        ]);

        roleStats = { myAppointments, pendingNotes, pendingLabResults, myFollowUps };
        break;
      }

      case "RECEPTIONIST": {
        const [scheduledToday, checkedIn, totalPatients, availableRooms] = await Promise.all([
          prisma.appointment.count({ where: { date: targetDate, status: { in: ["SCHEDULED", "CONFIRMED"] } } }),
          prisma.appointment.count({ where: { date: targetDate, status: "CHECKED_IN" } }),
          prisma.patient.count({ where: { isActive: true } }),
          prisma.room.count({ where: { isAvailable: true } }),
        ]);

        roleStats = { scheduledToday, checkedIn, totalPatients, availableRooms };
        break;
      }

      case "BILLING": {
        const [pendingInvoices, totalPendingAgg, overdueAgg, todayCollectionsAgg] = await Promise.all([
          prisma.invoice.count({ where: { status: { in: ["PENDING", "PARTIAL", "OVERDUE"] } } }),
          prisma.invoice.aggregate({ where: { status: { in: ["PENDING", "PARTIAL", "OVERDUE"] } }, _sum: { total: true } }),
          prisma.invoice.aggregate({ where: { status: "OVERDUE" }, _sum: { total: true } }),
          prisma.payment.aggregate({
            where: { status: "COMPLETED", processedAt: { gte: targetDate, lt: new Date(targetDate.getTime() + 86400000) } },
            _sum: { amount: true },
          }),
        ]);

        roleStats = {
          pendingInvoices,
          totalPending: Number(totalPendingAgg._sum.total || 0),
          overdueAmount: Number(overdueAgg._sum.total || 0),
          todayCollections: Number(todayCollectionsAgg._sum.amount || 0),
        };
        break;
      }

      case "CALL_CENTER": {
        const [newLeads, followUpLeads, totalLeads, convertedLeads] = await Promise.all([
          prisma.lead.count({ where: { status: "NEW" } }),
          prisma.lead.count({ where: { status: "FOLLOW_UP" } }),
          prisma.lead.count(),
          prisma.lead.count({ where: { status: "BOOKED" } }),
        ]);

        roleStats = { newLeads, followUpLeads, totalLeads, convertedLeads };
        break;
      }

      default:
        roleStats = {};
    }

    return NextResponse.json({
      success: true,
      data: { ...baseStats, ...roleStats },
    });
  } catch (error) {
    logger.api("GET", "/api/dashboard/stats", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch dashboard stats" },
      { status: 500 }
    );
  }
}
