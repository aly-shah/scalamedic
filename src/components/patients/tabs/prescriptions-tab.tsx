"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Pill, Plus, Printer, Trash2, ExternalLink, Search, Package, AlertCircle } from "lucide-react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { SlidePanel } from "@/components/ui/slide-panel";
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from "@/components/ui/table";
import { LoadingSpinner } from "@/components/ui/loading";
import { usePatientPrescriptions, useCreatePatientPrescription, useDeletePrescription } from "@/hooks/use-queries";
import { useModuleEmit } from "@/modules/core/hooks";
import { SystemEvents } from "@/modules/core/events";
import { useAuth } from "@/lib/auth-context";
import { formatDate } from "@/lib/utils";
import type { Prescription } from "@/types";

// Pharmacy product as it comes back from /api/products. Only the fields
// we surface in the typeahead are typed.
interface PharmacyItem {
  id: string;
  name: string;
  sku?: string | null;
  brand?: string | null;
  category?: string | null;
  quantity: number;
  sellPrice?: number | string;
  unit?: string | null;
}

interface RxRow {
  id: string;
  medicineName: string;
  dosage: string;
  frequency: string;
  duration: string;
  route: string;
  instructions: string;
  // When the doctor picks an item from the pharmacy typeahead we keep
  // a soft link to that product so the row can render stock info next
  // to the name. The current schema doesn't persist this — the FK is
  // available for a follow-up migration if/when we want to auto-
  // dispense from the prescription.
  productId?: string | null;
}

export function PrescriptionsTab({ patientId }: { patientId: string }) {
  const { user } = useAuth();
  const emit = useModuleEmit("MOD-PRESCRIPTION");
  const { data: response, isLoading } = usePatientPrescriptions(patientId);
  const createRx = useCreatePatientPrescription(patientId);
  const deleteRx = useDeletePrescription(patientId);

  // Pharmacy catalog feeds the medicine typeahead inside the create
  // panel. Cached under a stable key so multiple instances of this tab
  // share one fetch.
  const { data: productsResponse } = useQuery({
    queryKey: ["products", "all"],
    queryFn: () => fetch("/api/products", { credentials: "include" }).then((r) => r.json()),
  });
  const pharmacyItems = (productsResponse?.data || []) as PharmacyItem[];

  const [showCreate, setShowCreate] = useState(false);
  const [rows, setRows] = useState<RxRow[]>([]);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");

  const addRow = () => setRows((prev) => [...prev, {
    id: crypto.randomUUID(), medicineName: "", dosage: "", frequency: "", duration: "", route: "", instructions: "",
    productId: null,
  }]);

  const updateRow = (id: string, field: keyof RxRow, value: string | null) =>
    setRows((prev) => prev.map((r) => r.id === id ? { ...r, [field]: value } : r));

  const pickProduct = (rowId: string, p: PharmacyItem) => {
    setRows((prev) => prev.map((r) => r.id === rowId ? {
      ...r,
      medicineName: [p.name, p.brand].filter(Boolean).join(" — "),
      productId: p.id,
      // If a route hasn't been chosen, default Topical for skin/cleanser/
      // serum/sunscreen/moisturizer categories (the clinic's bread and
      // butter) and Oral for supplements. Doctor can still override.
      route: r.route || (
        p.category === "SUPPLEMENT" ? "Oral" :
        ["CLEANSER","MOISTURIZER","SUNSCREEN","SERUM","TREATMENT","SKIN"].includes(p.category || "") ? "Topical" :
        r.route
      ),
    } : r));
  };

  const removeRow = (id: string) => setRows((prev) => prev.filter((r) => r.id !== id));

  const handleCreate = async () => {
    const valid = rows.filter((r) => r.medicineName.trim());
    if (valid.length === 0) { setError("Add at least one medicine"); return; }
    setError("");
    try {
      await createRx.mutateAsync({
        doctorId: user?.id,
        notes: notes.trim() || undefined,
        items: valid.map((r) => ({
          medicineName: r.medicineName.trim(),
          dosage: r.dosage.trim() || undefined,
          frequency: r.frequency || undefined,
          duration: r.duration.trim() || undefined,
          route: r.route || undefined,
          instructions: r.instructions.trim() || undefined,
        })),
      });
      emit(SystemEvents.PRESCRIPTION_CREATED, {}, { patientId });
      setRows([]); setNotes(""); setShowCreate(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create prescription");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Deactivate this prescription?")) return;
    await deleteRx.mutateAsync(id);
  };

  const handlePrint = (id: string) => {
    window.open(`/api/prescriptions/${id}/print`, "_blank");
  };

  if (isLoading) return <LoadingSpinner />;

  const prescriptions = (response?.data || []) as Prescription[];

  return (
    <div data-id="PATIENT-PRESCRIPTIONS-TAB" className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Pill className="w-4 h-4 text-emerald-500" />
          <h3 className="text-sm font-semibold text-stone-900">Prescriptions ({prescriptions.length})</h3>
        </div>
        <Button size="sm" iconLeft={<Plus className="w-3.5 h-3.5" />} onClick={() => { setShowCreate(true); if (rows.length === 0) addRow(); }}>
          New Prescription
        </Button>
      </div>

      {/* List */}
      {prescriptions.length > 0 ? (
        prescriptions.map((rx) => (
          <Card key={rx.id} padding="md">
            <CardHeader>
              <div className="flex items-center justify-between w-full">
                <div className="flex items-center gap-2">
                  <Pill className="w-4 h-4 text-emerald-500" />
                  <h3 className="text-sm font-semibold text-stone-900">
                    {formatDate(rx.createdAt)}
                  </h3>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="info">{rx.doctorName}</Badge>
                  {rx.appointmentId && (
                    <Badge variant="default">
                      <ExternalLink className="w-2.5 h-2.5 mr-1" />
                      Linked
                    </Badge>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => handlePrint(rx.id)} title="Print prescription">
                    <Printer className="w-3.5 h-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" className="text-red-400 hover:text-red-600" onClick={() => handleDelete(rx.id)} title="Deactivate">
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Medicine</TableHead>
                    <TableHead>Dosage</TableHead>
                    <TableHead>Frequency</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Instructions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rx.items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell><span className="font-medium">{item.medicineName}</span></TableCell>
                      <TableCell>{item.dosage || "—"}</TableCell>
                      <TableCell>{item.frequency || "—"}</TableCell>
                      <TableCell>{item.duration || "—"}</TableCell>
                      <TableCell><span className="text-xs text-stone-500">{item.instructions || "—"}</span></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {rx.notes && (
                <div className="px-4 py-3 border-t border-stone-200">
                  <p className="text-xs text-stone-500"><span className="font-medium">Note:</span> {rx.notes}</p>
                </div>
              )}
            </CardContent>
          </Card>
        ))
      ) : (
        <Card padding="md">
          <CardContent>
            <p className="text-sm text-stone-500 text-center py-4">No prescriptions yet</p>
          </CardContent>
        </Card>
      )}

      {/* Create Prescription Slide Panel */}
      <SlidePanel
        isOpen={showCreate}
        onClose={() => { setShowCreate(false); setRows([]); setNotes(""); setError(""); }}
        title="New Prescription"
        subtitle="Add medicines for this patient"
        width="xl"
        footer={
          <>
            <Button variant="outline" onClick={() => { setShowCreate(false); setRows([]); setNotes(""); setError(""); }}>Cancel</Button>
            <Button onClick={handleCreate} disabled={createRx.isPending || rows.filter((r) => r.medicineName.trim()).length === 0}>
              {createRx.isPending ? "Saving..." : "Save Prescription"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl px-4 py-2.5">{error}</div>
          )}

          {rows.map((row, idx) => {
            const linked = row.productId ? pharmacyItems.find((p) => p.id === row.productId) : null;
            const lowStock = linked && linked.quantity <= 5;
            const outOfStock = linked && linked.quantity === 0;
            return (
              <div key={row.id} className="bg-white rounded-xl border border-stone-200 p-4 space-y-3 shadow-sm">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-stone-400">Medicine {idx + 1}</span>
                    {linked && (
                      <Badge variant={outOfStock ? "danger" : lowStock ? "warning" : "success"} className="text-[10px] gap-1">
                        <Package className="w-2.5 h-2.5" />
                        {outOfStock ? "Out of stock" : `${linked.quantity} in stock`}
                      </Badge>
                    )}
                    {row.medicineName && !linked && (
                      <Badge variant="default" className="text-[10px]">Custom</Badge>
                    )}
                  </div>
                  <button onClick={() => removeRow(row.id)} className="p-1 text-red-400 hover:text-red-600 cursor-pointer">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                <MedicinePicker
                  value={row.medicineName}
                  linkedProductId={row.productId}
                  pharmacy={pharmacyItems}
                  onTextChange={(v) => {
                    // Free-text typing — clear the FK so the badge stops
                    // claiming a stale stock count for an unrelated string.
                    updateRow(row.id, "medicineName", v);
                    if (row.productId) updateRow(row.id, "productId", null);
                  }}
                  onPickProduct={(p) => pickProduct(row.id, p)}
                  onClearLink={() => updateRow(row.id, "productId", null)}
                />

                <div className="grid grid-cols-2 gap-3">
                  <Input label="Dosage" placeholder="e.g. Apply thin layer" value={row.dosage} onChange={(e) => updateRow(row.id, "dosage", e.target.value)} />
                  <Select label="Frequency" placeholder="Select" value={row.frequency} onChange={(e) => updateRow(row.id, "frequency", e.target.value)}
                    options={[
                      { value: "OD", label: "OD — Once daily" },
                      { value: "BD", label: "BD — Twice daily" },
                      { value: "TDS", label: "TDS — Three times" },
                      { value: "QDS", label: "QDS — Four times" },
                      { value: "PRN", label: "PRN — As needed" },
                      { value: "STAT", label: "STAT — Immediately" },
                      { value: "HS", label: "HS — At bedtime" },
                    ]}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Input label="Duration" placeholder="e.g. 2 weeks" value={row.duration} onChange={(e) => updateRow(row.id, "duration", e.target.value)} />
                  <Select label="Route" placeholder="Select" value={row.route} onChange={(e) => updateRow(row.id, "route", e.target.value)}
                    options={[
                      { value: "Topical", label: "Topical" },
                      { value: "Oral", label: "Oral" },
                      { value: "Injection", label: "Injection" },
                      { value: "Inhalation", label: "Inhalation" },
                      { value: "Sublingual", label: "Sublingual" },
                    ]}
                  />
                </div>
                <Input label="Instructions" placeholder="e.g. Apply at night, avoid sun" value={row.instructions} onChange={(e) => updateRow(row.id, "instructions", e.target.value)} />
              </div>
            );
          })}

          <Button variant="outline" iconLeft={<Plus className="w-3.5 h-3.5" />} onClick={addRow} className="w-full">
            Add Medicine
          </Button>

          {pharmacyItems.length === 0 && (
            <p className="text-xs text-stone-400 text-center inline-flex items-center gap-1.5 justify-center w-full">
              <AlertCircle className="w-3 h-3" />
              Pharmacy is empty — type medicines as free text. Add inventory in Pharmacy → Add Product.
            </p>
          )}

          <Input label="Prescription Notes" placeholder="Additional notes for this prescription..." value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </SlidePanel>
    </div>
  );
}

// ─── MedicinePicker ─────────────────────────────────────────────────
// Typeahead for the prescription medicine field. Shows pharmacy
// products as suggestions but lets the doctor type any free-text
// medicine name (for items not stocked or one-offs).
function MedicinePicker({
  value,
  linkedProductId,
  pharmacy,
  onTextChange,
  onPickProduct,
  onClearLink,
}: {
  value: string;
  linkedProductId?: string | null;
  pharmacy: PharmacyItem[];
  onTextChange: (v: string) => void;
  onPickProduct: (p: PharmacyItem) => void;
  onClearLink: () => void;
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

  const q = value.trim().toLowerCase();
  const matches = (q
    ? pharmacy.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.brand || "").toLowerCase().includes(q) ||
          (p.sku || "").toLowerCase().includes(q),
      )
    : pharmacy
  ).slice(0, 8);

  return (
    <div ref={wrapRef} className="relative">
      <label className="block text-xs font-medium text-stone-600 mb-1">
        Medicine Name <span className="text-red-500">*</span>
      </label>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-stone-400 pointer-events-none" />
        <input
          type="text"
          value={value}
          placeholder="Search pharmacy or type a custom medicine…"
          onFocus={() => setOpen(true)}
          onChange={(e) => { onTextChange(e.target.value); setOpen(true); }}
          className="w-full pl-9 pr-9 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
        />
        {linkedProductId && (
          <button
            type="button"
            onClick={onClearLink}
            title="Unlink pharmacy item (keep name as custom)"
            className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-stone-400 hover:text-stone-700 px-1.5 py-0.5 rounded border border-stone-200 hover:bg-stone-50"
          >
            unlink
          </button>
        )}
      </div>

      {open && pharmacy.length > 0 && (
        <div className="absolute top-full left-0 right-0 z-30 mt-1 bg-white border border-stone-200 rounded-xl shadow-lg max-h-60 overflow-y-auto">
          {matches.length === 0 ? (
            <div className="px-3 py-3 text-xs text-stone-400 text-center">
              No pharmacy match — &ldquo;{value}&rdquo; will be saved as a custom medicine.
            </div>
          ) : (
            <>
              <div className="px-3 py-1.5 bg-stone-50 border-b border-stone-100 text-[10px] uppercase tracking-wider text-stone-400 font-semibold sticky top-0">
                Pharmacy items
              </div>
              {matches.map((p) => {
                const out = p.quantity === 0;
                const low = p.quantity > 0 && p.quantity <= 5;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => { onPickProduct(p); setOpen(false); }}
                    className="w-full flex items-center justify-between gap-3 px-3 py-2 text-left hover:bg-teal-50 cursor-pointer border-b border-stone-50 last:border-b-0"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-stone-900 truncate">
                        {p.name}{p.brand ? <span className="text-stone-500 font-normal"> · {p.brand}</span> : null}
                      </p>
                      <p className="text-[10px] text-stone-400 uppercase tracking-wider">
                        {p.sku || "—"}{p.category ? ` · ${p.category.toLowerCase()}` : ""}
                      </p>
                    </div>
                    <span
                      className={
                        "text-[10px] font-semibold shrink-0 px-1.5 py-0.5 rounded " +
                        (out ? "bg-red-50 text-red-600" : low ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700")
                      }
                    >
                      {out ? "Out" : `${p.quantity} ${p.unit || "pcs"}`}
                    </span>
                  </button>
                );
              })}
            </>
          )}
        </div>
      )}
    </div>
  );
}
