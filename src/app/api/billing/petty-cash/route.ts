/**
 * @system MediCore ERP — Petty cash expenses (till payouts)
 * @route GET  /api/billing/petty-cash — list expenses for date / branch
 * @route POST /api/billing/petty-cash — record an expense
 *
 * Used by the billing reports flow. Cash payouts logged here are
 * subtracted from "cash receipts" in the day's reconciliation:
 *   Opening + Cash Receipts − Petty Cash − CC Tips = Cash in Hand
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/require-auth";
import { logger } from "@/lib/logger";
import { clinicDayRange } from "@/lib/utils";

export async function GET(request: Request) {
  try {
    const auth = await requireAuth();
    if (auth.response) return auth.response;

    const { searchParams } = new URL(request.url);
    const branchId = searchParams.get("branchId");
    const date = searchParams.get("date"); // YYYY-MM-DD (single day)
    const from = searchParams.get("from"); // YYYY-MM-DD (range start)
    const to = searchParams.get("to"); // YYYY-MM-DD (range end inclusive)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {};
    if (branchId) where.branchId = branchId;
    if (date) {
      const r = clinicDayRange(date);
      where.date = { gte: r.gte, lt: r.lt };
    } else if (from || to) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const range: any = {};
      if (from) range.gte = clinicDayRange(from).gte;
      if (to) range.lt = clinicDayRange(to).lt;
      where.date = range;
    }

    const expenses = await prisma.pettyCashExpense.findMany({
      where,
      include: {
        recordedBy: { select: { id: true, name: true } },
        branch: { select: { id: true, name: true, code: true } },
      },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    });

    return NextResponse.json({ success: true, data: expenses });
  } catch (error) {
    logger.api("GET", "/api/billing/petty-cash", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch petty cash" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAuth({
      roles: ["SUPER_ADMIN", "ADMIN", "BILLING", "RECEPTIONIST"],
    });
    if (auth.response) return auth.response;

    const body = await request.json();

    if (!body.branchId || !body.date || !body.category || !body.description || body.amount == null) {
      return NextResponse.json(
        { success: false, error: "branchId, date, category, description, amount are required" },
        { status: 400 }
      );
    }
    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json(
        { success: false, error: "amount must be a positive number" },
        { status: 400 }
      );
    }

    // If the date is already locked by a DailyClosing snapshot, refuse —
    // editing post-close would silently desync the saved totals.
    const closed = await prisma.dailyClosing.findUnique({
      where: { branchId_date: { branchId: body.branchId, date: new Date(body.date) } },
      select: { id: true },
    });
    if (closed) {
      return NextResponse.json(
        { success: false, error: "Day is already closed; reopen the closing to edit petty cash for this date." },
        { status: 409 }
      );
    }

    const expense = await prisma.pettyCashExpense.create({
      data: {
        branchId: body.branchId,
        date: new Date(body.date),
        category: body.category,
        description: String(body.description).trim().slice(0, 200),
        paidTo: body.paidTo ? String(body.paidTo).trim().slice(0, 120) : null,
        amount,
        notes: body.notes ? String(body.notes).trim() : null,
        recordedById: auth.user.id,
      },
      include: {
        recordedBy: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({ success: true, data: expense }, { status: 201 });
  } catch (error) {
    logger.api("POST", "/api/billing/petty-cash", error);
    return NextResponse.json(
      { success: false, error: "Failed to record petty cash" },
      { status: 500 }
    );
  }
}
