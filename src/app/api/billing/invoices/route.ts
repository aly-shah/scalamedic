/**
 * @system MediCore ERP - Invoices List & Creation API
 * @route GET /api/billing/invoices - List invoices with filters
 * @route POST /api/billing/invoices - Create invoice
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

import { requireAuth } from "@/lib/require-auth";
import { logger } from "@/lib/logger";
import { calcLineTax, calcInclusiveTax, rateForTaxCategory } from "@/lib/tax-rates";
import { tenantIdForBranch } from "@/lib/tenant";
import type { PaymentMethodType } from "@prisma/client";
export async function GET(request: Request) {
  try {
    const auth = await requireAuth();
    if (auth.response) return auth.response;

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const patientId = searchParams.get("patientId");
    const branchId = searchParams.get("branchId");
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {};

    if (status) where.status = status;
    if (patientId) where.patientId = patientId;
    if (branchId) where.branchId = branchId;
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(to);
    }

    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 200);
    const offset = parseInt(searchParams.get("offset") || "0");

    const [invoices, total, totalAgg, paidAgg, pendingAgg] = await Promise.all([
      prisma.invoice.findMany({
        where,
        include: {
          patient: { select: { id: true, firstName: true, lastName: true, patientCode: true } },
          branch: { select: { id: true, name: true, code: true } },
          // Doctor name surfaces on the billing card via the linked
          // appointment (invoice.appointment.doctor.name). createdBy is
          // the receptionist/cashier who took the payment, not the doctor.
          appointment: {
            select: {
              id: true,
              appointmentCode: true,
              date: true,
              type: true,
              doctor: { select: { id: true, name: true, speciality: true } },
            },
          },
          items: true,
          payments: true,
          createdBy: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      prisma.invoice.count({ where }),
      prisma.invoice.aggregate({ where, _sum: { total: true } }),
      prisma.invoice.aggregate({ where: { ...where, status: "PAID" }, _sum: { total: true } }),
      prisma.invoice.aggregate({
        where: { ...where, status: { in: ["PENDING", "PARTIAL", "OVERDUE"] } },
        _sum: { total: true },
      }),
    ]);

    const summary = {
      total: Number(totalAgg._sum.total || 0),
      paid: Number(paidAgg._sum.total || 0),
      pending: Number(pendingAgg._sum.total || 0),
      count: total,
    };

    return NextResponse.json({
      success: true,
      data: invoices,
      summary,
      pagination: { total, limit, offset, hasMore: offset + limit < total },
    });
  } catch (error) {
    logger.api("GET", "/api/billing/invoices", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch invoices" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAuth();
    if (auth.response) return auth.response;

    const body = await request.json();

    // Generate INV-<year>-<NNNN> by reading the MAX existing number
    // for the current year and incrementing. count()+1 collides with
    // existing rows whenever an admin has deleted an invoice
    // mid-sequence (count goes down but the high numbers stay taken).
    // v53: scoped per-tenant, so two tenants don't fight over the
    // same INV-2026-0001.
    const invoiceTenantId = await tenantIdForBranch(body.branchId);
    const year = new Date().getFullYear();
    const last = await prisma.invoice.findFirst({
      where: { tenantId: invoiceTenantId, invoiceNumber: { startsWith: `INV-${year}-` } },
      orderBy: { invoiceNumber: "desc" },
      select: { invoiceNumber: true },
    });
    const lastNum = last ? parseInt(last.invoiceNumber.split("-").pop() || "0", 10) : 0;
    const invoiceNumber = `INV-${year}-${String(lastNum + 1).padStart(4, "0")}`;

    const rawItems = Array.isArray(body.items) ? body.items : [];

    // Resolve tax category for every line that links a treatment so we
    // can compute per-line tax server-side. Lines without a treatmentId
    // (consultation fees, manual entries) fall back to the 3% consult
    // rate inside rateForTaxCategory(null).
    const treatmentIds: string[] = Array.from(
      new Set(
        rawItems
          .map((it: Record<string, unknown>) => it.treatmentId)
          .filter((id: unknown): id is string => typeof id === "string" && id.length > 0)
      )
    ) as string[];
    const treatments = treatmentIds.length
      ? await prisma.treatment.findMany({
          where: { id: { in: treatmentIds } },
          select: { id: true, taxCategory: true },
        })
      : [];
    const taxCategoryById = new Map(treatments.map((t) => [t.id, t.taxCategory]));

    // Build authoritative line items with computed tax + total. The
    // client may send `tax` already populated for live preview, but we
    // recompute on the server so a tampered request can't underpay tax.
    //
    // Pricing convention:
    //   - Treatment lines: unitPrice is ex-GST, tax added on top.
    //     line.total = q*unitPrice - discount + tax.
    //   - Consultation lines (no treatmentId): unitPrice is the gross
    //     the patient pays (doctor's consultationFee is set inclusive
    //     of GST). Tax is reverse-derived from the gross so the
    //     receipt prints the GST line without inflating what the
    //     patient owes.
    const computedItems = rawItems.map((item: Record<string, unknown>) => {
      const treatmentId = (item.treatmentId as string) || null;
      const quantity = Number(item.quantity ?? 1);
      const unitPrice = Number(item.unitPrice ?? 0);
      const discount = Number(item.discount ?? 0);
      const ratePct = rateForTaxCategory(treatmentId ? taxCategoryById.get(treatmentId) ?? null : null);
      let tax: number;
      let total: number;
      if (treatmentId) {
        const lineSubtotal = Math.max(0, quantity * unitPrice - discount);
        tax = calcLineTax(lineSubtotal, ratePct);
        total = lineSubtotal + tax;
      } else {
        // Inclusive: gross is what the patient pays; back out the GST.
        const lineGross = Math.max(0, quantity * unitPrice - discount);
        tax = calcInclusiveTax(lineGross, ratePct);
        total = lineGross;
      }
      return {
        description: String(item.description || ""),
        quantity,
        unitPrice,
        discount,
        tax,
        total,
        treatmentId,
        productId: (item.productId as string) || null,
        packageId: (item.packageId as string) || null,
      };
    });

    // Re-derive invoice-level totals from the per-line numbers. Subtotal
    // is the ex-GST sum (line.total - line.tax) so subtotal + tax = sum
    // of grosses; the relation holds for both inclusive and additive
    // lines without branching.
    const invoiceTax = computedItems.reduce(
      (sum: number, it: { tax: number }) => sum + it.tax,
      0
    );
    const invoiceGross = computedItems.reduce(
      (sum: number, it: { total: number }) => sum + it.total,
      0
    );
    const invoiceSubtotal = invoiceGross - invoiceTax;
    // Header-level discount (e.g. "20% off the whole bill") is layered
    // on top of any per-line numbers.
    const headerDiscount = Number(body.discount || 0);
    const invoiceTotal = Math.max(0, invoiceGross - headerDiscount);

    // Resolve payment-at-creation: when amountPaid > 0 the route
    // creates a Payment row in the same transaction and derives the
    // invoice status (PAID / PARTIAL / PENDING / DRAFT) from how
    // much was collected. Previously the route hardcoded DRAFT, so
    // even a paid-in-full create would surface as "Unpaid" on the
    // billing list.
    const amountPaidIn = Math.max(0, Number(body.amountPaid || 0));
    const amountPaid = Math.min(amountPaidIn, invoiceTotal);
    const balanceDue = Math.max(0, invoiceTotal - amountPaid);
    const status =
      invoiceTotal === 0
        ? "DRAFT"
        : amountPaid >= invoiceTotal
        ? "PAID"
        : amountPaid > 0
        ? "PARTIAL"
        : "PENDING";

    const invoice = await prisma.$transaction(async (tx) => {
      const inv = await tx.invoice.create({
        data: {
          invoiceNumber,
          patientId: body.patientId,
          appointmentId: body.appointmentId || null,
          branchId: body.branchId,
          tenantId: invoiceTenantId,
          subtotal: invoiceSubtotal,
          discount: headerDiscount,
          discountType: body.discountType || "FIXED",
          tax: invoiceTax,
          total: invoiceTotal,
          amountPaid,
          balanceDue,
          status,
          dueDate: body.dueDate ? new Date(body.dueDate) : null,
          notes: body.notes || null,
          createdById: body.createdById,
          items: { create: computedItems },
        },
      });

      if (amountPaid > 0) {
        const validMethods = new Set(["CASH","CARD","CHEQUE","BANK_TRANSFER","DIGITAL_WALLET","INSURANCE","PACKAGE_DEDUCTION"]);
        const method: PaymentMethodType =
          (typeof body.paymentMethod === "string" && validMethods.has(body.paymentMethod))
            ? (body.paymentMethod as PaymentMethodType)
            : "CASH";
        await tx.payment.create({
          data: {
            invoiceId: inv.id,
            amount: amountPaid,
            method,
            reference: body.paymentReference || null,
            status: "COMPLETED",
            processedById: body.createdById,
            processedAt: new Date(),
            notes: body.paymentNotes || null,
          },
        });
      }

      return tx.invoice.findUnique({
        where: { id: inv.id },
        include: {
          patient: { select: { id: true, firstName: true, lastName: true, patientCode: true } },
          branch: { select: { id: true, name: true } },
          items: true,
          payments: true,
        },
      });
    });

    if (!invoice) {
      // Defensive — the transaction always returns a row (the row
      // we just inserted), but Prisma's findUnique signature is
      // nullable so satisfy the type checker.
      return NextResponse.json(
        { success: false, error: "Invoice creation succeeded but read-back failed" },
        { status: 500 },
      );
    }

    await logAudit({
      userId: body.createdById || "system",
      action: "CREATE",
      module: "BILLING",
      entityType: "Invoice",
      entityId: invoice.id,
      details: { invoiceNumber: invoice.invoiceNumber, amountPaid, status },
    });

    return NextResponse.json({ success: true, data: invoice }, { status: 201 });
  } catch (error) {
    logger.api("POST", "/api/billing/invoices", error);
    return NextResponse.json(
      { success: false, error: "Failed to create invoice" },
      { status: 500 }
    );
  }
}
