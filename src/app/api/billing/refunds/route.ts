/**
 * @system MediCore ERP - Refunds API
 * @route GET /api/billing/refunds - List refunds
 * @route POST /api/billing/refunds - Create refund request
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
    const invoiceId = searchParams.get("invoiceId");
    const status = searchParams.get("status");

    const where: Record<string, unknown> = {};
    if (invoiceId) where.invoiceId = invoiceId;
    if (status) where.status = status;

    const refunds = await prisma.refund.findMany({
      where,
      include: {
        invoice: {
          select: {
            id: true, invoiceNumber: true, total: true, patientId: true,
            patient: { select: { id: true, firstName: true, lastName: true, patientCode: true } },
          },
        },
        processedBy: { select: { id: true, name: true } },
        approvedBy: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ success: true, data: refunds });
  } catch (error) {
    logger.api("GET", "/api/billing/refunds", error);
    return NextResponse.json({ success: false, error: "Failed to fetch refunds" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAuth();
    if (auth.response) return auth.response;

    const body = await request.json();

    if (!body.invoiceId || !body.amount || !body.reason) {
      return NextResponse.json(
        { success: false, error: "Missing required fields: invoiceId, amount, reason" },
        { status: 400 }
      );
    }

    // Validate invoice exists and has payments
    const invoice = await prisma.invoice.findUnique({
      where: { id: body.invoiceId },
      select: { id: true, total: true, amountPaid: true, status: true },
    });

    if (!invoice) {
      return NextResponse.json({ success: false, error: "Invoice not found" }, { status: 404 });
    }

    const refundAmount = parseFloat(body.amount);
    const paid = Number(invoice.amountPaid);

    if (refundAmount > paid) {
      return NextResponse.json(
        { success: false, error: `Refund amount (${refundAmount}) exceeds amount paid (${paid})` },
        { status: 400 }
      );
    }

    const refund = await prisma.refund.create({
      data: {
        invoiceId: body.invoiceId,
        amount: refundAmount,
        reason: body.reason,
        method: body.method || null,
        reference: body.reference || null,
        notes: body.notes || null,
        processedById: body.processedById || null,
        approvedById: body.approvedById || null,
        status: "REQUESTED",
      },
      include: {
        invoice: {
          select: { id: true, invoiceNumber: true, patient: { select: { id: true, firstName: true, lastName: true } } },
        },
      },
    });

    return NextResponse.json({ success: true, data: refund }, { status: 201 });
  } catch (error) {
    logger.api("POST", "/api/billing/refunds", error);
    return NextResponse.json({ success: false, error: "Failed to create refund" }, { status: 500 });
  }
}
