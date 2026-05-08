"use client";

import { useState } from "react";
import {
  Banknote, CreditCard, Building2, Smartphone, ScrollText,
  CheckCircle,
} from "lucide-react";
import { Modal, Button, Input, Badge } from "@/components/ui";
import { formatCurrency, formatDate } from "@/lib/utils";
import { invoiceStatusColors } from "@/lib/constants";
import type { Invoice, PaymentMethod } from "@/types";
import { cn } from "@/lib/utils";
import { useModuleEmit } from "@/modules/core/hooks";
import { SystemEvents } from "@/modules/core/events";
import { useRecordPayment } from "@/hooks/use-queries";
import { useAuth } from "@/lib/auth-context";

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoice: Invoice;
}

const paymentMethods: { id: PaymentMethod; label: string; icon: React.ReactNode }[] = [
  { id: "CASH" as PaymentMethod, label: "Cash", icon: <Banknote className="w-5 h-5" /> },
  { id: "CARD" as PaymentMethod, label: "Credit card", icon: <CreditCard className="w-5 h-5" /> },
  { id: "CHEQUE" as PaymentMethod, label: "Cheque", icon: <ScrollText className="w-5 h-5" /> },
  { id: "BANK_TRANSFER" as PaymentMethod, label: "Bank Transfer", icon: <Building2 className="w-5 h-5" /> },
  { id: "DIGITAL_WALLET" as PaymentMethod, label: "Digital wallet", icon: <Smartphone className="w-5 h-5" /> },
];

export function PaymentModal({ isOpen, onClose, invoice }: PaymentModalProps) {
  const emit = useModuleEmit("MOD-PAYMENT");
  const { user } = useAuth();
  const recordPayment = useRecordPayment();

  const balanceDue = (invoice.total || 0) - (invoice.payments?.reduce((sum, p) => sum + (p.amount || 0), 0) || 0);

  const [amount, setAmount] = useState(String(Math.max(0, balanceDue)));
  const [method, setMethod] = useState<PaymentMethod>("CASH" as PaymentMethod);
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  // Reset when invoice changes
  const [prevInvoiceId, setPrevInvoiceId] = useState(invoice.id);
  if (invoice.id !== prevInvoiceId) {
    setPrevInvoiceId(invoice.id);
    const newBalance = (invoice.total || 0) - (invoice.payments?.reduce((sum, p) => sum + (p.amount || 0), 0) || 0);
    setAmount(String(Math.max(0, newBalance)));
    setMethod("CASH" as PaymentMethod);
    setReference("");
    setNotes("");
    setError("");
    setSuccess(false);
  }

  const handleProcessPayment = async () => {
    const payAmount = parseFloat(amount);
    if (!payAmount || payAmount <= 0) {
      setError("Enter a valid payment amount");
      return;
    }
    if (payAmount > balanceDue + 0.01) {
      setError(`Amount exceeds balance due (${formatCurrency(balanceDue)})`);
      return;
    }
    setError("");

    try {
      await recordPayment.mutateAsync({
        invoiceId: invoice.id,
        amount: payAmount,
        method: method as string,
        reference: reference.trim() || undefined,
        status: "COMPLETED",
        processedById: user?.id,
        notes: notes.trim() || undefined,
      });

      emit(SystemEvents.PAYMENT_RECEIVED, {
        amount: payAmount,
        method,
        patientName: invoice.patientName,
        invoiceNumber: invoice.invoiceNumber,
      }, { patientId: invoice.patientId });

      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        onClose();
      }, 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Payment failed");
    }
  };

  const isPartial = parseFloat(amount) < balanceDue;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Process Payment"
      size="lg"
      data-id="BILL-PAYMENT"
      footer={
        success ? null : (
          <Button onClick={handleProcessPayment} disabled={recordPayment.isPending} className="w-full sm:w-auto">
            {recordPayment.isPending ? "Processing..." : isPartial ? "Record Partial Payment" : "Process Full Payment"}
          </Button>
        )
      }
    >
      {success ? (
        <div className="py-12 text-center">
          <CheckCircle className="w-16 h-16 text-emerald-500 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-stone-900">Payment Recorded</h3>
          <p className="text-sm text-stone-500 mt-1">{formatCurrency(parseFloat(amount))} received via {method.replace("_", " ")}</p>
        </div>
      ) : (
        <div className="space-y-5">
          {/* Error */}
          {error && (
            <div className="bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl px-4 py-2.5">{error}</div>
          )}

          {/* Invoice Summary */}
          <div className="bg-stone-50 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold text-stone-900">{invoice.invoiceNumber}</span>
              <Badge variant={invoiceStatusColors[invoice.status] as "success" | "warning" | "danger" | "info" | "default"} dot>
                {invoice.status}
              </Badge>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-stone-400 text-xs">Patient</span>
                <p className="text-stone-900 font-medium">{invoice.patientName}</p>
              </div>
              <div>
                <span className="text-stone-400 text-xs">Due Date</span>
                <p className="text-stone-900 font-medium">{invoice.dueDate ? formatDate(invoice.dueDate) : "—"}</p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3 mt-3 pt-3 border-t border-stone-200">
              <div>
                <span className="text-stone-400 text-xs">Total</span>
                <p className="text-stone-900 font-bold">{formatCurrency(invoice.total)}</p>
              </div>
              <div>
                <span className="text-stone-400 text-xs">Paid</span>
                <p className="text-emerald-600 font-bold">{formatCurrency(invoice.total - balanceDue)}</p>
              </div>
              <div>
                <span className="text-stone-400 text-xs">Balance Due</span>
                <p className={cn("font-bold", balanceDue > 0 ? "text-red-600" : "text-emerald-600")}>
                  {formatCurrency(balanceDue)}
                </p>
              </div>
            </div>
          </div>

          {/* Amount */}
          <div>
            <Input
              label="Payment Amount (PKR)"
              type="number"
              min={1}
              max={balanceDue}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
            {isPartial && parseFloat(amount) > 0 && (
              <p className="text-xs text-amber-600 mt-1">
                Partial payment — {formatCurrency(balanceDue - parseFloat(amount))} will remain due
              </p>
            )}
          </div>

          {/* Payment Method */}
          <div>
            <label className="text-sm font-medium text-stone-700 mb-2.5 block">Payment Method</label>
            <div className="grid grid-cols-3 gap-2.5">
              {paymentMethods.map((pm) => (
                <button
                  key={pm.id}
                  onClick={() => setMethod(pm.id)}
                  className={cn(
                    "flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all cursor-pointer",
                    method === pm.id
                      ? "border-teal-500 bg-teal-50/50 text-teal-600"
                      : "border-stone-200 bg-white text-stone-500 hover:border-stone-300"
                  )}
                >
                  {pm.icon}
                  <span className="text-xs font-medium">{pm.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Reference (for non-cash) */}
          {method !== ("CASH" as PaymentMethod) && (
            <Input
              label="Reference / Transaction ID"
              placeholder={
                method === ("CARD" as PaymentMethod) ? "Last 4 digits or approval code" :
                method === ("CHEQUE" as PaymentMethod) ? "Cheque number / bank" :
                method === ("BANK_TRANSFER" as PaymentMethod) ? "Bank transfer reference" :
                method === ("DIGITAL_WALLET" as PaymentMethod) ? "Transaction ID (JazzCash, Easypaisa, etc.)" :
                "Reference"
              }
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
          )}

          {method === ("CASH" as PaymentMethod) && (
            <div className="bg-emerald-50 text-emerald-700 p-3 rounded-xl text-sm border border-emerald-100">
              Cash payment will be recorded immediately. Ensure the amount has been received.
            </div>
          )}

          {/* Notes */}
          <Input
            label="Payment Notes (optional)"
            placeholder="Any additional notes..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
      )}
    </Modal>
  );
}
