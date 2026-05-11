"use client";

import { useMemo, useState } from "react";
import {
  Package, Plus, AlertTriangle, Pill, TrendingDown, CalendarClock,
  LayoutGrid, List as ListIcon, Pencil, Trash2, Minus, ArrowUpDown,
  Loader2, X, BadgeAlert, Send, Sparkles,
} from "lucide-react";
import { DispensePanel } from "@/components/pharmacy/dispense-panel";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { SearchInput } from "@/components/ui/search-input";
import { SlidePanel } from "@/components/ui/slide-panel";
import { LoadingSpinner } from "@/components/ui/loading";
import { useModuleAccess } from "@/modules/core/hooks";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";
import { useFormatCurrency } from "@/hooks/use-format-currency";

// ---------- Types ----------
type Product = {
  id: string;
  name: string;
  sku?: string | null;
  barcode?: string | null;
  brand?: string | null;
  category: string;
  description?: string | null;
  costPrice: string | number;
  sellPrice: string | number;
  quantity: number;
  reorderLevel: number;
  unit?: string | null;
  expiryDate?: string | null;
  branchId: string;
  branch?: { id: string; name: string } | null;
};
type Stats = { total?: number; lowStock?: number; outOfStock?: number; expiringSoon?: number; expired?: number; totalValue?: number };
type QuickFilter = "all" | "low" | "out" | "expiring";

// ---------- Catalog constants ----------
const CATEGORIES = [
  { value: "CLEANSER", label: "Cleanser" },
  { value: "MOISTURIZER", label: "Moisturizer" },
  { value: "SUNSCREEN", label: "Sunscreen" },
  { value: "SERUM", label: "Serum" },
  { value: "TREATMENT", label: "Treatment" },
  { value: "SUPPLEMENT", label: "Supplement" },
  { value: "HAIR", label: "Hair" },
  { value: "SKIN", label: "Skin" },
  { value: "TOOL", label: "Tool" },
  { value: "OTHER", label: "Other" },
];
const emptyForm = {
  name: "", sku: "", barcode: "", brand: "", category: "OTHER",
  description: "", sellPrice: "", costPrice: "", quantity: "0",
  reorderLevel: "5", unit: "", expiryDate: "",
};

// ---------- Helpers ----------
const num = (v: unknown): number => {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "string") { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; }
  return 0;
};
function daysUntil(date?: string | null): number | null {
  if (!date) return null;
  const ms = new Date(date).getTime() - Date.now();
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
}
function expiryChip(date?: string | null) {
  const d = daysUntil(date);
  if (d == null) return null;
  if (d < 0)   return { label: `Expired ${-d}d ago`, cls: "bg-red-100 text-red-700 border-red-200" };
  if (d <= 7)  return { label: `Expires in ${d}d`,    cls: "bg-red-50 text-red-700 border-red-100" };
  if (d <= 30) return { label: `Expires in ${d}d`,    cls: "bg-amber-50 text-amber-700 border-amber-100" };
  return null;
}
function stockChip(qty: number, reorder: number) {
  if (qty === 0)         return { label: "Out of stock", variant: "danger" as const };
  if (qty <= reorder)    return { label: "Low stock",    variant: "warning" as const };
  return                       { label: "In stock",     variant: "success" as const };
}

// ---------- Hooks ----------
function useProducts(params?: Record<string, string>) {
  const qs = params ? "?" + new URLSearchParams(params).toString() : "";
  return useQuery({
    queryKey: ["products", params],
    queryFn: () => fetch(`/api/products${qs}`).then((r) => r.json()),
  });
}

// ---------- Page ----------
export default function PharmacyPage() {
  const formatCurrency = useFormatCurrency();
  const access = useModuleAccess("MOD-BILLING");
  const { user } = useAuth();
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [quick, setQuick] = useState<QuickFilter>("all");
  const [view, setView] = useState<"grid" | "list">("grid");

  const [editing, setEditing] = useState<Product | null>(null);
  const [adding, setAdding] = useState(false);
  const [adjusting, setAdjusting] = useState<Product | null>(null);
  const [dispensing, setDispensing] = useState<Product | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [adjustDelta, setAdjustDelta] = useState("0");
  const [adjustReason, setAdjustReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  // AI polish for the Notes field — same pattern as the treatment
  // form. /api/admin/ai/fix-text accepts field="productNotes".
  const [fixingNotes, setFixingNotes] = useState(false);
  const [aiHint, setAiHint] = useState<string | null>(null);
  // AI fill — drafts the Notes from product name + brand + category.
  const [aiFilling, setAiFilling] = useState(false);
  const runAiFill = async () => {
    if (!form.name.trim() || aiFilling) return;
    setAiFilling(true);
    setAiHint(null);
    try {
      const r = await fetch("/api/admin/ai/product-fields", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: form.name.trim(),
          brand: form.brand,
          category: form.category,
        }),
      });
      const d = await r.json();
      if (!d.success) {
        setAiHint(d.error || "AI fill failed");
        return;
      }
      if (d.data?.error) {
        setAiHint(d.data.error);
        return;
      }
      if (d.data.notes) {
        // Non-destructive: only overwrite when there's nothing to
        // preserve, otherwise append at the bottom of any existing
        // text the admin already typed.
        setForm((f) => ({
          ...f,
          description: f.description.trim()
            ? `${f.description.trim()}\n\n${d.data.notes}`
            : d.data.notes,
        }));
        setAiHint(d.data.aiPowered === false
          ? "AI not configured. Notes left as-is."
          : "Drafted by AI — please review.");
      } else {
        setAiHint("AI returned no draft.");
      }
    } catch (e) {
      setAiHint(e instanceof Error ? e.message : "AI fill failed");
    } finally {
      setAiFilling(false);
    }
  };
  const runFixNotes = async () => {
    if (!form.description.trim() || fixingNotes) return;
    setFixingNotes(true);
    setAiHint(null);
    try {
      const r = await fetch("/api/admin/ai/fix-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          field: "productNotes",
          text: form.description,
          name: form.name.trim(),
          category: form.category,
        }),
      });
      const d = await r.json();
      if (!d.success) { setAiHint(d.error || "Polish failed"); return; }
      if (d.data?.error) { setAiHint(d.data.error); return; }
      if (typeof d.data.text === "string" && d.data.text !== form.description) {
        setForm((f) => ({ ...f, description: d.data.text }));
        setAiHint("Polished by AI — please review.");
      } else {
        setAiHint("Already clean.");
      }
    } catch (e) {
      setAiHint(e instanceof Error ? e.message : "Polish failed");
    } finally {
      setFixingNotes(false);
    }
  };

  const { data: res, isLoading } = useProducts({
    ...(search && { search }),
    ...(categoryFilter && { category: categoryFilter }),
  });
  const all = ((res?.data || []) as Product[]);
  const stats: Stats = (res?.stats || {});

  // Apply quick filters client-side so toggling between them doesn't
  // refetch (the server already returned the full set for this search).
  const products = useMemo(() => {
    return all.filter((p) => {
      if (quick === "out")      return p.quantity === 0;
      if (quick === "low")      return p.quantity > 0 && p.quantity <= p.reorderLevel;
      if (quick === "expiring") {
        const d = daysUntil(p.expiryDate);
        return d != null && d <= 30;
      }
      return true;
    });
  }, [all, quick]);

  // ---------- Mutations ----------
  const create = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      fetch("/api/products", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }).then((r) => r.json()),
    onSuccess: (d) => {
      if (!d.success) { setError(d.error || "Failed."); return; }
      qc.invalidateQueries({ queryKey: ["products"] });
      setAdding(false); setForm(emptyForm); setError(null);
    },
  });
  const update = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      fetch(`/api/products/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }).then((r) => r.json()),
    onSuccess: (d) => {
      if (!d.success) { setError(d.error || "Failed."); return; }
      qc.invalidateQueries({ queryKey: ["products"] });
      setEditing(null); setForm(emptyForm); setAdjusting(null); setAdjustDelta("0"); setAdjustReason(""); setError(null);
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/products/${id}`, { method: "DELETE" }).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["products"] }),
  });

  // ---------- Open helpers ----------
  function openAdd() { setForm(emptyForm); setError(null); setAdding(true); }
  function openEdit(p: Product) {
    setForm({
      name: p.name ?? "", sku: p.sku ?? "", barcode: p.barcode ?? "",
      brand: p.brand ?? "", category: p.category ?? "OTHER",
      description: p.description ?? "",
      sellPrice: String(num(p.sellPrice)), costPrice: String(num(p.costPrice)),
      quantity: String(p.quantity ?? 0), reorderLevel: String(p.reorderLevel ?? 5),
      unit: p.unit ?? "",
      expiryDate: p.expiryDate ? new Date(p.expiryDate).toISOString().slice(0, 10) : "",
    });
    setError(null);
    setEditing(p);
  }
  function openAdjust(p: Product) {
    setAdjustDelta("0"); setAdjustReason(""); setError(null); setAdjusting(p);
  }
  function openDispense(p: Product) {
    setError(null); setDispensing(p);
  }
  function closeAll() {
    setAdding(false); setEditing(null); setAdjusting(null);
    setForm(emptyForm); setAdjustDelta("0"); setAdjustReason(""); setError(null);
  }

  function submitForm() {
    if (!form.name.trim()) { setError("Name is required."); return; }
    const payload = {
      name: form.name.trim(),
      sku: form.sku.trim() || null,
      barcode: form.barcode.trim() || null,
      brand: form.brand.trim() || null,
      category: form.category,
      description: form.description.trim() || null,
      sellPrice: num(form.sellPrice),
      costPrice: num(form.costPrice),
      quantity: Math.max(0, parseInt(form.quantity || "0", 10)),
      reorderLevel: Math.max(0, parseInt(form.reorderLevel || "0", 10)),
      unit: form.unit.trim() || null,
      expiryDate: form.expiryDate || null,
      branchId: user?.branchId,
    };
    if (editing) update.mutate({ id: editing.id, data: payload });
    else create.mutate(payload);
  }
  function submitAdjust() {
    if (!adjusting) return;
    const delta = parseInt(adjustDelta || "0", 10);
    if (!Number.isFinite(delta) || delta === 0) { setError("Enter a non-zero amount."); return; }
    const next = Math.max(0, adjusting.quantity + delta);
    update.mutate({
      id: adjusting.id,
      data: { quantity: next, ...(adjustReason.trim() && { description: adjustReason.trim() }) },
    });
  }
  function deleteProduct(p: Product) {
    if (!confirm(`Remove ${p.name} from inventory? It stays on past invoices.`)) return;
    remove.mutate(p.id);
  }

  // ---------- Render ----------
  if (!access.canView) return <div className="flex items-center justify-center py-20 text-stone-500">No access.</div>;

  return (
    <div className="space-y-4 sm:space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-teal-50 flex items-center justify-center">
            <Pill className="w-5 h-5 text-teal-600" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-semibold text-stone-900">Pharmacy &amp; Inventory</h1>
            <p className="text-sm text-stone-400 mt-0.5">Stock levels, expiry tracking, dispensing</p>
          </div>
        </div>
        <Button iconLeft={<Plus className="w-4 h-4" />} onClick={openAdd}>Add product</Button>
      </div>

      {/* Stat cards (clickable filters) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
        <StatCard label="Total products" value={stats.total ?? 0} icon={<Package className="w-5 h-5" />}
          color="text-teal-600" bg="bg-teal-50" active={quick === "all"} onClick={() => setQuick("all")} />
        <StatCard label="Low stock" value={stats.lowStock ?? 0} icon={<TrendingDown className="w-5 h-5" />}
          color="text-amber-600" bg="bg-amber-50" active={quick === "low"} onClick={() => setQuick("low")} />
        <StatCard label="Out of stock" value={stats.outOfStock ?? 0} icon={<AlertTriangle className="w-5 h-5" />}
          color="text-red-600" bg="bg-red-50" active={quick === "out"} onClick={() => setQuick("out")} />
        <StatCard label="Expiring (30d)" value={(stats.expiringSoon ?? 0) + (stats.expired ?? 0)} icon={<CalendarClock className="w-5 h-5" />}
          color="text-orange-600" bg="bg-orange-50" active={quick === "expiring"} onClick={() => setQuick("expiring")} />
        <StatCard label="Stock value" value={formatCurrency(stats.totalValue ?? 0)} icon={<BadgeAlert className="w-5 h-5" />}
          color="text-violet-600" bg="bg-violet-50" />
      </div>

      {/* Filters + view toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
        <div className="flex-1 min-w-[200px]">
          <SearchInput placeholder="Search by name, SKU, brand…" value={search} onChange={setSearch} debounceMs={300} />
        </div>
        <Select placeholder="All Categories" value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          options={[{ value: "", label: "All Categories" }, ...CATEGORIES]} />
        <div className="inline-flex items-center bg-stone-100 rounded-xl p-0.5">
          <button
            onClick={() => setView("grid")}
            className={cn("p-1.5 rounded-lg cursor-pointer transition-colors",
              view === "grid" ? "bg-white text-teal-600 shadow-sm" : "text-stone-500 hover:text-stone-700")}
            title="Grid view"
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
          <button
            onClick={() => setView("list")}
            className={cn("p-1.5 rounded-lg cursor-pointer transition-colors",
              view === "list" ? "bg-white text-teal-600 shadow-sm" : "text-stone-500 hover:text-stone-700")}
            title="List view"
          >
            <ListIcon className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Active-filter chip */}
      {quick !== "all" && (
        <div className="flex items-center gap-2 text-xs">
          <span className="text-stone-500">Filtering:</span>
          <button
            onClick={() => setQuick("all")}
            className="inline-flex items-center gap-1 bg-teal-50 text-teal-700 border border-teal-100 px-2.5 py-1 rounded-full hover:bg-teal-100 cursor-pointer"
          >
            {quick === "low" && "Low stock"}
            {quick === "out" && "Out of stock"}
            {quick === "expiring" && "Expiring (≤30d)"}
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Body */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16"><LoadingSpinner size="lg" /></div>
      ) : products.length === 0 ? (
        <div className="text-center py-16">
          <Package className="w-12 h-12 text-stone-200 mx-auto mb-3" />
          <p className="text-sm text-stone-400">No products match these filters.</p>
        </div>
      ) : view === "grid" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {products.map((p) => (
            <ProductCard
              key={p.id}
              product={p}
              onEdit={() => openEdit(p)}
              onDelete={() => deleteProduct(p)}
              onAdjust={() => openAdjust(p)}
              onDispense={() => openDispense(p)}
            />
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-stone-100 overflow-hidden">
          <div className="grid grid-cols-12 px-4 py-2.5 text-[10px] font-semibold text-stone-500 uppercase tracking-wider border-b border-stone-100 bg-stone-50">
            <div className="col-span-4">Product</div>
            <div className="col-span-2">Category</div>
            <div className="col-span-2 text-right">Price</div>
            <div className="col-span-1 text-right">Stock</div>
            <div className="col-span-2">Status</div>
            <div className="col-span-1 text-right">Actions</div>
          </div>
          {products.map((p) => (
            <ProductRow
              key={p.id}
              product={p}
              onEdit={() => openEdit(p)}
              onDelete={() => deleteProduct(p)}
              onAdjust={() => openAdjust(p)}
              onDispense={() => openDispense(p)}
            />
          ))}
        </div>
      )}

      {/* Add / Edit panel */}
      <SlidePanel
        isOpen={adding || !!editing}
        onClose={closeAll}
        title={editing ? "Edit product" : "Add product"}
        subtitle={editing ? editing.name : "Add a new product to inventory"}
        width="md"
        footer={
          <>
            <Button variant="outline" onClick={closeAll}>Cancel</Button>
            <Button onClick={submitForm} disabled={create.isPending || update.isPending || !form.name.trim()}>
              {(create.isPending || update.isPending) ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Saving…</> : (editing ? "Save changes" : "Add product")}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {error && <div className="bg-red-50 border border-red-100 text-red-700 text-sm rounded-xl px-3 py-2">{error}</div>}
          <Input label="Name" required placeholder="e.g. Cetaphil Gentle Cleanser"
            value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="SKU" placeholder="e.g. CET-001"
              value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
            <Input label="Barcode" placeholder="optional"
              value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Brand" placeholder="e.g. Cetaphil"
              value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} />
            <Select label="Category" value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              options={CATEGORIES} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Sell price (PKR)" type="number"
              value={form.sellPrice} onChange={(e) => setForm({ ...form, sellPrice: e.target.value })} />
            <Input label="Cost price (PKR)" type="number"
              value={form.costPrice} onChange={(e) => setForm({ ...form, costPrice: e.target.value })} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Input label="Quantity" type="number"
              value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
            <Input label="Reorder at" type="number"
              value={form.reorderLevel} onChange={(e) => setForm({ ...form, reorderLevel: e.target.value })} />
            <Input label="Unit" placeholder="ml, tube"
              value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} />
          </div>
          <Input label="Expiry date" type="date"
            value={form.expiryDate} onChange={(e) => setForm({ ...form, expiryDate: e.target.value })} />

          {/* AI fill — drafts the Notes off the product name + brand
              + category. Disabled until Name is entered. Same violet
              card pattern as the treatment form so admins recognise
              the affordance. */}
          <div className="rounded-xl border border-dashed border-violet-300 bg-violet-50/60 p-3">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center shrink-0 shadow-sm">
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-violet-900">Let AI draft the notes</p>
                <p className="text-xs text-violet-700/80 mt-0.5 leading-snug">
                  Generates dispensing notes (usage / storage / warnings) off the name and category. Edit before saving.
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={runAiFill}
                disabled={!form.name.trim() || aiFilling}
                iconLeft={aiFilling ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              >
                {aiFilling ? "Drafting…" : "AI fill"}
              </Button>
            </div>
          </div>

          <div>
            <Textarea
              label="Notes"
              placeholder="Usage tips, dosing, storage, warnings — anything reception should see when dispensing."
              rows={3}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
            <div className="flex justify-end mt-1">
              <button
                type="button"
                onClick={runFixNotes}
                disabled={!form.description.trim() || fixingNotes}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-violet-600 hover:text-violet-800 disabled:text-stone-300 disabled:cursor-not-allowed cursor-pointer"
                title={!form.description.trim() ? "Type something first" : "Polish grammar + clarity (keeps your meaning)"}
              >
                {fixingNotes ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                {fixingNotes ? "Polishing…" : "Fix with AI"}
              </button>
            </div>
            {aiHint && (
              <p className={`mt-1 text-[11px] ${aiHint.startsWith("Polished") ? "text-emerald-700" : "text-amber-700"}`}>
                {aiHint}
              </p>
            )}
          </div>
        </div>
      </SlidePanel>

      {/* Stock-adjust panel */}
      <SlidePanel
        isOpen={!!adjusting}
        onClose={closeAll}
        title="Adjust stock"
        subtitle={adjusting ? `${adjusting.name} · current ${adjusting.quantity}` : undefined}
        width="sm"
        footer={
          <>
            <Button variant="outline" onClick={closeAll}>Cancel</Button>
            <Button onClick={submitAdjust} disabled={update.isPending}>
              {update.isPending ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Saving…</> : "Apply"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {error && <div className="bg-red-50 border border-red-100 text-red-700 text-sm rounded-xl px-3 py-2">{error}</div>}
          <p className="text-xs text-stone-500">
            Use a positive number to receive new stock, negative to write off / dispense without an invoice.
            Cataloged dispenses through invoices already deduct stock automatically.
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setAdjustDelta(String(num(adjustDelta) - 1))}>
              <Minus className="w-3 h-3" />
            </Button>
            <Input type="number" value={adjustDelta} onChange={(e) => setAdjustDelta(e.target.value)}
              className="!text-center font-mono !text-lg" />
            <Button variant="outline" size="sm" onClick={() => setAdjustDelta(String(num(adjustDelta) + 1))}>
              <Plus className="w-3 h-3" />
            </Button>
          </div>
          <div className="bg-stone-50 rounded-xl p-3 text-sm text-stone-700 flex items-center justify-between">
            <span>New quantity</span>
            <span className="font-mono font-bold">
              {adjusting ? Math.max(0, adjusting.quantity + (parseInt(adjustDelta || "0", 10) || 0)) : 0}
            </span>
          </div>
          <Input label="Reason (optional)" placeholder="Damaged, sample, vendor delivery…"
            value={adjustReason} onChange={(e) => setAdjustReason(e.target.value)} />
        </div>
      </SlidePanel>

      {/* Dispense to patient — invoice + line item + stock decrement
          + optional payment in one transaction. After success the
          panel optionally pops the printable receipt. */}
      <DispensePanel
        product={dispensing}
        onClose={() => setDispensing(null)}
        onCompleted={() => {
          setDispensing(null);
          qc.invalidateQueries({ queryKey: ["products"] });
        }}
      />
    </div>
  );
}

// ============================================================
// Subcomponents
// ============================================================
function StatCard({
  label, value, icon, color, bg, active, onClick,
}: {
  label: string; value: string | number; icon: React.ReactNode;
  color: string; bg: string; active?: boolean; onClick?: () => void;
}) {
  const Wrap: React.ElementType = onClick ? "button" : "div";
  return (
    <Wrap
      onClick={onClick}
      className={cn(
        "bg-white rounded-2xl border p-3.5 flex items-center gap-3 text-left transition-all",
        onClick && "cursor-pointer hover:border-stone-200",
        active ? "border-teal-300 ring-2 ring-teal-100" : "border-stone-100",
      )}
    >
      <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", bg, color)}>{icon}</div>
      <div>
        <p className="text-lg font-bold text-stone-900">{value}</p>
        <p className="text-[10px] text-stone-400">{label}</p>
      </div>
    </Wrap>
  );
}

function ProductCard({
  product, onEdit, onDelete, onAdjust, onDispense,
}: {
  product: Product;
  onEdit: () => void;
  onDelete: () => void;
  onAdjust: () => void;
  onDispense: () => void;
}) {
  const formatCurrency = useFormatCurrency();
  const qty = product.quantity;
  const reorder = product.reorderLevel;
  const stock = stockChip(qty, reorder);
  const exp = expiryChip(product.expiryDate);
  const fillPct = Math.min(100, Math.round((qty / Math.max(reorder * 2, 1)) * 100));
  const fillColor = qty === 0 ? "bg-red-400" : qty <= reorder ? "bg-amber-400" : "bg-emerald-400";

  return (
    <Card hover className="border-stone-100">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-stone-900 truncate">{product.name}</p>
            <p className="text-[11px] text-stone-400 truncate">
              {product.sku ? product.sku : "—"}{product.brand ? ` · ${product.brand}` : ""}
            </p>
          </div>
          <Badge variant={stock.variant} className="text-[9px] shrink-0">{stock.label}</Badge>
        </div>

        {exp && (
          <div className={cn("inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border mb-2", exp.cls)}>
            <CalendarClock className="w-3 h-3" />{exp.label}
          </div>
        )}

        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="bg-stone-50 rounded-lg p-2">
            <p className="text-[10px] text-stone-400">Price</p>
            <p className="text-sm font-bold text-stone-900">{formatCurrency(num(product.sellPrice))}</p>
          </div>
          <div className={cn("rounded-lg p-2", qty === 0 ? "bg-red-50" : qty <= reorder ? "bg-amber-50" : "bg-stone-50")}>
            <p className="text-[10px] text-stone-400">Stock</p>
            <p className={cn("text-sm font-bold", qty === 0 ? "text-red-600" : qty <= reorder ? "text-amber-600" : "text-stone-900")}>
              {qty}
            </p>
          </div>
          <div className="bg-stone-50 rounded-lg p-2">
            <p className="text-[10px] text-stone-400">Reorder</p>
            <p className="text-sm font-bold text-stone-900">{reorder}</p>
          </div>
        </div>

        {/* Stock progress bar — relative to 2× reorder level */}
        <div className="mt-2 h-1 bg-stone-100 rounded-full overflow-hidden">
          <div className={cn("h-full rounded-full transition-all", fillColor)} style={{ width: `${fillPct}%` }} />
        </div>

        <p className="text-[10px] text-stone-400 mt-2">
          {String(product.category || "").replace("_", " ")}{product.unit ? ` · ${product.unit}` : ""}
        </p>

        <div className="flex items-center gap-1 mt-3 pt-3 border-t border-stone-100">
          <button onClick={onDispense} title="Dispense to patient"
            disabled={qty === 0}
            className="flex-1 flex items-center justify-center gap-1 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 disabled:bg-stone-100 disabled:text-stone-400 disabled:cursor-not-allowed px-2 py-1.5 rounded-lg cursor-pointer transition-colors">
            <Send className="w-3.5 h-3.5" /> Dispense
          </button>
          <button onClick={onAdjust} title="Adjust stock"
            className="flex items-center justify-center text-stone-500 hover:text-teal-600 hover:bg-teal-50 p-1.5 rounded-lg cursor-pointer transition-colors">
            <ArrowUpDown className="w-3.5 h-3.5" />
          </button>
          <button onClick={onEdit} title="Edit product"
            className="flex items-center justify-center text-stone-500 hover:text-teal-600 hover:bg-teal-50 p-1.5 rounded-lg cursor-pointer transition-colors">
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button onClick={onDelete} title="Remove from inventory"
            className="flex items-center justify-center text-stone-500 hover:text-red-600 hover:bg-red-50 p-1.5 rounded-lg cursor-pointer transition-colors">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </CardContent>
    </Card>
  );
}

function ProductRow({
  product, onEdit, onDelete, onAdjust, onDispense,
}: {
  product: Product;
  onEdit: () => void;
  onDelete: () => void;
  onAdjust: () => void;
  onDispense: () => void;
}) {
  const formatCurrency = useFormatCurrency();
  const qty = product.quantity;
  const reorder = product.reorderLevel;
  const stock = stockChip(qty, reorder);
  const exp = expiryChip(product.expiryDate);
  return (
    <div className="grid grid-cols-12 items-center px-4 py-2.5 border-b border-stone-50 last:border-0 hover:bg-stone-50/50">
      <div className="col-span-4 min-w-0">
        <p className="text-sm font-medium text-stone-900 truncate">{product.name}</p>
        <p className="text-[11px] text-stone-400 truncate">
          {product.sku ?? "—"}{product.brand ? ` · ${product.brand}` : ""}
          {exp ? <span className={cn("ml-2 inline-flex items-center gap-0.5 px-1.5 rounded-full border text-[9px]", exp.cls)}>{exp.label}</span> : null}
        </p>
      </div>
      <div className="col-span-2 text-xs text-stone-600 capitalize">{String(product.category || "").toLowerCase().replace("_", " ")}</div>
      <div className="col-span-2 text-right text-sm font-mono text-stone-900">{formatCurrency(num(product.sellPrice))}</div>
      <div className={cn("col-span-1 text-right text-sm font-mono",
        qty === 0 ? "text-red-600 font-bold" : qty <= reorder ? "text-amber-600 font-semibold" : "text-stone-700")}>
        {qty}
      </div>
      <div className="col-span-2"><Badge variant={stock.variant} className="text-[9px]">{stock.label}</Badge></div>
      <div className="col-span-1 flex items-center justify-end gap-1">
        <button onClick={onDispense} title="Dispense" disabled={qty === 0}
          className="p-1.5 rounded-lg text-teal-600 hover:bg-teal-50 cursor-pointer disabled:text-stone-300 disabled:cursor-not-allowed">
          <Send className="w-3.5 h-3.5" />
        </button>
        <button onClick={onAdjust} title="Adjust stock"
          className="p-1.5 rounded-lg text-stone-500 hover:text-teal-600 hover:bg-teal-50 cursor-pointer">
          <ArrowUpDown className="w-3.5 h-3.5" />
        </button>
        <button onClick={onEdit} title="Edit"
          className="p-1.5 rounded-lg text-stone-500 hover:text-teal-600 hover:bg-teal-50 cursor-pointer">
          <Pencil className="w-3.5 h-3.5" />
        </button>
        <button onClick={onDelete} title="Remove"
          className="p-1.5 rounded-lg text-stone-500 hover:text-red-600 hover:bg-red-50 cursor-pointer">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
