/**
 * @system MediCore ERP - Payments API
 * @route GET /api/billing/payments - List payments
 * @route POST /api/billing/payments - Record payment
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/require-auth";
import { createPaymentSchema, validate } from "@/lib/validations";
import { clinicDayRange } from "@/lib/utils";

import { logger } from "@/lib/logger";
export async function GET(request: Request) {
  try {
    const auth = await requireAuth();
    if (auth.response) return auth.response;

    const { searchParams } = new URL(request.url);
    const invoiceId = searchParams.get("invoiceId");
    const patientId = searchParams.get("patientId");
    const method = searchParams.get("method");
    const status = searchParams.get("status");
    // Date-range filter for the daily-report export. Both bounds are
    // YYYY-MM-DD strings interpreted in clinic time (Asia/Karachi). Filter
    // applies to processedAt — that's when money actually moved, which is
    // what reception cares about for end-of-day reconciliation. Falls back
    // to createdAt only when processedAt is null (legacy rows).
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    // Daily reports can have hundreds of rows; allow `all` to bypass the
    // 200 cap, but only when a date range is set (so we don't accidentally
    // return the entire payment history).
    const limitParam = searchParams.get("limit") || "50";
    const dateRangeSet = !!(from || to);
    const limit = limitParam === "all" && dateRangeSet
      ? 5000
      : Math.min(parseInt(limitParam) || 50, 200);
    const offset = parseInt(searchParams.get("offset") || "0");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {};

    if (invoiceId) where.invoiceId = invoiceId;
    if (method) where.method = method;
    if (status) where.status = status;
    if (patientId) where.invoice = { patientId };

    if (from || to) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const range: any = {};
      if (from) range.gte = clinicDayRange(from).gte;
      // `to` is inclusive of the whole day, so clamp to start-of-next-day.
      if (to) range.lt = clinicDayRange(to).lt;
      where.processedAt = range;
    }

    const [payments, total] = await Promise.all([
      prisma.payment.findMany({
        where,
        include: {
          invoice: {
            select: {
              id: true, invoiceNumber: true, patientId: true, total: true,
              patient: { select: { id: true, firstName: true, lastName: true, patientCode: true } },
              // Doctor for the daily report — comes through the appointment.
              // Walk-in / no-appointment invoices won't have one.
              appointment: {
                select: {
                  id: true, appointmentCode: true,
                  doctor: { select: { id: true, name: true } },
                },
              },
            },
          },
          processedBy: { select: { id: true, name: true } },
        },
        // processedAt-desc for date-range exports (real time-of-payment
        // ordering); createdAt-desc otherwise so the live list still
        // surfaces the most recently *recorded* payment first.
        orderBy: dateRangeSet ? { processedAt: "desc" } : { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      prisma.payment.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      data: payments,
      pagination: { total, limit, offset, hasMore: offset + limit < total },
    });
  } catch (error) {
    logger.api("GET", "/api/billing/payments", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch payments" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAuth({ roles: ["SUPER_ADMIN", "ADMIN", "BILLING", "RECEPTIONIST"] });
    if (auth.response) return auth.response;

    const body = await request.json();
    const v = validate(createPaymentSchema, body);
    if (!v.success) {
      return NextResponse.json({ success: false, error: v.error }, { status: 400 });
    }

    const d = v.data;

    const payment = await prisma.$transaction(async (tx) => {
      const pmt = await tx.payment.create({
        data: {
          invoiceId: d.invoiceId,
          amount: d.amount,
          method: d.method,
          reference: d.reference || null,
          status: "COMPLETED",
          processedById: auth.user.id,
          processedAt: new Date(),
          notes: d.notes || null,
        },
        include: {
          invoice: { select: { id: true, invoiceNumber: true } },
          processedBy: { select: { id: true, name: true } },
        },
      });

      // Recalculate invoice totals
      const invoice = await tx.invoice.findUnique({
        where: { id: d.invoiceId },
        include: { payments: { where: { status: "COMPLETED" } } },
      });

      if (invoice) {
        const totalPaid = invoice.payments.reduce((sum, p) => sum + Number(p.amount), 0);
        const balanceDue = Number(invoice.total) - totalPaid;
        const newStatus = balanceDue <= 0 ? "PAID" : totalPaid > 0 ? "PARTIAL" : invoice.status;

        await tx.invoice.update({
          where: { id: d.invoiceId },
          data: { amountPaid: totalPaid, balanceDue: Math.max(0, balanceDue), status: newStatus },
        });
      }

      await tx.auditLog.create({
        data: {
          userId: auth.user.id,
          action: "PAYMENT",
          module: "BILLING",
          entityType: "Payment",
          entityId: pmt.id,
          details: { invoiceId: d.invoiceId, amount: d.amount },
        },
      });

      return pmt;
    });

    return NextResponse.json({ success: true, data: payment }, { status: 201 });
  } catch (error) {
    logger.api("POST", "/api/billing/payments", error);
    return NextResponse.json(
      { success: false, error: "Failed to create payment" },
      { status: 500 }
    );
  }
}
