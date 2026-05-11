"use client";

/**
 * CheckoutDialog
 *
 * Replaces the old one-shot Checkout button with a small panel that
 * lets reception:
 *   1. See every invoice from this visit at a glance (number, status,
 *      total, paid, balance) with grand totals
 *   2. Add another bill if the patient just remembered something or
 *      a procedure was added late
 *   3. Print a single combined receipt covering all bills for the visit
 *   4. Confirm checkout — flips workflowStage to CHECKOUT and records
 *      checkoutTime via the existing /checkout endpoint
 *
 * If there's an outstanding balance, Confirm checkout asks for an
 * extra confirm — receptionists used to silently close out IOUs and
 * the balance got lost.
 */
import { useState } from "react";
import {
  X, FileText, Printer, Plus, LogOut, AlertTriangle, Loader2,
} from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { useFormatCurrency } from "@/hooks/use-format-currency";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";


interface InvoiceLite {
  id: string;
  invoiceNumber?: string;
  status?: string;
  total?: number | string;
  amountPaid?: number | string;
  balanceDue?: number | string;
}

interface CheckoutDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirmCheckout: () => Promise<void> | void;
  onAddBill: () => void;
  appointmentId: string;
  patientName: string;
  invoices: InvoiceLite[];
  submitting?: boolean;
}

const num = (v: unknown): number => {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "string") { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; }
  return 0;
};

export function CheckoutDialog({
  isOpen, onClose, onConfirmCheckout, onAddBill,
  appointmentId, patientName, invoices, submitting,
}: CheckoutDialogProps) {
  const formatCurrency = useFormatCurrency();
  const [confirmingDue, setConfirmingDue] = useState(false);

  const totalBilled = invoices.reduce((s, i) => s + num(i.total), 0);
  const totalPaid = invoices.reduce((s, i) => s + num(i.amountPaid), 0);
  const totalDue = invoices.reduce((s, i) => s + num(i.balanceDue), 0);
  const hasDue = totalDue > 0.01;

  function statusVariant(s: string | undefined): "success" | "warning" | "danger" | "default" {
    if (s === "PAID") return "success";
    if (s === "PARTIAL" || s === "PENDING") return "warning";
    if (s === "OVERDUE") return "danger";
    return "default";
  }

  async function handleConfirm() {
    if (hasDue && !confirmingDue) {
      setConfirmingDue(true);
      return;
    }
    await onConfirmCheckout();
  }

  function handlePrintCombined() {
    window.open(
      `/billing/invoices/combined/${appointmentId}`,
      "_blank",
      "width=420,height=720,noopener=yes",
    );
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={submitting ? () => {} : onClose}
      title="Check out patient"
      subtitle={patientName}
      size="md"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Not yet
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={submitting}
            iconLeft={submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
            variant={hasDue && !confirmingDue ? "danger" : "primary"}
          >
            {submitting
              ? "Checking out…"
              : hasDue && !confirmingDue
                ? `Check out anyway (${formatCurrency(totalDue)} due)`
                : "Confirm checkout"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {/* Invoice list */}
        {invoices.length === 0 ? (
          <div className="px-3 py-4 rounded-xl bg-amber-50 border border-amber-100 text-sm text-amber-800 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            No bills on this visit yet. Add one before checking out.
          </div>
        ) : (
          <div className="border border-stone-100 rounded-xl divide-y divide-stone-100 overflow-hidden">
            {invoices.map((inv) => {
              const due = num(inv.balanceDue);
              return (
                <a
                  key={inv.id}
                  href={`/billing/invoices/${inv.id}`}
                  target="_blank"
                  rel="noopener"
                  className="flex items-center gap-3 px-3 py-2.5 hover:bg-stone-50"
                >
                  <FileText className="w-4 h-4 text-stone-400 shrink-0" />
                  <span className="font-medium text-sm text-stone-900 w-28 truncate">{inv.invoiceNumber || inv.id.slice(0, 8)}</span>
                  <Badge variant={statusVariant(inv.status)}>{inv.status || "—"}</Badge>
                  <div className="flex-1" />
                  <span className="text-sm text-stone-700 font-medium">{formatCurrency(num(inv.total))}</span>
                  {due > 0 && (
                    <span className="text-xs text-amber-700 font-medium">
                      {formatCurrency(due)} due
                    </span>
                  )}
                </a>
              );
            })}
          </div>
        )}

        {/* Totals strip */}
        <div className="grid grid-cols-3 gap-2">
          <Tile label="Total billed" value={totalBilled} />
          <Tile label="Paid" value={totalPaid} tone="emerald" />
          <Tile
            label="Outstanding"
            value={totalDue}
            tone={totalDue > 0 ? "amber" : "stone"}
            bold={totalDue > 0}
          />
        </div>

        {/* Outstanding warning */}
        {hasDue && (
          <div className={`px-3 py-2.5 rounded-xl border text-sm flex items-start gap-2 ${
            confirmingDue
              ? "bg-red-50 border-red-200 text-red-800"
              : "bg-amber-50 border-amber-100 text-amber-800"
          }`}>
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              {confirmingDue
                ? "Click again to confirm checkout with an unpaid balance — the invoice stays open and reception can collect later."
                : `Patient still owes ${formatCurrency(totalDue)}. Collect first, or check out and leave the invoice open for follow-up.`}
            </div>
          </div>
        )}

        {/* Action row */}
        <div className="flex items-center gap-2 flex-wrap pt-2 border-t border-stone-100">
          <Button
            variant="outline"
            size="sm"
            iconLeft={<Plus className="w-3.5 h-3.5" />}
            onClick={onAddBill}
            disabled={submitting}
          >
            Add another bill
          </Button>
          <Button
            variant="outline"
            size="sm"
            iconLeft={<Printer className="w-3.5 h-3.5" />}
            onClick={handlePrintCombined}
            disabled={submitting || invoices.length === 0}
          >
            Print combined receipt
          </Button>
        </div>
        {invoices.length > 1 && (
          <p className="text-xs text-stone-500 -mt-2">
            Combined receipt rolls all {invoices.length} bills into one printout — patient gets one piece of paper to take home.
          </p>
        )}
      </div>
    </Modal>
  );
}

function Tile({
  label, value, tone, bold,
}: { label: string; value: number; tone?: "emerald" | "amber" | "stone"; bold?: boolean }) {
  const formatCurrency = useFormatCurrency();
  const toneClass =
    tone === "emerald" ? "text-emerald-700" :
    tone === "amber" ? "text-amber-700" :
    "text-stone-900";
  return (
    <div className="bg-stone-50/60 border border-stone-100 rounded-xl px-3 py-2">
      <p className="text-[10px] uppercase font-medium text-stone-500 tracking-wider">{label}</p>
      <p className={`mt-0.5 ${bold ? "text-base font-semibold" : "text-sm font-medium"} ${toneClass}`}>
        {formatCurrency(value)}
      </p>
    </div>
  );
}
