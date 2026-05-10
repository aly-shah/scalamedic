"use client";

/**
 * Dispense product → patient.
 *
 * Receptionist clicks Dispense on a product card → this panel opens.
 * Patient is searched by name/phone/code (typeahead over /api/patients).
 * Receptionist sets quantity + payment mode (Pay now / Bill it / Draft)
 * + payment method when paying. On submit, /api/products/[id]/dispense
 * runs invoice + line item + optional payment + stock decrement in one
 * transaction. After success the page receives the new invoiceId so it
 * can navigate to the printable receipt (?print=1) for the thermal
 * printer.
 */

import { useEffect, useMemo, useState } from "react";
import { Loader2, CheckCircle2, AlertTriangle, Search, Printer } from "lucide-react";
import { SlidePanel } from "@/components/ui/slide-panel";
import { useFormatCurrency } from "@/hooks/use-format-currency";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Avatar } from "@/components/ui/avatar";
import { usePatients } from "@/hooks/use-queries";


type Product = {
  id: string;
  name: string;
  sellPrice: number | string;
  quantity: number;
  unit?: string | null;
};

type Patient = {
  id: string; firstName: string; lastName: string;
  phone?: string | null; patientCode?: string | null;
};

const PAYMENT_METHODS = [
  { value: "CASH", label: "Cash" },
  { value: "CARD", label: "Credit card" },
  { value: "CHEQUE", label: "Cheque" },
  { value: "BANK_TRANSFER", label: "Bank transfer" },
  { value: "DIGITAL_WALLET", label: "Digital wallet" },
];

interface Props {
  product: Product | null;
  onClose: () => void;
  /** Called with the freshly-created invoice id after a successful
   *  dispense — caller decides whether to navigate to print receipt. */
  onCompleted: (invoiceId: string) => void;
}

function num(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "string") { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; }
  return 0;
}

export function DispensePanel({ product, onClose, onCompleted }: Props) {
  const formatCurrency = useFormatCurrency();
  const [patientQuery, setPatientQuery] = useState("");
  const [patientId, setPatientId] = useState<string>("");
  const [quantity, setQuantity] = useState<string>("1");
  const [mode, setMode] = useState<"pay" | "bill" | "draft">("pay");
  const [paymentMethod, setPaymentMethod] = useState("CASH");
  const [paymentReference, setPaymentReference] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [printAfter, setPrintAfter] = useState(true);

  // Reset state every time a new product is selected.
  useEffect(() => {
    if (!product) return;
    setPatientQuery(""); setPatientId("");
    setQuantity("1"); setMode("pay");
    setPaymentMethod("CASH"); setPaymentReference("");
    setError(null); setPrintAfter(true);
  }, [product]);

  const { data: patientsRes } = usePatients(
    patientQuery.length >= 2 ? { search: patientQuery } : undefined,
  );
  const patients = ((patientsRes?.data || []) as Patient[]).slice(0, 6);
  const selected = patients.find((p) => p.id === patientId);

  const qtyNum = Math.max(1, parseInt(quantity || "1", 10) || 1);
  const unitPrice = num(product?.sellPrice);
  const total = qtyNum * unitPrice;
  const overStock = product ? qtyNum > product.quantity : false;

  async function submit() {
    if (!product) return;
    if (!patientId) { setError("Pick a patient first."); return; }
    if (overStock)  { setError(`Only ${product.quantity} in stock.`); return; }
    setSubmitting(true);
    setError(null);
    try {
      const r = await fetch(`/api/products/${product.id}/dispense`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          patientId,
          quantity: qtyNum,
          mode,
          paymentMethod: mode === "pay" ? paymentMethod : undefined,
          paymentReference: mode === "pay" && paymentReference.trim() ? paymentReference.trim() : undefined,
        }),
      });
      const d = await r.json();
      if (!d.success) throw new Error(d.error || "Failed.");
      const newId = d.data?.invoiceId as string;
      if (printAfter && newId) {
        // Pop the print page in a small window — same pattern used by
        // the receipt print buttons elsewhere; system print dialog
        // fires automatically once the receipt loads.
        window.open(`/billing/invoices/${newId}?print=1`, "_blank", "width=420,height=720,noopener=yes");
      }
      onCompleted(newId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SlidePanel
      isOpen={!!product}
      onClose={onClose}
      title="Dispense"
      subtitle={product ? `${product.name} · ${product.quantity} in stock` : undefined}
      width="md"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button onClick={submit} disabled={submitting || !patientId || overStock} iconLeft={<CheckCircle2 className="w-4 h-4" />}>
            {submitting
              ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Dispensing…</>
              : (mode === "pay" ? "Dispense & collect" : mode === "bill" ? "Dispense & bill" : "Dispense as draft")}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {error && (
          <div className="bg-red-50 border border-red-100 text-red-700 text-sm rounded-xl px-3 py-2 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /><span>{error}</span>
          </div>
        )}

        {/* Product summary */}
        <div className="bg-stone-50 rounded-xl p-3 flex items-center justify-between text-sm">
          <div>
            <p className="font-medium text-stone-900">{product?.name}</p>
            <p className="text-xs text-stone-500">
              {formatCurrency(unitPrice)}{product?.unit ? ` / ${product.unit}` : ""} · {product?.quantity} in stock
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px] text-stone-400">Total</p>
            <p className="font-mono font-bold text-base text-stone-900">{formatCurrency(total)}</p>
          </div>
        </div>

        {/* Patient picker */}
        <div>
          <p className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-2">Patient</p>
          {selected ? (
            <div className="flex items-center justify-between bg-blue-50 border border-blue-100 rounded-xl px-3 py-2.5">
              <div className="flex items-center gap-2.5">
                <Avatar name={`${selected.firstName} ${selected.lastName}`} size="sm" />
                <div>
                  <p className="text-sm font-semibold text-stone-900">{selected.firstName} {selected.lastName}</p>
                  <p className="text-[11px] text-stone-500">{selected.patientCode ?? "—"}{selected.phone ? ` · ${selected.phone}` : ""}</p>
                </div>
              </div>
              <button onClick={() => { setPatientId(""); setPatientQuery(""); }}
                className="text-xs text-red-500 hover:underline cursor-pointer">Change</button>
            </div>
          ) : (
            <div className="relative">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
                <Input className="!pl-8" placeholder="Search by name, phone, or code"
                  value={patientQuery} onChange={(e) => setPatientQuery(e.target.value)} />
              </div>
              {patientQuery.length >= 2 && patients.length > 0 && (
                <div className="absolute top-full left-0 right-0 z-30 mt-1 bg-white rounded-xl border border-stone-200 shadow-lg max-h-56 overflow-y-auto">
                  {patients.map((p) => (
                    <button key={p.id} type="button" onClick={() => { setPatientId(p.id); setPatientQuery(""); }}
                      className="w-full flex items-center gap-3 px-3 py-2 hover:bg-teal-50 cursor-pointer border-b border-stone-50 last:border-b-0 text-left">
                      <Avatar name={`${p.firstName} ${p.lastName}`} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-stone-900 truncate">{p.firstName} {p.lastName}</p>
                        <p className="text-[10px] text-stone-400 truncate">{p.patientCode ?? "—"}{p.phone ? ` · ${p.phone}` : ""}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Quantity */}
        <div>
          <p className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-2">Quantity</p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setQuantity(String(Math.max(1, qtyNum - 1)))}>−</Button>
            <Input type="number" className="!text-center font-mono" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
            <Button variant="outline" size="sm" onClick={() => setQuantity(String(qtyNum + 1))}>+</Button>
          </div>
          {overStock && product && (
            <p className="text-xs text-red-600 mt-1">Only {product.quantity} in stock.</p>
          )}
        </div>

        {/* Mode */}
        <div>
          <p className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-2">How is it being paid?</p>
          <div className="grid grid-cols-3 gap-2">
            <ModeChip active={mode === "pay"} onClick={() => setMode("pay")}>Pay now</ModeChip>
            <ModeChip active={mode === "bill"} onClick={() => setMode("bill")}>Bill it (PENDING)</ModeChip>
            <ModeChip active={mode === "draft"} onClick={() => setMode("draft")}>Save draft</ModeChip>
          </div>
        </div>

        {mode === "pay" && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-2">Method</p>
              <Select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} options={PAYMENT_METHODS} />
            </div>
            <Input label="Reference" placeholder="optional"
              value={paymentReference} onChange={(e) => setPaymentReference(e.target.value)} />
          </div>
        )}

        {/* Print toggle */}
        <label className="flex items-center gap-2 text-sm text-stone-600 cursor-pointer select-none">
          <input type="checkbox" checked={printAfter} onChange={(e) => setPrintAfter(e.target.checked)} />
          <Printer className="w-4 h-4 text-stone-400" />
          Open the receipt to print after dispensing
        </label>
      </div>
    </SlidePanel>
  );
}

function ModeChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      type="button"
      className={`px-3 py-2 rounded-xl text-xs font-medium border transition-colors cursor-pointer ${
        active ? "bg-teal-600 text-white border-teal-600 shadow-sm" : "bg-white text-stone-600 border-stone-200 hover:border-stone-300"
      }`}
    >
      {children}
    </button>
  );
}
