/**
 * @system MediCore ERP — Reports API
 * @route GET /api/reports — Get analytics data for reports
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

import { toClinicDay } from "@/lib/utils";
import { requireAuth } from "@/lib/require-auth";
import { logger } from "@/lib/logger";
export async function GET(request: Request) {
  try {
    const auth = await requireAuth({ minRole: "ADMIN" });
    if (auth.response) return auth.response;

    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type") || "overview";
    const days = parseInt(searchParams.get("days") || "30");

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    if (type === "overview") {
      const [
        totalPatients, newPatients, totalAppointments,
        completedAppointments, cancelledAppointments, noShows,
        totalRevenue, pendingPayments, totalFollowUps, overdueFollowUps,
      ] = await Promise.all([
        prisma.patient.count({ where: { isActive: true } }),
        prisma.patient.count({ where: { createdAt: { gte: startDate } } }),
        prisma.appointment.count({ where: { createdAt: { gte: startDate } } }),
        prisma.appointment.count({ where: { status: "COMPLETED", createdAt: { gte: startDate } } }),
        prisma.appointment.count({ where: { status: "CANCELLED", createdAt: { gte: startDate } } }),
        prisma.appointment.count({ where: { status: "NO_SHOW", createdAt: { gte: startDate } } }),
        prisma.payment.aggregate({ where: { status: "COMPLETED", createdAt: { gte: startDate } }, _sum: { amount: true } }),
        prisma.invoice.aggregate({ where: { status: { in: ["PENDING", "PARTIAL", "OVERDUE"] } }, _sum: { balanceDue: true } }),
        prisma.followUp.count({ where: { createdAt: { gte: startDate } } }),
        prisma.followUp.count({ where: { status: "PENDING", dueDate: { lt: new Date() } } }),
      ]);

      return NextResponse.json({
        success: true,
        data: {
          totalPatients, newPatients, totalAppointments,
          completedAppointments, cancelledAppointments, noShows,
          completionRate: totalAppointments > 0 ? Math.round((completedAppointments / totalAppointments) * 100) : 0,
          noShowRate: totalAppointments > 0 ? Math.round((noShows / totalAppointments) * 100) : 0,
          totalRevenue: Number(totalRevenue._sum.amount || 0),
          pendingPayments: Number(pendingPayments._sum.balanceDue || 0),
          totalFollowUps, overdueFollowUps,
        },
      });
    }

    if (type === "revenue") {
      // Daily revenue for the period
      const payments = await prisma.payment.findMany({
        where: { status: "COMPLETED", createdAt: { gte: startDate } },
        select: { amount: true, method: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      });

      // Group by date
      const dailyRevenue: Record<string, number> = {};
      const methodSplit: Record<string, number> = {};
      for (const p of payments) {
        const dateKey = toClinicDay(p.createdAt);
        dailyRevenue[dateKey] = (dailyRevenue[dateKey] || 0) + Number(p.amount);
        methodSplit[p.method] = (methodSplit[p.method] || 0) + Number(p.amount);
      }

      return NextResponse.json({
        success: true,
        data: {
          dailyRevenue: Object.entries(dailyRevenue).map(([date, amount]) => ({ date, amount })),
          methodSplit: Object.entries(methodSplit).map(([method, amount]) => ({ method, amount })),
          total: payments.reduce((sum, p) => sum + Number(p.amount), 0),
        },
      });
    }

    if (type === "appointments") {
      const statusCounts = await prisma.appointment.groupBy({
        by: ["status"],
        where: { createdAt: { gte: startDate } },
        _count: true,
      });

      const typeCounts = await prisma.appointment.groupBy({
        by: ["type"],
        where: { createdAt: { gte: startDate } },
        _count: true,
      });

      // Doctor load
      const doctorLoad = await prisma.appointment.groupBy({
        by: ["doctorId"],
        where: { createdAt: { gte: startDate } },
        _count: true,
      });
      const doctorIds = doctorLoad.map((d) => d.doctorId);
      const doctors = await prisma.user.findMany({
        where: { id: { in: doctorIds } },
        select: { id: true, name: true },
      });
      const doctorMap = Object.fromEntries(doctors.map((d) => [d.id, d.name]));

      return NextResponse.json({
        success: true,
        data: {
          byStatus: statusCounts.map((s) => ({ status: s.status, count: s._count })),
          byType: typeCounts.map((t) => ({ type: t.type, count: t._count })),
          byDoctor: doctorLoad.map((d) => ({ doctor: doctorMap[d.doctorId] || "Unknown", count: d._count })),
        },
      });
    }

    if (type === "patients") {
      const genderSplit = await prisma.patient.groupBy({
        by: ["gender"],
        where: { isActive: true },
        _count: true,
      });

      // Registration trend (last N days)
      const registrations = await prisma.patient.findMany({
        where: { createdAt: { gte: startDate } },
        select: { createdAt: true },
        orderBy: { createdAt: "asc" },
      });
      const dailyRegs: Record<string, number> = {};
      for (const p of registrations) {
        const dateKey = toClinicDay(p.createdAt);
        dailyRegs[dateKey] = (dailyRegs[dateKey] || 0) + 1;
      }

      return NextResponse.json({
        success: true,
        data: {
          genderSplit: genderSplit.map((g) => ({ gender: g.gender, count: g._count })),
          registrationTrend: Object.entries(dailyRegs).map(([date, count]) => ({ date, count })),
        },
      });
    }

    return NextResponse.json({ success: false, error: "Unknown report type" }, { status: 400 });
  } catch (error) {
    logger.api("GET", "/api/reports", error);
    return NextResponse.json({ success: false, error: "Failed to generate report" }, { status: 500 });
  }
}
