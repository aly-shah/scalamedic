/**
 * @system MediCore ERP — Petty cash item delete
 * @route DELETE /api/billing/petty-cash/:id — Remove a recorded expense
 *
 * Refuses if the day is already closed (snapshot would desync).
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/require-auth";
import { logger } from "@/lib/logger";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth({
      roles: ["SUPER_ADMIN", "ADMIN", "BILLING"],
    });
    if (auth.response) return auth.response;

    const { id } = await params;

    const expense = await prisma.pettyCashExpense.findUnique({
      where: { id },
      select: { id: true, branchId: true, date: true },
    });
    if (!expense) {
      return NextResponse.json(
        { success: false, error: "Expense not found" },
        { status: 404 }
      );
    }

    const closed = await prisma.dailyClosing.findUnique({
      where: { branchId_date: { branchId: expense.branchId, date: expense.date } },
      select: { id: true },
    });
    if (closed) {
      return NextResponse.json(
        { success: false, error: "Day is already closed; reopen the closing to delete this expense." },
        { status: 409 }
      );
    }

    await prisma.pettyCashExpense.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.api("DELETE", "/api/billing/petty-cash/[id]", error);
    return NextResponse.json(
      { success: false, error: "Failed to delete expense" },
      { status: 500 }
    );
  }
}
