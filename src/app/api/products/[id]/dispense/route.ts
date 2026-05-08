/**
 * @system MediCore ERP — Dispense product to patient
 * @route POST /api/products/[id]/dispense
 *
 * Creates an invoice + invoice item linked to this product, decrements
 * stock by `quantity`, and (when `mode === "pay"`) records a Payment in
 * the same transaction. The result is the same shape as the existing
 * /api/billing/invoices/[id] response, so the caller can navigate
 * straight to /billing/invoices/[id] (?print=1) for the thermal receipt.
 *
 * Modes:
 *   "pay"    — invoice paid in full, status PAID
 *   "draft"  — invoice DRAFT, no payment, balance left for later
 *   "bill"   — invoice PENDING, no payment recorded (charge to patient,
 *              they'll settle next visit)
 *
 * Stock is decremented unconditionally — even on "draft" / "bill" — because
 * the product physically left the shelf. The receptionist can use the
 * pharmacy stock-adjust panel to reverse if needed.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/require-auth";
import { logAudit } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { validate } from "@/lib/validations";

const bodySchema = z.object({
  patientId: z.string().uuid(),
  quantity: z.number().int().min(1).default(1),
  mode: z.enum(["pay", "draft", "bill"]).default("pay"),
  paymentMethod: z.enum(["CASH", "CARD", "CHEQUE", "BANK_TRANSFER", "DIGITAL_WALLET", "INSURANCE"]).optional(),
  paymentReference: z.string().max(200).optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth({ roles: ["SUPER_ADMIN", "ADMIN", "RECEPTIONIST", "BILLING"] });
    if (auth.response) return auth.response;

    const { id } = await params;
    const body = await request.json();
    const v = validate(bodySchema, body);
    if (!v.success) {
      return NextResponse.json({ success: false, error: v.error }, { status: 400 });
    }
    const d = v.data;

    const product = await prisma.product.findUnique({
      where: { id },
      select: {
        id: true, name: true, sellPrice: true, quantity: true,
        unit: true, branchId: true, isActive: true,
      },
    });
    if (!product || !product.isActive) {
      return NextResponse.json({ success: false, error: "Product not found" }, { status: 404 });
    }
    if (product.quantity < d.quantity) {
      return NextResponse.json(
        { success: false, error: `Only ${product.quantity} in stock; cannot dispense ${d.quantity}.` },
        { status: 409 },
      );
    }

    const patient = await prisma.patient.findUnique({
      where: { id: d.patientId },
      select: { id: true, branchId: true, tenantId: true },
    });
    if (!patient) {
      return NextResponse.json({ success: false, error: "Patient not found" }, { status: 404 });
    }

    const unitPrice = Number(product.sellPrice);
    const lineTotal = unitPrice * d.quantity;
    const total = lineTotal; // no discount/tax on quick dispense — receptionist can edit invoice later
    const amountPaid = d.mode === "pay" ? total : 0;

    const result = await prisma.$transaction(async (tx) => {
      // Decrement stock first; condition on `quantity >= d.quantity` to
      // protect against a concurrent dispense racing us between the
      // findUnique above and this update.
      const dec = await tx.product.updateMany({
        where: { id: product.id, quantity: { gte: d.quantity } },
        data: { quantity: { decrement: d.quantity } },
      });
      if (dec.count === 0) {
        throw new Error("Stock changed while dispensing — refresh and try again.");
      }

      // MAX-based numbering — count()+1 collides on sequence gaps
      // (deleted invoices). v53: scoped per-tenant.
      const year = new Date().getFullYear();
      const last = await tx.invoice.findFirst({
        where: { tenantId: patient.tenantId, invoiceNumber: { startsWith: `INV-${year}-` } },
        orderBy: { invoiceNumber: "desc" },
        select: { invoiceNumber: true },
      });
      const lastNum = last ? parseInt(last.invoiceNumber.split("-").pop() || "0", 10) : 0;
      const invoiceNumber = `INV-${year}-${String(lastNum + 1).padStart(4, "0")}`;

      const invoice = await tx.invoice.create({
        data: {
          invoiceNumber,
          patientId: patient.id,
          branchId: patient.branchId,
          tenantId: patient.tenantId,
          subtotal: total,
          discount: 0,
          discountType: "FIXED",
          tax: 0,
          total,
          amountPaid,
          balanceDue: total - amountPaid,
          status:
            d.mode === "draft" ? "DRAFT"
            : amountPaid >= total ? "PAID"
            : "PENDING",
          createdById: auth.user.id,
          notes: d.notes ?? null,
          items: {
            create: [{
              productId: product.id,
              description: `${product.name}${product.unit ? ` (${product.unit})` : ""}`,
              quantity: d.quantity,
              unitPrice,
              discount: 0,
              tax: 0,
              total: lineTotal,
            }],
          },
        },
      });

      if (d.mode === "pay" && amountPaid > 0) {
        await tx.payment.create({
          data: {
            invoiceId: invoice.id,
            amount: amountPaid,
            method: d.paymentMethod ?? "CASH",
            reference: d.paymentReference ?? null,
            status: "COMPLETED",
            processedById: auth.user.id,
            processedAt: new Date(),
            notes: d.notes ?? null,
          },
        });
      }

      return { invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber };
    });

    await logAudit({
      userId: auth.user.id,
      action: "PRODUCT_DISPENSED",
      module: "BILLING",
      entityType: "Product",
      entityId: product.id,
      details: {
        productName: product.name,
        quantity: d.quantity,
        mode: d.mode,
        invoiceNumber: result.invoiceNumber,
        total,
        amountPaid,
      },
    });

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    logger.api("POST", "/api/products/[id]/dispense", error);
    const message = error instanceof Error ? error.message : "Failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
