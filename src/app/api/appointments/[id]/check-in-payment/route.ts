/**
 * @system MediCore ERP — Check-in payment-gating
 * @route POST /api/appointments/[id]/check-in-payment
 *
 * Single endpoint that the receptionist's "Collect payment at check-in"
 * panel calls. Three behaviours, picked by `mode`:
 *
 *   "pay"  — create the invoice, record a Payment for `amount`, advance
 *            the appointment to WAITING (paid → ready for doctor). If
 *            amount < total the invoice ends as PARTIAL and the
 *            appointment stays in CHECKED_IN with an "Awaiting payment"
 *            chip — gives reception room to collect a partial deposit.
 *   "skip" — receptionist explicitly bypasses payment ("warn but allow"
 *            mode). No invoice, no payment. Appointment moves to
 *            WAITING anyway so the doctor isn't blocked, but we tag
 *            workflowStage so a future report can flag unpaid
 *            consultations.
 *   "draft"— create the invoice with status DRAFT, no payment. Used if
 *            the patient wants the bill but wants to pay later (rare).
 *
 * Items come from the client (already computed from doctor consultation
 * fee + treatment basePrice) so the receptionist can override before
 * collecting. We trust the totals the client sends; this matches how
 * /api/billing/invoices works today.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/require-auth";
import { logAudit } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { validate } from "@/lib/validations";
import { syncRoomStatus } from "@/lib/room-status";
import { calcLineTax, calcInclusiveTax, rateForTaxCategory } from "@/lib/tax-rates";

const itemSchema = z.object({
  description: z.string().min(1).max(300),
  quantity: z.number().int().min(1).default(1),
  unitPrice: z.number().nonnegative(),
  treatmentId: z.string().uuid().optional().nullable(),
  productId: z.string().uuid().optional().nullable(),
});

const bodySchema = z.object({
  mode: z.enum(["pay", "skip", "draft"]),
  items: z.array(itemSchema).default([]),
  // Total before discount/tax — client sums quantity * unitPrice for now.
  // Discount/tax can be wired in later; current billing flow already
  // supports both fields end-to-end.
  discount: z.number().nonnegative().default(0),
  tax: z.number().nonnegative().default(0),
  // Cash collected from the patient this transaction.
  amountPaid: z.number().nonnegative().default(0),
  paymentMethod: z.enum(["CASH", "CARD", "CHEQUE", "BANK_TRANSFER", "DIGITAL_WALLET", "INSURANCE"]).optional(),
  paymentReference: z.string().max(100).optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth({
      roles: ["SUPER_ADMIN", "ADMIN", "RECEPTIONIST", "BILLING"],
    });
    if (auth.response) return auth.response;

    const { id } = await params;
    const body = await request.json();
    const v = validate(bodySchema, body);
    if (!v.success) {
      return NextResponse.json({ success: false, error: v.error }, { status: 400 });
    }
    const d = v.data;

    const appt = await prisma.appointment.findUnique({
      where: { id },
      select: { id: true, patientId: true, branchId: true, tenantId: true, status: true, appointmentCode: true },
    });
    if (!appt) {
      return NextResponse.json({ success: false, error: "Appointment not found" }, { status: 404 });
    }

    // Phase 2 case: doctor prescribed a procedure mid-consultation, patient
    // is now back at reception for a second bill. We're past the initial
    // check-in transition — just create the invoice + payment and leave the
    // appointment status alone (don't regress IN_PROGRESS → WAITING etc.).
    const preDoctor = appt.status === "SCHEDULED" || appt.status === "CONFIRMED" || appt.status === "CHECKED_IN";
    const skipStatusTransition = !preDoctor;

    // Compute totals once on the server. Client-sent unitPrice is honored
    // (receptionist may have edited), but the totals used downstream are
    // recomputed so a sneaky client can't underpay.
    //
    // Tax pricing convention:
    //   - Treatment lines: unitPrice is ex-GST, tax added on top
    //     (3% medical, 8% cosmetic / slimming).
    //   - Consultation lines (no treatmentId): the doctor's consultation
    //     fee is set inclusive of the 3% GST, so unitPrice already
    //     contains tax. We reverse-derive the embedded GST so the
    //     receipt prints the line without inflating what the patient
    //     owes.
    // Anything the client sent in `d.tax` is ignored.
    const treatmentIds = Array.from(
      new Set(
        d.items
          .map((it) => it.treatmentId)
          .filter((id): id is string => typeof id === "string" && id.length > 0)
      )
    );
    const treatments = treatmentIds.length
      ? await prisma.treatment.findMany({
          where: { id: { in: treatmentIds } },
          select: { id: true, taxCategory: true },
        })
      : [];
    const taxCategoryById = new Map(treatments.map((t) => [t.id, t.taxCategory]));

    const linesWithTax = d.items.map((it) => {
      const ratePct = rateForTaxCategory(it.treatmentId ? taxCategoryById.get(it.treatmentId) ?? null : null);
      const lineGross = it.quantity * it.unitPrice;
      if (it.treatmentId) {
        const tax = calcLineTax(lineGross, ratePct);
        return { ...it, lineSubtotal: lineGross, tax, lineTotal: lineGross + tax };
      }
      // Inclusive consultation: unitPrice IS the gross.
      const tax = calcInclusiveTax(lineGross, ratePct);
      return { ...it, lineSubtotal: lineGross - tax, tax, lineTotal: lineGross };
    });
    const tax = linesWithTax.reduce((acc, it) => acc + it.tax, 0);
    const grossSum = linesWithTax.reduce((acc, it) => acc + it.lineTotal, 0);
    const subtotal = grossSum - tax;
    const total = Math.max(0, grossSum - d.discount);
    const amountPaid = d.mode === "pay" ? Math.min(d.amountPaid, total) : 0;
    const balanceDue = Math.max(0, total - amountPaid);

    const result = await prisma.$transaction(async (tx) => {
      let invoiceId: string | null = null;
      let invoiceNumber: string | null = null;

      // Skip mode: no invoice at all. We only flip the appointment.
      if (d.mode !== "skip" && d.items.length > 0) {
        // MAX-based numbering — count()+1 collides on a sequence
        // gap (admin deletes a mid-range invoice). Inside this $tx
        // so the read sees concurrent inserts via row locks.
        // v53: invoice numbers are scoped per-tenant.
        const year = new Date().getFullYear();
        const last = await tx.invoice.findFirst({
          where: { tenantId: appt.tenantId, invoiceNumber: { startsWith: `INV-${year}-` } },
          orderBy: { invoiceNumber: "desc" },
          select: { invoiceNumber: true },
        });
        const lastNum = last ? parseInt(last.invoiceNumber.split("-").pop() || "0", 10) : 0;
        invoiceNumber = `INV-${year}-${String(lastNum + 1).padStart(4, "0")}`;

        const inv = await tx.invoice.create({
          data: {
            invoiceNumber,
            patientId: appt.patientId,
            appointmentId: appt.id,
            branchId: appt.branchId,
            tenantId: appt.tenantId,
            subtotal,
            discount: d.discount,
            discountType: "FIXED",
            tax,
            total,
            amountPaid,
            balanceDue,
            status:
              d.mode === "draft" ? "DRAFT"
              : amountPaid >= total ? "PAID"
              : amountPaid > 0 ? "PARTIAL"
              : "PENDING",
            createdById: auth.user.id,
            notes: d.notes,
            items: {
              create: linesWithTax.map((it) => ({
                description: it.description,
                quantity: it.quantity,
                unitPrice: it.unitPrice,
                discount: 0,
                tax: it.tax,
                total: it.lineTotal,
                treatmentId: it.treatmentId || null,
                productId: it.productId || null,
              })),
            },
          },
        });
        invoiceId = inv.id;

        if (d.mode === "pay" && amountPaid > 0) {
          await tx.payment.create({
            data: {
              invoiceId: inv.id,
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
      }

      // Appointment state transition. Paid in full → WAITING (doctor
      // queue picks them up). Skipped → also WAITING (warn-but-allow).
      // Draft / partial → CHECKED_IN so the queue keeps the "awaiting
      // payment" pill on them. If the patient is already past initial
      // check-in (Phase 2 second-bill case) we leave status untouched.
      let updated;
      if (skipStatusTransition) {
        updated = await tx.appointment.findUnique({ where: { id: appt.id } });
      } else {
        const fullyPaidOrSkipped = d.mode === "skip" || amountPaid >= total;
        const newStatus = fullyPaidOrSkipped ? "WAITING" : "CHECKED_IN";
        const newWorkflow = fullyPaidOrSkipped ? "WAITING" : "CHECKIN";
        updated = await tx.appointment.update({
          where: { id: appt.id },
          data: {
            status: newStatus,
            workflowStage: newWorkflow,
            checkinTime: new Date(),
          },
        });
      }

      return { invoiceId, invoiceNumber, appointment: updated, transitioned: !skipStatusTransition };
    });

    const auditAction = skipStatusTransition
      ? "ADDITIONAL_PAYMENT"
      : d.mode === "skip"
        ? "CHECK_IN_NO_PAYMENT"
        : "CHECK_IN_WITH_PAYMENT";
    await logAudit({
      userId: auth.user.id,
      action: auditAction,
      module: "APPOINTMENT",
      entityType: "Appointment",
      entityId: appt.id,
      details: {
        appointmentCode: appt.appointmentCode,
        mode: d.mode,
        invoiceNumber: result.invoiceNumber,
        total,
        amountPaid,
        skipStatusTransition,
      },
    });

    // Bill+check-in moves the appointment into an active state
    // (CHECKED_IN or WAITING) so the assigned room is now occupied.
    if (result.transitioned) {
      await syncRoomStatus(result.appointment?.roomId);
    }

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    logger.api("POST", "/api/appointments/[id]/check-in-payment", error);
    return NextResponse.json({ success: false, error: "Failed" }, { status: 500 });
  }
}
