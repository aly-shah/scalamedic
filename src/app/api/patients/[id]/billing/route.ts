/**
 * @system MediCore ERP - Patient Billing API
 * @route GET /api/patients/:id/billing - Get patient invoices
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

import { requireAuth } from "@/lib/require-auth";
import { logger } from "@/lib/logger";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if (auth.response) return auth.response;

    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");

    const where: Prisma.InvoiceWhereInput = { patientId: id };

    if (status) {
      where.status = status as Prisma.EnumInvoiceStatusFilter;
    }

    const invoices = await prisma.invoice.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        // items needed by the Overview-tab "Recent invoices" preview
        // (it shows the first line's description). Other call sites
        // ignore the field so including it is safe.
        items: true,
        payments: true,
        branch: {
          select: { id: true, name: true },
        },
        createdBy: {
          select: { id: true, name: true },
        },
      },
    });

    // Calculate outstanding balance from PENDING/PARTIAL/OVERDUE invoices
    const outstandingInvoices = await prisma.invoice.findMany({
      where: {
        patientId: id,
        status: { in: ["PENDING", "PARTIAL", "OVERDUE"] },
      },
      select: { balanceDue: true },
    });

    const totalOutstanding = outstandingInvoices.reduce(
      (sum, inv) => sum + Number(inv.balanceDue),
      0
    );

    return NextResponse.json({
      success: true,
      data: { invoices, totalOutstanding },
    });
  } catch (error) {
    logger.api("GET", "/api/patients/[id]/billing", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch billing data" },
      { status: 500 }
    );
  }
}
