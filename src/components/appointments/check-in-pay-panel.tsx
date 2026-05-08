"use client";

/**
 * Check-in payment-collection panel.
 *
 * Opens when the receptionist clicks "Check In" on a patient row. Pre-fills
 * an invoice with two suggested line items:
 *   - Consultation with Dr. <name> at the doctor's set rate (User.consultationFee)
 *   - The treatment selected on the appointment, if any (basePrice)
 * Receptionist can edit prices, tweak quantities, set a discount/tax, pick
 * a payment method, and either:
 *   - Collect & mark ready  → records the payment, advances to WAITING
 *   - Skip payment          → bypass (warn-but-allow), advances to WAITING
 *   - Save as draft         → invoice with no payment, stays in CHECKED_IN
 *
 * Server (POST /api/appointments/[id]/check-in-payment) does the actual
 * transitions in one transaction.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, CheckCircle2, AlertTriangle, Plus, Trash2, ReceiptText } from "lucide-react";
import { SlidePanel } from "@/components/ui/slide-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { api } from "@/lib/api";
import { useTreatments } from "@/hooks/use-queries";
import { useQuery } from "@tanstack/react-query";
import { calcLineTax, calcInclusiveTax, rateForTaxCategory, TAX_CATEGORY_LABELS } from "@/lib/tax-rates";
import type { TaxCategory } from "@/types";

type AppointmentLite = {
  id: string;
  appointmentCode?: string;
  type?: string;
  status?: string;
  patient?: { firstName?: string; lastName?: string; patientCode?: string } | null;
  doctor?: { id: string; name: string; consultationFee?: number | string | null } | null;
  treatment?: { id: string; name: string; basePrice?: number | string | null } | null;
};

/** Per-line item type. The `kind` chip drives the typeahead's
 *  catalog source: TREATMENT searches the procedures list, PHARMACY
 *  searches the product catalog, CONSULTATION/PACKAGE are free-text. */
type LineItemKind = "CONSULTATION" | "TREATMENT" | "PHARMACY" | "PACKAGE";

type LineItem = {
  description: string;
  quantity: number;
  unitPrice: number;
  kind: LineItemKind;
  treatmentId?: string | null;
  productId?: string | null;
};

interface ProductRow {
  id: string;
  name: string;
  sku?: string | null;
  brand?: string | null;
  sellPrice: number | string;
  quantity: number;
}

interface Props {
  appointment: AppointmentLite | null;
  onClose: () => void;
  onCompleted: () => void;
}

const PAYMENT_METHODS = [
  { value: "CASH", label: "Cash" },
  { value: "CARD", label: "Credit card" },
  { value: "CHEQUE", label: "Cheque" },
  { value: "BANK_TRANSFER", label: "Bank transfer" },
  { value: "DIGITAL_WALLET", label: "Digital wallet" },
];

function num(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "string") {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

/** Catalog row used by the description combobox. We accept whatever
 *  shape the treatments endpoint returns and read the few fields we need. */
type TreatmentOption = {
  id: string;
  name: string;
  basePrice?: number | string | null;
  category?: string | null;
  taxCategory?: TaxCategory | null;
};

export function CheckInPayPanel({ appointment, onClose, onCompleted }: Props) {
  const [items, setItems] = useState<LineItem[]>([]);
  const [discount, setDiscount] = useState("0");
  const [paymentMethod, setPaymentMethod] = useState("CASH");
  const [paymentReference, setPaymentReference] = useState("");
  // Cheque-specific fields. All optional. Composed into paymentReference
  // on submit ("Bank: HBL · #1234 · 2026-04-28") so we don't need a
  // schema migration; the structured form is reconstructable from the
  // string for reports if we ever want to.
  const [chequeBank, setChequeBank] = useState("");
  const [chequeNumber, setChequeNumber] = useState("");
  const [chequeDate, setChequeDate] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState<"pay" | "skip" | "draft" | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Treatment catalog feeds the line-item description combobox.
  const { data: treatmentsRes } = useTreatments();
  const treatments = (treatmentsRes?.data || []) as TreatmentOption[];
  // Pharmacy catalog for the same combobox when kind=PHARMACY.
  const { data: productsRes } = useQuery({
    queryKey: ["products", "all"],
    queryFn: () => fetch("/api/products", { credentials: "include" }).then((r) => r.json()),
  });
  const products = (productsRes?.data || []) as ProductRow[];

  // True when the patient is already past initial check-in — this panel
  // is being used to record a second bill (e.g. doctor prescribed a
  // procedure mid-consultation). Different copy, no auto-seeded items,
  // server skips the appointment status transition.
  const isAdditional = !!(
    appointment?.status &&
    appointment.status !== "SCHEDULED" &&
    appointment.status !== "CONFIRMED" &&
    appointment.status !== "CHECKED_IN"
  );

  // Seed line items each time a new appointment is opened. For initial
  // check-in we pre-fill the consultation + treatment lines; for a
  // second bill we leave the list empty so the receptionist enters
  // exactly what was prescribed.
  useEffect(() => {
    if (!appointment) return;
    const seeded: LineItem[] = [];
    if (!isAdditional) {
      const docFee = num(appointment.doctor?.consultationFee);
      if (docFee > 0 || (appointment.type && appointment.type !== "PROCEDURE")) {
        seeded.push({
          description: `Consultation with ${appointment.doctor?.name || "doctor"}`,
          quantity: 1,
          unitPrice: docFee,
          kind: "CONSULTATION",
        });
      }
      if (appointment.treatment) {
        seeded.push({
          description: appointment.treatment.name,
          quantity: 1,
          unitPrice: num(appointment.treatment.basePrice),
          kind: "TREATMENT",
          treatmentId: appointment.treatment.id,
        });
      }
      if (seeded.length === 0) {
        seeded.push({ description: "Consultation", quantity: 1, unitPrice: 0, kind: "CONSULTATION" });
      }
    } else {
      // Second-bill mode — start empty so the receptionist types the
      // procedure / charge the doctor prescribed.
      seeded.push({ description: "", quantity: 1, unitPrice: 0, kind: "TREATMENT" });
    }
    setItems(seeded);
    setDiscount("0");
    setPaymentMethod("CASH");
    setPaymentReference("");
    setChequeBank("");
    setChequeNumber("");
    setChequeDate("");
    setNotes("");
    setError(null);
  }, [appointment, isAdditional]);

  // Index treatments by id for fast tax-category lookup. The catalog
  // payload already includes taxCategory (returned by /api/treatments).
  const taxCategoryById = useMemo(() => {
    const m = new Map<string, TaxCategory | null>();
    for (const t of treatments) m.set(t.id, t.taxCategory ?? null);
    return m;
  }, [treatments]);

  // Per-line tax preview — server is authoritative but we mirror its
  // logic so the receptionist sees the right total before submitting.
  // Treatment lines: unitPrice is ex-GST, tax added on top.
  // Consultation lines (no treatmentId): unitPrice is gross (inclusive
  // of the 3% GST), tax reverse-derived so the patient pays exactly
  // the figure entered.
  const linesWithTax = useMemo(() => {
    return items.map((it) => {
      const cat = it.treatmentId ? taxCategoryById.get(it.treatmentId) ?? null : null;
      const ratePct = rateForTaxCategory(cat);
      const lineGross = it.quantity * it.unitPrice;
      if (it.treatmentId) {
        const taxAmt = calcLineTax(lineGross, ratePct);
        return { ...it, lineSubtotal: lineGross, ratePct, taxAmt, cat, lineGross: lineGross + taxAmt };
      }
      const taxAmt = calcInclusiveTax(lineGross, ratePct);
      return { ...it, lineSubtotal: lineGross - taxAmt, ratePct, taxAmt, cat, lineGross };
    });
  }, [items, taxCategoryById]);

  const subtotal = useMemo(
    () => linesWithTax.reduce((acc, it) => acc + it.lineSubtotal, 0),
    [linesWithTax],
  );
  const taxAmount = useMemo(
    () => linesWithTax.reduce((acc, it) => acc + it.taxAmt, 0),
    [linesWithTax],
  );
  const grossSum = useMemo(
    () => linesWithTax.reduce((acc, it) => acc + it.lineGross, 0),
    [linesWithTax],
  );
  const total = Math.max(0, grossSum - num(discount));

  // Group tax by category for the breakdown row. "Consultation" bucket
  // covers any line without a treatmentId (3% by definition).
  const taxBreakdown = useMemo(() => {
    const buckets = new Map<string, number>();
    for (const ln of linesWithTax) {
      if (ln.taxAmt <= 0) continue;
      const label = ln.cat ? TAX_CATEGORY_LABELS[ln.cat] : "Consultation (3%)";
      buckets.set(label, (buckets.get(label) ?? 0) + ln.taxAmt);
    }
    return Array.from(buckets.entries());
  }, [linesWithTax]);

  function setItem(idx: number, patch: Partial<LineItem>) {
    setItems((cur) => cur.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }
  function addItem() {
    setItems((cur) => [...cur, { description: "", quantity: 1, unitPrice: 0, kind: "TREATMENT" }]);
  }
  // Switch the kind chip on a row. Clears any catalog FK from the
  // old kind so a treatment-tagged row doesn't carry a treatmentId
  // after the agent picks "Pharmacy".
  function setKind(idx: number, kind: LineItemKind) {
    setItems((cur) => cur.map((it, i) => (
      i === idx ? { ...it, kind, treatmentId: null, productId: null } : it
    )));
  }
  function removeItem(idx: number) {
    setItems((cur) => cur.filter((_, i) => i !== idx));
  }

  async function submit(mode: "pay" | "skip" | "draft") {
    if (!appointment) return;
    if (mode === "pay" && total <= 0) {
      setError("Total must be greater than zero before collecting payment.");
      return;
    }
    setSubmitting(mode);
    setError(null);
    try {
      // For cheque payments we have three optional fields; serialize
      // them into paymentReference for the server (no schema change).
      let computedRef = paymentReference.trim();
      if (paymentMethod === "CHEQUE") {
        const parts: string[] = [];
        if (chequeBank.trim())   parts.push(`Bank: ${chequeBank.trim()}`);
        if (chequeNumber.trim()) parts.push(`#${chequeNumber.trim()}`);
        if (chequeDate.trim())   parts.push(chequeDate.trim());
        if (parts.length) computedRef = parts.join(" · ");
      }
      await api.appointments.checkInPayment(appointment.id, {
        mode,
        items: items.filter((it) => it.description.trim()).map((it) => ({
          description: it.description.trim(),
          quantity: it.quantity,
          unitPrice: it.unitPrice,
          treatmentId: it.treatmentId ?? null,
          productId: it.productId ?? null,
        })),
        discount: num(discount),
        // Server recomputes tax from each line's treatment.taxCategory;
        // we send the preview number for the audit log only.
        tax: taxAmount,
        amountPaid: mode === "pay" ? total : 0,
        paymentMethod: paymentMethod as "CASH" | "CARD" | "CHEQUE" | "BANK_TRANSFER" | "DIGITAL_WALLET" | "INSURANCE",
        paymentReference: computedRef || undefined,
        notes: notes.trim() || undefined,
      });
      onCompleted();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed.");
    } finally {
      setSubmitting(null);
    }
  }

  const patientName = appointment?.patient
    ? `${appointment.patient.firstName ?? ""} ${appointment.patient.lastName ?? ""}`.trim()
    : "";

  return (
    <SlidePanel
      isOpen={!!appointment}
      onClose={onClose}
      title={isAdditional ? "Additional bill" : "Check-in payment"}
      subtitle={
        appointment
          ? `${patientName} · ${appointment.appointmentCode ?? ""}`
          : undefined
      }
      width="lg"
      footer={
        isAdditional ? (
          <>
            <Button variant="ghost" onClick={onClose} disabled={submitting !== null}>Cancel</Button>
            <Button variant="outline" onClick={() => submit("draft")} disabled={submitting !== null}>
              {submitting === "draft" ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Saving…</> : "Save as draft"}
            </Button>
            <Button onClick={() => submit("pay")} disabled={submitting !== null || total <= 0}
              iconLeft={<CheckCircle2 className="w-4 h-4" />}>
              {submitting === "pay" ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Collecting…</> : "Collect payment"}
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={() => submit("skip")} disabled={submitting !== null}>
              {submitting === "skip" ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Skipping…</> : "Skip payment"}
            </Button>
            <Button variant="outline" onClick={() => submit("draft")} disabled={submitting !== null}>
              {submitting === "draft" ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Saving…</> : "Save as draft"}
            </Button>
            <Button onClick={() => submit("pay")} disabled={submitting !== null || total <= 0}
              iconLeft={<CheckCircle2 className="w-4 h-4" />}>
              {submitting === "pay" ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Collecting…</> : "Collect & mark ready"}
            </Button>
          </>
        )
      }
    >
      <div className="space-y-5">
        {error && (
          <div className="bg-red-50 border border-red-100 text-red-700 text-sm rounded-xl px-3 py-2 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 text-xs text-amber-900 flex items-start gap-2">
          <ReceiptText className="w-4 h-4 mt-0.5 shrink-0" />
          <span>
            {isAdditional ? (
              <>
                Patient is back at reception for an additional bill (e.g. a procedure prescribed during
                consultation). Add the line items below — the appointment status won&apos;t change.
              </>
            ) : (
              <>
                Collect payment before sending the patient to the doctor. <b>Skip payment</b> is allowed
                (insurance / write-offs etc.) but the appointment will be flagged as unpaid.
              </>
            )}
          </span>
        </div>

        {/* Line items */}
        <div>
          <p className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-2">Line items</p>
          <div className="space-y-2">
            {items.map((it, i) => (
              <div key={i} className="flex items-start gap-2 bg-white border border-stone-200 rounded-xl p-2.5">
                <div className="flex-1 space-y-2">
                  {/* Kind chips — drives the typeahead + tells the
                      server which catalog the row is from. Same set
                      as the create-invoice modal. */}
                  <div className="flex items-center gap-1 flex-wrap">
                    {(["CONSULTATION", "TREATMENT", "PHARMACY", "PACKAGE"] as const).map((k) => (
                      <button
                        key={k}
                        type="button"
                        onClick={() => setKind(i, k)}
                        className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider transition-colors cursor-pointer border ${
                          it.kind === k
                            ? "bg-teal-600 text-white border-teal-600"
                            : "bg-white text-stone-500 border-stone-200 hover:border-stone-300"
                        }`}
                      >
                        {k.toLowerCase()}
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-12 gap-2">
                    <div className="col-span-7">
                      <DescriptionCombo
                        value={it.description}
                        kind={it.kind}
                        treatments={treatments}
                        products={products}
                        onTextChange={(text) => setItem(i, { description: text, treatmentId: null, productId: null })}
                        onPickTreatment={(t) =>
                          setItem(i, {
                            description: t.name,
                            unitPrice: num(t.basePrice),
                            treatmentId: t.id,
                            productId: null,
                          })
                        }
                        onPickProduct={(p) =>
                          setItem(i, {
                            description: `${p.name}${p.brand ? ` (${p.brand})` : ""}`,
                            unitPrice: num(p.sellPrice),
                            productId: p.id,
                            treatmentId: null,
                          })
                        }
                      />
                    </div>
                    <div className="col-span-2">
                      <Input
                        type="number"
                        placeholder="Qty"
                        value={String(it.quantity)}
                        onChange={(e) => setItem(i, { quantity: Math.max(1, parseInt(e.target.value || "1", 10)) })}
                      />
                    </div>
                    <div className="col-span-3">
                      <Input
                        type="number"
                        placeholder="Price (Rs.)"
                        value={String(it.unitPrice)}
                        onChange={(e) => setItem(i, { unitPrice: num(e.target.value) })}
                      />
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => removeItem(i)}
                  className="p-2 rounded-lg text-stone-400 hover:text-red-600 hover:bg-red-50 cursor-pointer"
                  title="Remove item"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
          <button
            onClick={addItem}
            className="mt-2 flex items-center gap-1.5 text-xs text-teal-600 hover:text-teal-700 font-medium cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" /> Add line item
          </button>
        </div>

        {/* Totals */}
        <div className="bg-stone-50 border border-stone-200 rounded-xl p-4 space-y-2 text-sm">
          <div className="flex justify-between text-stone-600">
            <span>Subtotal</span>
            <span className="font-mono">Rs. {subtotal.toLocaleString()}</span>
          </div>
          <div className="flex justify-between items-center text-stone-600">
            <span>Discount</span>
            <Input className="!w-24 text-right" value={discount} onChange={(e) => setDiscount(e.target.value)} type="number" />
          </div>
          {/* Tax is auto-computed from each line's treatment.taxCategory
              (3% medical / 8% cosmetic / 8% slimming) — consultation
              lines default to 3%. The receptionist can't override; if a
              rate is wrong, fix the treatment's tax category. */}
          <div>
            <div className="flex justify-between text-stone-600">
              <span>Tax</span>
              <span className="font-mono">Rs. {taxAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
            </div>
            {taxBreakdown.length > 0 && (
              <div className="mt-1 ml-3 text-[11px] text-stone-400 space-y-0.5">
                {taxBreakdown.map(([label, amt]) => (
                  <div key={label} className="flex justify-between">
                    <span>{label}</span>
                    <span className="font-mono">Rs. {amt.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="flex justify-between text-base font-bold text-stone-900 pt-2 border-t border-stone-200">
            <span>Total</span>
            <span className="font-mono">Rs. {total.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
          </div>
        </div>

        {/* Payment method */}
        <div>
          <p className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-2">Payment method</p>
          <Select
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value)}
            options={PAYMENT_METHODS}
          />
        </div>

        {/* Cheque-specific (all optional). Replaces the generic Reference
            field when CHEQUE is the chosen method so the receptionist
            doesn't have to cram bank + number + date into one box. */}
        {paymentMethod === "CHEQUE" ? (
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <p className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-2">Bank name (optional)</p>
              <Input placeholder="e.g. HBL" value={chequeBank} onChange={(e) => setChequeBank(e.target.value)} />
            </div>
            <div>
              <p className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-2">Cheque number (optional)</p>
              <Input placeholder="e.g. 1234567" value={chequeNumber} onChange={(e) => setChequeNumber(e.target.value)} />
            </div>
            <div>
              <p className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-2">Cheque date (optional)</p>
              <Input type="date" value={chequeDate} onChange={(e) => setChequeDate(e.target.value)} />
            </div>
          </div>
        ) : (
          <div>
            <p className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-2">Reference (optional)</p>
            <Input
              placeholder="Receipt / txn id"
              value={paymentReference}
              onChange={(e) => setPaymentReference(e.target.value)}
            />
          </div>
        )}

        <div>
          <p className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-2">Notes</p>
          <Input
            placeholder="Any note for this invoice"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
      </div>
    </SlidePanel>
  );
}

/**
 * Inline typeahead for the line-item description. The visible
 * dropdown adapts to the row's `kind` chip:
 *   TREATMENT → searches the treatments catalog (name / category)
 *   PHARMACY  → searches the product catalog (name / sku / brand,
 *               with stock + sell price)
 *   else      → free-text only (no dropdown)
 */
function DescriptionCombo({
  value,
  kind,
  treatments,
  products,
  onTextChange,
  onPickTreatment,
  onPickProduct,
}: {
  value: string;
  kind: LineItemKind;
  treatments: TreatmentOption[];
  products: ProductRow[];
  onTextChange: (text: string) => void;
  onPickTreatment: (t: TreatmentOption) => void;
  onPickProduct: (p: ProductRow) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const treatmentMatches = useMemo(() => {
    if (kind !== "TREATMENT") return [];
    const q = value.trim().toLowerCase();
    if (!q) return treatments.slice(0, 8);
    return treatments
      .filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          (t.category ?? "").toLowerCase().includes(q),
      )
      .slice(0, 8);
  }, [value, treatments, kind]);

  const productMatches = useMemo(() => {
    if (kind !== "PHARMACY") return [];
    const q = value.trim().toLowerCase();
    if (!q) return products.slice(0, 8);
    return products
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.sku || "").toLowerCase().includes(q) ||
          (p.brand || "").toLowerCase().includes(q),
      )
      .slice(0, 8);
  }, [value, products, kind]);

  const showDropdown = open && (treatmentMatches.length > 0 || productMatches.length > 0);
  const placeholder =
    kind === "TREATMENT" ? "Search a treatment or type any description" :
    kind === "PHARMACY" ? "Search a pharmacy item by name / SKU / brand" :
    kind === "PACKAGE" ? "Package description" :
    "Item description";

  return (
    <div ref={wrapRef} className="relative">
      <Input
        placeholder={placeholder}
        value={value}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          onTextChange(e.target.value);
          setOpen(true);
        }}
      />
      {showDropdown && (
        <div className="absolute top-full left-0 right-0 z-30 mt-1 bg-white border border-stone-200 rounded-xl shadow-lg max-h-56 overflow-y-auto">
          {treatmentMatches.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => { onPickTreatment(t); setOpen(false); }}
              className="w-full flex items-center justify-between gap-3 px-3 py-2 text-left hover:bg-teal-50 cursor-pointer border-b border-stone-50 last:border-b-0"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-stone-900 truncate">{t.name}</p>
                {t.category && <p className="text-[10px] text-stone-400 uppercase tracking-wider">{t.category}</p>}
              </div>
              <span className="text-xs font-mono text-stone-500 shrink-0">
                Rs. {Number(t.basePrice ?? 0).toLocaleString()}
              </span>
            </button>
          ))}
          {productMatches.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => { onPickProduct(p); setOpen(false); }}
              className="w-full flex items-center justify-between gap-3 px-3 py-2 text-left hover:bg-teal-50 cursor-pointer border-b border-stone-50 last:border-b-0"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-stone-900 truncate">
                  {p.name}{p.brand ? ` · ${p.brand}` : ""}
                </p>
                <p className="text-[10px] text-stone-400 uppercase tracking-wider">
                  {p.sku || "—"} · stock {p.quantity}
                </p>
              </div>
              <span className="text-xs font-mono text-stone-500 shrink-0">
                Rs. {Number(p.sellPrice ?? 0).toLocaleString()}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
