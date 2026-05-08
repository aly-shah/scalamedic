/**
 * @system MediCore ERP — Doctor revenue report
 * @route GET /api/admin/reports/doctor-revenue?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Per-doctor aggregate over a date window:
 *   - completedVisits  — appointments where doctor=X with status=COMPLETED
 *   - invoicesIssued    — invoices linked to one of those appointments
 *   - totalBilled       — sum of invoice.total
 *   - totalCollected    — sum of invoice.amountPaid
 *   - totalOutstanding  — sum of balanceDue on PENDING / PARTIAL / OVERDUE
 *   - avgPerVisit       — totalBilled / completedVisits
 *
 * "Walk-in" invoices (no linked appointment) are excluded; they
 * can't be attributed to a specific doctor reliably. The summary
 * row reports them separately so the report stays balanced.
 *
 * Auth: ADMIN+. Revenue is sensitive — gated above DOCTOR.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/require-auth";
import { logger } from "@/lib/logger";

interface DoctorRow {
  doctorId: string;
  doctorName: string;
  speciality: string | null;
  completedVisits: number;
  invoicesIssued: number;
  totalBilled: number;
  totalCollected: number;
  totalOutstanding: number;
  avgPerVisit: number;
}

export async function GET(request: Request) {
  try {
    const auth = await requireAuth({ minRole: "ADMIN" });
    if (auth.response) return auth.response;

    const { searchParams } = new URL(request.url);
    const fromRaw = searchParams.get("from");
    const toRaw = searchParams.get("to");
    // Default: current month
    const now = new Date();
    const from = fromRaw ? new Date(fromRaw) : new Date(now.getFullYear(), now.getMonth(), 1);
    const to   = toRaw   ? new Date(toRaw)   : now;

    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from >= to) {
      return NextResponse.json({ success: false, error: "Invalid date range" }, { status: 400 });
    }

    // Tenant scope: report only on doctors in the calling user's tenant.
    const me = await prisma.user.findUnique({
      where: { id: auth.user.id },
      select: { tenantId: true },
    });
    if (!me) return NextResponse.json({ success: false, error: "User not found" }, { status: 404 });

    // ─── Visits per doctor (COMPLETED only) ─────────────────
    const visitGroups = await prisma.appointment.groupBy({
      by: ["doctorId"],
      where: {
        status: "COMPLETED",
        date: { gte: from, lte: to },
        doctor: { tenantId: me.tenantId },
      },
      _count: { _all: true },
    });
    const visitsByDoctor = new Map<string, number>();
    for (const g of visitGroups) visitsByDoctor.set(g.doctorId, g._count._all);

    // ─── Invoice aggregates per doctor (via appointment FK) ──
    // Pull invoices in window with non-null appointmentId, group
    // client-side. Invoice volumes per clinic are bounded; doing
    // this in app code keeps the SQL portable.
    const invoices = await prisma.invoice.findMany({
      where: {
        createdAt: { gte: from, lte: to },
        appointmentId: { not: null },
        appointment: { doctor: { tenantId: me.tenantId } },
      },
      select: {
        total: true,
        amountPaid: true,
        balanceDue: true,
        status: true,
        appointment: { select: { doctorId: true } },
      },
    });
    const stats = new Map<string, { issued: number; billed: number; collected: number; outstanding: number }>();
    for (const inv of invoices) {
      const did = inv.appointment?.doctorId;
      if (!did) continue;
      let s = stats.get(did);
      if (!s) {
        s = { issued: 0, billed: 0, collected: 0, outstanding: 0 };
        stats.set(did, s);
      }
      s.issued += 1;
      s.billed += Number(inv.total);
      s.collected += Number(inv.amountPaid);
      if (["PENDING", "PARTIAL", "OVERDUE"].includes(inv.status)) {
        s.outstanding += Number(inv.balanceDue);
      }
    }

    // Walk-in (no-appointment) invoices reported separately.
    const walkIns = await prisma.invoice.aggregate({
      where: {
        createdAt: { gte: from, lte: to },
        appointmentId: null,
      },
      _sum: { total: true, amountPaid: true, balanceDue: true },
      _count: { _all: true },
    });

    // ─── Doctor metadata for the rows we produced ─────────
    const doctorIds = new Set<string>([
      ...visitsByDoctor.keys(),
      ...stats.keys(),
    ]);
    const doctors = await prisma.user.findMany({
      where: { id: { in: [...doctorIds] } },
      select: { id: true, name: true, speciality: true },
    });
    const doctorMeta = new Map(doctors.map((d) => [d.id, d]));

    const rows: DoctorRow[] = [...doctorIds].map((id) => {
      const meta = doctorMeta.get(id);
      const visits = visitsByDoctor.get(id) ?? 0;
      const s = stats.get(id) ?? { issued: 0, billed: 0, collected: 0, outstanding: 0 };
      return {
        doctorId: id,
        doctorName: meta?.name ?? "(unknown)",
        speciality: meta?.speciality ?? null,
        completedVisits: visits,
        invoicesIssued: s.issued,
        totalBilled: s.billed,
        totalCollected: s.collected,
        totalOutstanding: s.outstanding,
        avgPerVisit: visits > 0 ? Math.round(s.billed / visits) : 0,
      };
    });
    rows.sort((a, b) => b.totalBilled - a.totalBilled);

    const totals = rows.reduce(
      (acc, r) => ({
        completedVisits: acc.completedVisits + r.completedVisits,
        invoicesIssued: acc.invoicesIssued + r.invoicesIssued,
        totalBilled: acc.totalBilled + r.totalBilled,
        totalCollected: acc.totalCollected + r.totalCollected,
        totalOutstanding: acc.totalOutstanding + r.totalOutstanding,
      }),
      { completedVisits: 0, invoicesIssued: 0, totalBilled: 0, totalCollected: 0, totalOutstanding: 0 },
    );

    return NextResponse.json({
      success: true,
      data: {
        from: from.toISOString(),
        to: to.toISOString(),
        rows,
        totals,
        walkIns: {
          count: walkIns._count._all,
          billed: Number(walkIns._sum.total ?? 0),
          collected: Number(walkIns._sum.amountPaid ?? 0),
          outstanding: Number(walkIns._sum.balanceDue ?? 0),
        },
      },
    });
  } catch (error) {
    logger.api("GET", "/api/admin/reports/doctor-revenue", error);
    return NextResponse.json({ success: false, error: "Failed to compute" }, { status: 500 });
  }
}
