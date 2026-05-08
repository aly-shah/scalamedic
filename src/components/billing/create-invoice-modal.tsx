"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Trash2, User, Calendar, Receipt } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import {
  Button,
  Input,
  Select,
} from "@/components/ui";
import { SlidePanel } from "@/components/ui/slide-panel";
import { usePatients, useAppointments, useCreateInvoice, useTreatments } from "@/hooks/use-queries";
import type { Patient, Appointment, TaxCategory } from "@/types";
import { formatCurrency } from "@/lib/utils";
import { calcLineTax, calcInclusiveTax, rateForTaxCategory, TAX_CATEGORY_LABELS } from "@/lib/tax-rates";
import { useModuleEmit } from "@/modules/core/hooks";
import { SystemEvents } from "@/modules/core/events";

interface LineItem {
  id: string;
  description: string;
  type: string; // CONSULTATION | PROCEDURE | PRODUCT | PACKAGE — drives the typeahead behaviour below
  quantity: number;
  unitPrice: number;
  total: number;
  treatmentId?: string | null;
  productId?: string | null;
}

interface ProductRow {
  id: string;
  name: string;
  sku?: string | null;
  brand?: string | null;
  sellPrice: number | string;
  quantity: number; // current stock
}

interface CreateInvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Optional pre-fill — used by the patient profile page so opening
   *  the modal already has the patient selected and the appointment
   *  picker scoped to their visits. */
  preselectedPatientId?: string;
}

export function CreateInvoiceModal({ isOpen, onClose, preselectedPatientId }: CreateInvoiceModalProps) {
  const emit = useModuleEmit("MOD-BILLING");
  const { data: patientsResponse } = usePatients();
  const allPatients = (patientsResponse?.data || []) as Patient[];
  const { data: appointmentsResponse } = useAppointments();
  const allAppointments = (appointmentsResponse?.data || []) as Appointment[];
  const { data: treatmentsResponse } = useTreatments();
  const allTreatments = (treatmentsResponse?.data || []) as Array<{
    id: string; name: string; basePrice?: number | string | null; taxCategory?: TaxCategory | null;
  }>;
  // Pharmacy catalog feeds the line-item typeahead when type=PRODUCT.
  const { data: productsResponse } = useQuery({
    queryKey: ["products", "all"],
    queryFn: () => fetch("/api/products", { credentials: "include" }).then((r) => r.json()),
  });
  const allProducts = (productsResponse?.data || []) as ProductRow[];
  const createInvoice = useCreateInvoice();

  // State first (declaration order matters — effects below reference these setters)
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [patientId, setPatientId] = useState(preselectedPatientId || "");

  // Re-apply the prefill on each (re-)open. Tracked the same way as
  // CreateAppointmentModal — guard via the open + preselected key so
  // the patient picker doesn't clobber a manual choice mid-edit.
  const [appliedKey, setAppliedKey] = useState("");
  const currentKey = isOpen ? `open-${preselectedPatientId || "none"}` : "closed";
  if (currentKey !== appliedKey) {
    setAppliedKey(currentKey);
    if (isOpen && preselectedPatientId) {
      setPatientId(preselectedPatientId);
    }
  }
  const [appointmentId, setAppointmentId] = useState("");
  const [discountValue, setDiscountValue] = useState(0);
  const [discountType, setDiscountType] = useState<"PERCENTAGE" | "FIXED">("FIXED");
  // Payment-on-create. Defaults to "collect now" with method=CASH so
  // the common case (cash sale at the counter) is one click. Toggle
  // off for hold-as-draft / pay-later flows.
  const [collectNow, setCollectNow] = useState(true);
  const [paymentMethod, setPaymentMethod] = useState<"CASH" | "CARD" | "CHEQUE" | "BANK_TRANSFER" | "DIGITAL_WALLET">("CASH");
  const [paymentReference, setPaymentReference] = useState("");
  const [amountPaidOverride, setAmountPaidOverride] = useState<string>("");

  // Current session user (for createdById). /api/auth/me returns
  // { user, tenant } since v36 (tenant resolution).
  useEffect(() => {
    fetch("/api/auth/me", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => { if (d.success && d.data?.user?.id) setCurrentUserId(d.data.user.id); })
      .catch(() => {});
  }, []);

  const [items, setItems] = useState<LineItem[]>([
    { id: "1", description: "", type: "CONSULTATION", quantity: 1, unitPrice: 0, total: 0 },
  ]);

  const addItem = () => {
    setItems([
      ...items,
      {
        id: Date.now().toString(),
        description: "",
        type: "CONSULTATION",
        quantity: 1,
        unitPrice: 0,
        total: 0,
      },
    ]);
  };

  const removeItem = (id: string) => {
    if (items.length > 1) {
      setItems(items.filter((item) => item.id !== id));
    }
  };

  const updateItem = (id: string, field: keyof LineItem, value: string | number) => {
    setItems(
      items.map((item) => {
        if (item.id === id) {
          const updated = { ...item, [field]: value };
          // Switching the Type column drops any catalog FK from the
          // old type — a procedure-treatment row shouldn't carry a
          // treatmentId once the agent says "actually that's a
          // product". Description is left alone so the agent doesn't
          // lose typed text.
          if (field === "type") {
            updated.treatmentId = null;
            updated.productId = null;
          }
          if (field === "quantity" || field === "unitPrice") {
            updated.total = updated.quantity * updated.unitPrice;
          }
          return updated;
        }
        return item;
      })
    );
  };

  // Apply a pick from the typeahead to the row: description, price,
  // and the right FK (treatment vs product). Total recomputes.
  const pickCatalog = (
    id: string,
    pick:
      | { kind: "treatment"; row: { id: string; name: string; basePrice?: number | string | null } }
      | { kind: "product"; row: ProductRow },
  ) => {
    setItems((cur) => cur.map((item) => {
      if (item.id !== id) return item;
      const isTreatment = pick.kind === "treatment";
      const price = isTreatment
        ? Number(pick.row.basePrice ?? 0)
        : Number((pick.row as ProductRow).sellPrice ?? 0);
      const description = isTreatment
        ? pick.row.name
        : `${pick.row.name}${(pick.row as ProductRow).brand ? ` (${(pick.row as ProductRow).brand})` : ""}`;
      return {
        ...item,
        description,
        unitPrice: price,
        total: item.quantity * price,
        treatmentId: isTreatment ? pick.row.id : null,
        productId: isTreatment ? null : pick.row.id,
      };
    }));
  };

  const taxCategoryById = useMemo(() => {
    const m = new Map<string, TaxCategory | null>();
    for (const t of allTreatments) m.set(t.id, t.taxCategory ?? null);
    return m;
  }, [allTreatments]);

  // Per-line tax preview — same logic as the server's authoritative
  // calculation. Treatment lines: unitPrice ex-GST, tax added on top.
  // Consultation / manual lines (no treatmentId): unitPrice gross,
  // 3% GST embedded.
  const linesWithTax = useMemo(() => {
    return items.map((it) => {
      const cat = it.treatmentId ? taxCategoryById.get(it.treatmentId) ?? null : null;
      const ratePct = rateForTaxCategory(cat);
      const lineGross = it.quantity * it.unitPrice;
      if (it.treatmentId) {
        const taxAmt = calcLineTax(lineGross, ratePct);
        return { ...it, lineSubtotal: lineGross, taxAmt, cat, lineGross: lineGross + taxAmt };
      }
      const taxAmt = calcInclusiveTax(lineGross, ratePct);
      return { ...it, lineSubtotal: lineGross - taxAmt, taxAmt, cat, lineGross };
    });
  }, [items, taxCategoryById]);

  const subtotal = linesWithTax.reduce((sum, it) => sum + it.lineSubtotal, 0);
  const grossSum = linesWithTax.reduce((sum, it) => sum + it.lineGross, 0);
  const discountAmount =
    discountType === "PERCENTAGE" ? grossSum * (discountValue / 100) : discountValue;
  const taxAmount = linesWithTax.reduce((sum, it) => sum + it.taxAmt, 0);
  const total = Math.max(0, grossSum - discountAmount);

  const taxBreakdown = useMemo(() => {
    const buckets = new Map<string, number>();
    for (const ln of linesWithTax) {
      if (ln.taxAmt <= 0) continue;
      const label = ln.cat ? TAX_CATEGORY_LABELS[ln.cat] : "Consultation (3%)";
      buckets.set(label, (buckets.get(label) ?? 0) + ln.taxAmt);
    }
    return Array.from(buckets.entries());
  }, [linesWithTax]);

  const patientAppointments = allAppointments.filter((a) => a.patientId === patientId);

  const handleSaveDraft = () => {
    onClose();
  };

  const handleCreate = async () => {
    setSubmitError(null);
    const selectedPatient = allPatients.find((p) => p.id === patientId);
    if (!selectedPatient) { setSubmitError("Select a patient"); return; }
    if (!currentUserId) { setSubmitError("Session not ready, try again in a moment"); return; }
    if (!items.some((i) => i.description.trim() && i.total > 0)) {
      setSubmitError("Add at least one line item with a price");
      return;
    }

    // The schema and API accept: patientId, appointmentId, branchId,
    // items (relational), subtotal, discount (absolute), discountType,
    // tax (absolute), total, createdById, dueDate, notes.
    const payload = {
      patientId: selectedPatient.id,
      branchId: selectedPatient.branchId,
      appointmentId: appointmentId || null,
      items: items
        .filter((i) => i.description.trim() && i.total > 0)
        .map((i) => ({
          description: i.description.trim(),
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          total: i.total,
          treatmentId: i.treatmentId ?? null,
          productId: i.productId ?? null,
        })),
      subtotal,
      discount: discountAmount,
      discountType, // server accepts PERCENTAGE or FIXED
      tax: taxAmount,
      total,
      amountPaid: collectNow
        ? (amountPaidOverride.trim() ? Math.max(0, parseFloat(amountPaidOverride) || 0) : total)
        : 0,
      balanceDue: 0, // server recomputes from total - amountPaid
      paymentMethod: collectNow ? paymentMethod : undefined,
      paymentReference: collectNow ? (paymentReference.trim() || undefined) : undefined,
      createdById: currentUserId,
    };

    try {
      await createInvoice.mutateAsync(payload);
      const patientName = `${selectedPatient.firstName} ${selectedPatient.lastName}`;
      emit(SystemEvents.INVOICE_CREATED, { patientName, total }, { patientId });
      onClose();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Could not create invoice");
    }
  };

  return (
    <SlidePanel
      isOpen={isOpen}
      onClose={onClose}
      title="Create Invoice"
      subtitle="Generate a new invoice"
      width="xl"
      data-id="BILL-CREATE"
      footer={
        <>
          <Button variant="outline" onClick={handleSaveDraft}>
            Save Draft
          </Button>
          <Button onClick={handleCreate} disabled={createInvoice.isPending}>
            {createInvoice.isPending ? "Creating…" : "Create Invoice"}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {submitError && (
          <div className="bg-red-50 border border-red-100 text-red-700 text-sm rounded-xl px-3 py-2">
            {submitError}
          </div>
        )}

        {/* ── Patient + visit ── */}
        <section>
          <div className="flex items-center gap-2 mb-2">
            <User className="w-4 h-4 text-teal-500" />
            <span className="text-xs font-semibold text-stone-400 uppercase tracking-wider">Bill to</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Select
              label="Patient"
              required
              options={allPatients.map((p) => ({
                value: p.id,
                label: `${p.firstName} ${p.lastName} (${p.patientCode})`,
              }))}
              placeholder="Select patient"
              value={patientId}
              onChange={(e) => {
                setPatientId(e.target.value);
                setAppointmentId("");
              }}
            />
            <Select
              label="Linked appointment (optional)"
              options={patientAppointments.map((a) => ({
                value: a.id,
                label: `${a.appointmentCode} · ${a.date} ${a.startTime}`,
              }))}
              placeholder={patientId ? "Select appointment" : "Pick a patient first"}
              value={appointmentId}
              onChange={(e) => setAppointmentId(e.target.value)}
            />
          </div>
        </section>

        {/* ── Line items ── */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Receipt className="w-4 h-4 text-fuchsia-500" />
              <span className="text-xs font-semibold text-stone-400 uppercase tracking-wider">Line items</span>
            </div>
            <Button variant="ghost" size="sm" iconLeft={<Plus className="w-3.5 h-3.5" />} onClick={addItem}>
              Add row
            </Button>
          </div>

          <div className="space-y-2">
            {items.map((item, idx) => {
              const lineTotal = item.quantity * item.unitPrice;
              return (
                <div
                  key={item.id}
                  className="bg-white border border-stone-200 rounded-xl p-3 space-y-2.5"
                >
                  {/* Kind chips — same UX as the CheckInPayPanel.
                      Drives the typeahead's catalog source. */}
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {([
                        { v: "CONSULTATION", l: "Consultation" },
                        { v: "PROCEDURE",    l: "Treatment" },
                        { v: "PRODUCT",      l: "Pharmacy" },
                        { v: "PACKAGE",      l: "Package" },
                      ] as const).map((opt) => {
                        const active = item.type === opt.v;
                        return (
                          <button
                            key={opt.v}
                            type="button"
                            onClick={() => updateItem(item.id, "type", opt.v)}
                            className={`px-2.5 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider transition-colors cursor-pointer border ${
                              active
                                ? "bg-teal-600 text-white border-teal-600"
                                : "bg-white text-stone-500 border-stone-200 hover:border-stone-300"
                            }`}
                          >
                            {opt.l}
                          </button>
                        );
                      })}
                    </div>
                    <button
                      onClick={() => removeItem(item.id)}
                      disabled={items.length === 1}
                      className="p-1.5 rounded-lg text-stone-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                      title={items.length === 1 ? "At least one row required" : "Remove this row"}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Description (typeahead) — full width */}
                  <ItemDescriptionInput
                    value={item.description}
                    type={item.type}
                    treatments={allTreatments}
                    products={allProducts}
                    onTextChange={(text) => updateItem(item.id, "description", text)}
                    onPickTreatment={(t) => pickCatalog(item.id, { kind: "treatment", row: t })}
                    onPickProduct={(p) => pickCatalog(item.id, { kind: "product", row: p })}
                  />

                  {/* Qty / Unit price / Line total */}
                  <div className="grid grid-cols-3 gap-2">
                    <label className="text-xs text-stone-500">
                      <span className="block mb-1 uppercase tracking-wider text-[10px] font-semibold">Qty</span>
                      <input
                        type="number"
                        min={1}
                        value={item.quantity}
                        onChange={(e) => updateItem(item.id, "quantity", parseInt(e.target.value) || 0)}
                        className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                      />
                    </label>
                    <label className="text-xs text-stone-500">
                      <span className="block mb-1 uppercase tracking-wider text-[10px] font-semibold">Unit price</span>
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        value={item.unitPrice}
                        onChange={(e) => updateItem(item.id, "unitPrice", parseFloat(e.target.value) || 0)}
                        className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                      />
                    </label>
                    <div className="text-xs text-stone-500">
                      <span className="block mb-1 uppercase tracking-wider text-[10px] font-semibold">Line total</span>
                      <p className="px-3 py-2 text-sm font-semibold text-stone-900 bg-stone-50 rounded-lg">
                        {formatCurrency(lineTotal)}
                      </p>
                    </div>
                  </div>
                  {idx === 0 && items.length === 1 && !item.description.trim() && (
                    <p className="text-[11px] text-stone-400">
                      Tip: pick <b>Treatment</b> or <b>Pharmacy</b> to search the catalog by name.
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* ── Payment ── */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-emerald-500" />
              <span className="text-xs font-semibold text-stone-400 uppercase tracking-wider">Payment</span>
            </div>
            <label className="inline-flex items-center gap-2 cursor-pointer text-xs">
              <input
                type="checkbox"
                checked={collectNow}
                onChange={(e) => setCollectNow(e.target.checked)}
                className="w-4 h-4 rounded border-stone-300 text-teal-600 focus:ring-teal-500 cursor-pointer"
              />
              <span className="font-medium text-stone-700">Collect payment now</span>
            </label>
          </div>
          {collectNow ? (
            <div className="bg-emerald-50/40 border border-emerald-100 rounded-xl p-3 space-y-2.5">
              <div className="grid grid-cols-2 gap-3">
                <label className="text-xs text-stone-500">
                  <span className="block mb-1 uppercase tracking-wider text-[10px] font-semibold">Amount paid</span>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    placeholder={String(total)}
                    value={amountPaidOverride}
                    onChange={(e) => setAmountPaidOverride(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                  <span className="block mt-1 text-[10px] text-stone-400">
                    Leave blank to mark as paid in full ({formatCurrency(total)})
                  </span>
                </label>
                <label className="text-xs text-stone-500">
                  <span className="block mb-1 uppercase tracking-wider text-[10px] font-semibold">Method</span>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value as "CASH" | "CARD" | "CHEQUE" | "BANK_TRANSFER" | "DIGITAL_WALLET")}
                    className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 cursor-pointer appearance-none"
                  >
                    <option value="CASH">Cash</option>
                    <option value="CARD">Card</option>
                    <option value="CHEQUE">Cheque</option>
                    <option value="BANK_TRANSFER">Bank transfer</option>
                    <option value="DIGITAL_WALLET">Digital wallet</option>
                  </select>
                </label>
              </div>
              <label className="text-xs text-stone-500 block">
                <span className="block mb-1 uppercase tracking-wider text-[10px] font-semibold">Reference (optional)</span>
                <input
                  type="text"
                  placeholder="Receipt # / txn id / cheque no."
                  value={paymentReference}
                  onChange={(e) => setPaymentReference(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </label>
            </div>
          ) : (
            <div className="bg-amber-50/60 border border-amber-100 rounded-xl p-3 text-xs text-amber-800">
              Invoice will be saved as <b>Pending</b> with no payment recorded. The patient can pay later from the billing list.
            </div>
          )}
        </section>

        {/* ── Totals strip ── */}
        <section className="bg-stone-50 border border-stone-200 rounded-xl p-4">
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-stone-500">Subtotal</span>
              <span className="text-stone-900 font-mono">{formatCurrency(subtotal)}</span>
            </div>

            <div className="flex items-center justify-between gap-3">
              <span className="text-stone-500">Discount</span>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  value={discountValue}
                  onChange={(e) => setDiscountValue(parseFloat(e.target.value) || 0)}
                  className="w-20 px-2 py-1.5 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
                <select
                  value={discountType}
                  onChange={(e) => setDiscountType(e.target.value as "PERCENTAGE" | "FIXED")}
                  className="px-2 py-1.5 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 appearance-none cursor-pointer"
                >
                  <option value="FIXED">Rs.</option>
                  <option value="PERCENTAGE">%</option>
                </select>
                <span className="text-stone-700 font-mono min-w-[80px] text-right">
                  −{formatCurrency(discountAmount)}
                </span>
              </div>
            </div>

            {taxAmount > 0 && (
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-stone-500">GST</span>
                  <span className="text-stone-700 font-mono">+{formatCurrency(taxAmount)}</span>
                </div>
                {taxBreakdown.length > 0 && (
                  <div className="mt-1 ml-3 text-[11px] text-stone-400 space-y-0.5">
                    {taxBreakdown.map(([label, amt]) => (
                      <div key={label} className="flex justify-between">
                        <span>{label}</span>
                        <span className="font-mono">+{formatCurrency(amt)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="flex items-baseline justify-between border-t border-stone-200 pt-2.5 mt-1">
              <span className="font-bold text-stone-900 inline-flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-stone-400" />
                Total
              </span>
              <span className="text-2xl font-bold text-stone-900 font-mono">{formatCurrency(total)}</span>
            </div>
          </div>
        </section>
      </div>
    </SlidePanel>
  );
}

/**
 * Inline typeahead for the line-item description column. Behavior
 * depends on the row's Type:
 *
 *   PROCEDURE  → search the treatments catalog
 *   PRODUCT    → search the pharmacy catalog (with stock + sku)
 *   anything   → free-text only (no dropdown)
 *
 * Picking an item fires onPickTreatment / onPickProduct, which sets
 * description + price + the matching FK on the line item.
 */
function ItemDescriptionInput({
  value,
  type,
  treatments,
  products,
  onTextChange,
  onPickTreatment,
  onPickProduct,
}: {
  value: string;
  type: string;
  treatments: Array<{ id: string; name: string; basePrice?: number | string | null }>;
  products: Array<{ id: string; name: string; sku?: string | null; brand?: string | null; sellPrice: number | string; quantity: number }>;
  onTextChange: (text: string) => void;
  onPickTreatment: (t: { id: string; name: string; basePrice?: number | string | null }) => void;
  onPickProduct: (p: { id: string; name: string; sku?: string | null; brand?: string | null; sellPrice: number | string; quantity: number }) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const isTreatmentMode = type === "PROCEDURE";
  const isProductMode = type === "PRODUCT";
  const showDropdown = open && (isTreatmentMode || isProductMode);

  const q = value.trim().toLowerCase();
  const treatmentMatches = isTreatmentMode
    ? (q ? treatments.filter((t) => t.name.toLowerCase().includes(q)) : treatments).slice(0, 8)
    : [];
  const productMatches = isProductMode
    ? (q
        ? products.filter(
            (p) =>
              p.name.toLowerCase().includes(q) ||
              (p.sku || "").toLowerCase().includes(q) ||
              (p.brand || "").toLowerCase().includes(q),
          )
        : products
      ).slice(0, 8)
    : [];

  return (
    <div ref={wrapRef} className="relative">
      <input
        type="text"
        value={value}
        placeholder={
          isTreatmentMode ? "Search a treatment…" :
          isProductMode ? "Search a pharmacy item…" :
          "Item description"
        }
        onFocus={() => setOpen(true)}
        onChange={(e) => { onTextChange(e.target.value); setOpen(true); }}
        className="w-full px-2 py-1 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4318FF]"
      />
      {showDropdown && (treatmentMatches.length + productMatches.length > 0) && (
        <div className="absolute top-full left-0 right-0 z-30 mt-1 bg-white border border-stone-200 rounded-xl shadow-lg max-h-56 overflow-y-auto">
          {treatmentMatches.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => { onPickTreatment(t); setOpen(false); }}
              className="w-full flex items-center justify-between gap-3 px-3 py-2 text-left hover:bg-teal-50 cursor-pointer border-b border-stone-50 last:border-b-0"
            >
              <p className="text-sm font-medium text-stone-900 truncate">{t.name}</p>
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
