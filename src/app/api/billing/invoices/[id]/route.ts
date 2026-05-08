/**
 * @system MediCore ERP - Single Invoice API
 * @route GET /api/billing/invoices/:id - Get invoice details
 * @route PUT /api/billing/invoices/:id - Update invoice
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

import { requireAuth } from "@/lib/require-auth";
import { logger } from "@/lib/logger";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if (auth.response) return auth.response;

    const { id } = await params;
    const invoice = await prisma.invoice.findUnique({
      where: { id },
      include: {
        patient: { select: { id: true, firstName: true, lastName: true, patientCode: true, phone: true } },
        // Pulling address + phone for the thermal-receipt header. Email is
        // also useful as a contact line on the receipt.
        branch: { select: { id: true, name: true, code: true, address: true, phone: true, email: true } },
        appointment: { select: { id: true, appointmentCode: true, date: true, type: true } },
        items: {
          include: {
            // category drives the per-section header on the thermal
            // receipt (e.g. "INJECTABLE" / "LASER" subhead). taxCategory
            // is needed to label per-bracket GST in the totals strip.
            treatment: { select: { id: true, name: true, code: true, category: true, taxCategory: true } },
            product: { select: { id: true, name: true, sku: true } },
            package: { select: { id: true, name: true } },
          },
        },
        payments: {
          include: { processedBy: { select: { id: true, name: true } } },
          orderBy: { createdAt: "desc" },
        },
        createdBy: { select: { id: true, name: true } },
      },
    });

    if (!invoice) {
      return NextResponse.json(
        { success: false, error: "Invoice not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: invoice });
  } catch (error) {
    logger.api("GET", "/api/billing/invoices/[id]", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch invoice" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if (auth.response) return auth.response;

    const { id } = await params;
    const body = await request.json();

    const existing = await prisma.invoice.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Invoice not found" },
        { status: 404 }
      );
    }

    const invoice = await prisma.$transaction(async (tx) => {
      await tx.invoice.update({
        where: { id },
        data: {
          ...(body.subtotal !== undefined && { subtotal: body.subtotal }),
          ...(body.discount !== undefined && { discount: body.discount }),
          ...(body.discountType && { discountType: body.discountType }),
          ...(body.tax !== undefined && { tax: body.tax }),
          ...(body.total !== undefined && { total: body.total }),
          ...(body.amountPaid !== undefined && { amountPaid: body.amountPaid }),
          ...(body.balanceDue !== undefined && { balanceDue: body.balanceDue }),
          ...(body.status && { status: body.status }),
          ...(body.dueDate && { dueDate: new Date(body.dueDate) }),
          ...(body.notes !== undefined && { notes: body.notes }),
        },
      });

      if (Array.isArray(body.items)) {
        await tx.invoiceItem.deleteMany({ where: { invoiceId: id } });
        if (body.items.length > 0) {
          await tx.invoiceItem.createMany({
            data: body.items.map((item: Record<string, unknown>) => ({
              invoiceId: id,
              description: String(item.description || ""),
              quantity: Number(item.quantity ?? 1),
              unitPrice: Number(item.unitPrice ?? 0),
              discount: Number(item.discount ?? 0),
              tax: Number(item.tax ?? 0),
              total: Number(item.total ?? 0),
              treatmentId: (item.treatmentId as string) || null,
              productId: (item.productId as string) || null,
              packageId: (item.packageId as string) || null,
            })),
          });
        }
      }

      return tx.invoice.findUnique({
        where: { id },
        include: {
          patient: { select: { id: true, firstName: true, lastName: true, patientCode: true } },
          items: true,
          payments: true,
        },
      });
    });

    return NextResponse.json({ success: true, data: invoice });
  } catch (error) {
    logger.api("PUT", "/api/billing/invoices/[id]", error);
    return NextResponse.json(
      { success: false, error: "Failed to update invoice" },
      { status: 500 }
    );
  }
}
