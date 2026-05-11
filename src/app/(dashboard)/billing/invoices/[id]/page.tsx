"use client";

/**
 * Single-invoice view + thermal-receipt print.
 *
 * Layout has two visual modes driven by a single @media print stylesheet:
 *   - On screen: usual dashboard layout with a "Print" button + a back
 *     link. Shows Patient, Treatment lines, Payments, Tax, Discount,
 *     Date/Time. The receipt block (#receipt) is the only thing that
 *     prints; everything else is `print:hidden`.
 *   - On print: an 80mm-wide single-column receipt, no margins, no
 *     dashboard chrome. Compatible with most ESC/POS thermal printers
 *     when the user picks the printer in the system print dialog.
 *
 * Browser print is the right delivery here because Next.js can't talk
 * directly to thermal printers — but every modern thermal printer (e.g.
 * Epson TM-T20, Xprinter XP-58, Posiflex) installs as a system printer
 * and accepts the browser's PDF/raster output.
 */

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Printer, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useAuth } from "@/lib/auth-context";
import { LoadingSpinner } from "@/components/ui/loading";
import { ReceiptQR, useVisitQrUrl } from "@/components/billing/receipt-bits";
import { alternateCurrency, convertCurrency, formatCurrency } from "@/lib/utils";

type Money = number | string | null | undefined;
function asNum(v: Money): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "string") {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}
function fmt(v: Money): string {
  return asNum(v).toLocaleString();
}
function fmtDateTime(d: string | Date): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString("en-PK", {
    timeZone: "Asia/Karachi",
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: true,
  });
}
function fmtDateOnly(d: string | Date): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString("en-PK", {
    timeZone: "Asia/Karachi",
    year: "numeric", month: "short", day: "2-digit",
  });
}

// Reverse-engineer the tax percentage from the absolute tax + subtotal.
// Avoids a separate "tax_rate" lookup on the receipt — what was charged
// is what gets printed. Falls back to a generic "Tax" label when the
// math is undefined (subtotal = 0).
function taxPercentLabel(subtotal: number, tax: number): string {
  if (subtotal <= 0 || tax <= 0) return "Tax";
  const pct = (tax / subtotal) * 100;
  return `${pct.toFixed(pct % 1 === 0 ? 0 : 2)} %`;
}

// Group invoice tax into MEDICAL / COSMETIC / SLIMMING / Consultation
// buckets so the receipt prints a per-bracket GST line ("GST Cosmetic
// 8% — Rs. 800") instead of one mixed average. Returns [] when every
// line is the same bracket — caller falls back to the single-line form.
function taxBuckets(items: InvoiceItem[]): Array<{ label: string; amount: number }> {
  const buckets = new Map<string, number>();
  for (const it of items) {
    const tax = asNum(it.tax);
    if (tax <= 0) continue;
    const cat = it.treatment?.taxCategory ?? null;
    const label = cat
      ? cat === "MEDICAL"
        ? "GST Medical 3%"
        : cat === "COSMETIC"
        ? "GST Cosmetic 8%"
        : "GST Slimming 8%"
      : "GST Consultation 3%";
    buckets.set(label, (buckets.get(label) ?? 0) + tax);
  }
  if (buckets.size <= 1) return [];
  return Array.from(buckets.entries()).map(([label, amount]) => ({ label, amount }));
}

interface InvoiceItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: Money;
  discount: Money;
  tax: Money;
  total: Money;
  treatment?: { id: string; name: string; code?: string | null; category?: string | null; taxCategory?: "MEDICAL" | "COSMETIC" | "SLIMMING" | null } | null;
}

interface Payment {
  id: string;
  amount: Money;
  method: string;
  reference?: string | null;
  status: string;
  processedAt: string;
  notes?: string | null;
  processedBy?: { name?: string } | null;
}

interface Invoice {
  id: string;
  invoiceNumber: string;
  status: string;
  subtotal: Money;
  discount: Money;
  discountType: string;
  tax: Money;
  total: Money;
  amountPaid: Money;
  balanceDue: Money;
  notes?: string | null;
  createdAt: string;
  patient: { id: string; firstName: string; lastName: string; patientCode: string; phone?: string | null };
  branch: { id: string; name: string; code?: string | null; address?: string | null; phone?: string | null; email?: string | null };
  appointment?: { id: string; appointmentCode: string; date: string; type: string } | null;
  items: InvoiceItem[];
  payments: Payment[];
  createdBy?: { name?: string } | null;
}

// Suspense wrapper required when a client page reads useSearchParams() —
// Next 15 bails out of static prerender otherwise.
export default function InvoicePage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20"><LoadingSpinner size="lg" /></div>}>
      <InvoicePageInner />
    </Suspense>
  );
}

function InvoicePageInner() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const search = useSearchParams();
  const id = params?.id as string;
  // Tenant brand drives the receipt logo + footer credit. Comes from
  // the auth context (already hydrated when the user reaches this
  // page from the dashboard). Receipt fallback chain: wordmark
  // (preferred — designed for wide surfaces) → square logo → text
  // masthead. Tenants without either render a clean text-only
  // header rather than a stale mark from another tenant.
  const { tenant } = useAuth();
  const receiptLogo = tenant?.wordmarkUrl || tenant?.logoUrl || null;
  const receiptPoweredBy = tenant?.poweredByLine || "Powered by ScalaMedic";
  const receiptClinicName = tenant?.name || "ScalaMedic";
  // Dual-currency display: primary is whatever the tenant is invoicing
  // in; the alternate is the other of {PKR, USD} so a foreign patient
  // can read the total at a glance. Conversion uses a fixed rate in
  // lib/utils.ts — accounting still happens entirely in the primary.
  // Returns null on either side if the currency pair isn't supported,
  // in which case we silently skip the alt-line.
  const primaryCurrency = tenant?.currency ?? "PKR";
  const primaryLocale = tenant?.locale ?? "en-PK";
  const altCurrency = alternateCurrency(primaryCurrency);
  const altLocale = altCurrency === "USD" ? "en-US" : altCurrency === "PKR" ? "en-PK" : null;
  const fmtPrimary = (n: number) => formatCurrency(n, primaryCurrency, primaryLocale);
  const fmtAlt = (n: number): string | null => {
    if (!altCurrency || !altLocale) return null;
    const converted = convertCurrency(n, primaryCurrency, altCurrency);
    if (converted == null) return null;
    return formatCurrency(converted, altCurrency, altLocale);
  };
  // Auto-print mode: callers (dashboard "print" buttons) link with
  // ?print=1 so the receipt page opens, prints itself once data is
  // ready, and the user is back on the dashboard immediately.
  const wantPrint = search?.get("print") === "1";

  // React Query handles caching — when the user clicks View on the
  // billing list, that list page primes this exact key with the row's
  // invoice payload, so the page renders instantly and revalidates in
  // the background. staleTime/gcTime come from the global QueryProvider
  // defaults (60s / 5min), so a quick "View → back → View again" hits
  // the cache and feels instant.
  const { data: invoice, isLoading, error } = useQuery({
    queryKey: ["invoice", id],
    enabled: !!id,
    queryFn: async () => {
      const r = await fetch(`/api/billing/invoices/${id}`, { credentials: "include" });
      const d = await r.json();
      if (!d.success) throw new Error(d.error || "Invoice not found.");
      return d.data as Invoice;
    },
  });

  // QR target — must be available before auto-print fires, otherwise
  // the receipt prints with a blank QR placeholder. Hook is hoisted up
  // here (before the early returns) since hooks must run on every
  // render in the same order.
  const qrUrl = useVisitQrUrl({
    appointmentId: invoice?.appointment?.id ?? null,
    invoiceId: invoice?.id ?? null,
  });

  useEffect(() => {
    if (!invoice || !wantPrint) return;
    // Wait for the QR data URL to land before triggering print —
    // otherwise the user gets a receipt with an empty QR box.
    if (!qrUrl) return;
    const t = window.setTimeout(() => window.print(), 250);
    return () => window.clearTimeout(t);
  }, [invoice, wantPrint, qrUrl]);

  if (isLoading && !invoice) {
    return <div className="flex items-center justify-center py-20"><LoadingSpinner size="lg" /></div>;
  }
  if (error || !invoice) {
    return (
      <div className="py-20 text-center text-stone-500">
        <p className="text-sm">{(error as Error | undefined)?.message || "Invoice not found."}</p>
        <button onClick={() => router.back()} className="text-teal-600 text-sm mt-3 hover:underline cursor-pointer">Go back</button>
      </div>
    );
  }
  // Cached invoice values can come in two shapes: the full one from
  // /api/billing/invoices/:id (everything joined), or — historically —
  // a partial slice cached from a list endpoint that didn't include
  // patient/items/payments. If we got the partial one, hold off
  // rendering the receipt until the background revalidation lands.
  if (!invoice.patient || !invoice.items || !invoice.payments) {
    return <div className="flex items-center justify-center py-20"><LoadingSpinner size="lg" /></div>;
  }

  const totalDiscount = asNum(invoice.discount);
  const totalTax = asNum(invoice.tax);
  const subtotal = asNum(invoice.subtotal);
  const total = asNum(invoice.total);
  const paid = asNum(invoice.amountPaid);
  const due = asNum(invoice.balanceDue);

  return (
    <>
      {/* Screen-only chrome — hidden on print */}
      <div className="print:hidden flex items-center justify-between mb-4">
        <Link href="/billing" className="flex items-center gap-1.5 text-sm text-stone-500 hover:text-teal-600">
          <ArrowLeft className="w-4 h-4" /> Back to billing
        </Link>
        <div className="flex items-center gap-2">
          <NewClaimButton patientId={invoice.patient.id} invoiceId={invoice.id} invoiceTotal={total} balanceDue={due} />
          <Button onClick={() => window.print()} iconLeft={<Printer className="w-4 h-4" />}>
            Print
          </Button>
        </div>
      </div>

      {/* Receipt — minimalist review-prompted layout. Bold centered
          clinic header, review QR with explicit "Scan to leave a
          review" caption, simple flat services list, clean Subtotal /
          GST / TOTAL block, inline payment line, social CTA at the
          bottom. No barcode, no patient PII on the receipt — the
          appointment code is the only customer-side identifier. */}
      <div id="receipt" className="receipt-screen print:receipt-print">

        {/* ── Header — full clinic lockup (monogram + wordmark) + contact ── */}
        <div className="text-center">
          {/* If the tenant has its own logo, print that as a single
              rasterised PNG at native dpi (plain <img>, not next/image,
              so the browser print pipeline hands the thermal driver a
              clean asset). Otherwise fall back to the tenant name as
              the masthead — no logo at all is better than showing
              another tenant's mark. */}
          {receiptLogo ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={receiptLogo}
              alt={receiptClinicName}
              width={240}
              height={160}
              className="mx-auto block"
              style={{ width: 240, height: "auto" }}
            />
          ) : (
            <h1 className="text-base font-bold tracking-tight">{receiptClinicName}</h1>
          )}
          {invoice.branch.address && (
            <p className="text-[10px] mt-2 leading-tight px-2">{invoice.branch.address}</p>
          )}
          {(invoice.branch.phone || invoice.branch.email) && (
            <p className="text-[10px] mt-0.5">
              {[invoice.branch.phone, invoice.branch.email].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>

        {/* ── RECEIPT title between solid rules ── */}
        <div className="border-t-2 border-black mt-3" />
        <p className="text-center font-bold text-[13px] tracking-widest py-2">RECEIPT</p>
        <div className="border-t-2 border-black mb-2" />

        {/* ── Meta info ── */}
        <div className="text-[12px] space-y-0.5">
          <MetaRow label="Invoice #" value={<span className="font-mono">{invoice.invoiceNumber}</span>} />
          <MetaRow label="Date" value={fmtDateOnly(invoice.createdAt)} />
          {invoice.appointment && (
            <MetaRow label="Visit ID" value={<span className="font-mono">{invoice.appointment.appointmentCode}</span>} />
          )}
          {invoice.createdBy?.name && <MetaRow label="Served by" value={invoice.createdBy.name} />}
        </div>

        {/* ── Services — flat list under a centered "Services" heading,
             dashed rules above and below. Each row is "description ×qty
             total" with the description allowed to wrap. */}
        <div className="border-t border-dashed border-stone-700 mt-3" />
        <p className="text-center font-bold text-[12px] py-1">Services</p>
        <div className="border-t border-dashed border-stone-700" />
        <div className="text-[12px] py-1.5 space-y-1">
          {invoice.items.map((it) => (
            <div key={it.id} className="flex items-start gap-2">
              <span className="flex-1 leading-tight">{it.description}</span>
              <span className="font-mono text-stone-600 shrink-0">×{it.quantity}</span>
              <span className="font-mono shrink-0 min-w-[64px] text-right">{fmt(it.total)}</span>
            </div>
          ))}
        </div>
        <div className="border-t border-dashed border-stone-700" />

        {/* ── Subtotal / GST / TOTAL ── */}
        <div className="text-[12px] mt-2 space-y-0.5">
          <TotalLine label="Subtotal" value={fmt(subtotal)} />
          {totalDiscount > 0 && <TotalLine label="Discount" value={`−${fmt(totalDiscount)}`} />}
          {totalTax > 0 && (() => {
            const buckets = taxBuckets(invoice.items);
            // Mixed-rate invoice: one line per bracket so the bookkeeper
            // can reconcile each bucket separately. Single-rate: a
            // single "GST (X%)" line.
            if (buckets.length > 0) {
              return buckets.map((b) => (
                <TotalLine key={b.label} label={b.label} value={fmt(b.amount)} />
              ));
            }
            return <TotalLine label={`GST (${taxPercentLabel(subtotal, totalTax)})`} value={fmt(totalTax)} />;
          })()}
        </div>
        <div className="border-t-2 border-black mt-2" />
        <div className="flex items-baseline justify-between py-1.5">
          <span className="font-bold text-[15px] tracking-wider">TOTAL</span>
          <span className="font-mono font-bold text-[18px]">{fmtPrimary(total)}</span>
        </div>
        {/* Alt-currency line under TOTAL. Smaller, italicised, prefixed
            with "≈" so a glance can't mistake it for the authoritative
            amount that was actually charged. Hidden when no conversion
            is available (currency outside the PKR/USD pair). */}
        {fmtAlt(total) && (
          <div className="flex items-baseline justify-between -mt-1 pb-1.5 text-[11px] text-stone-500">
            <span className="italic">≈ equivalent</span>
            <span className="font-mono">{fmtAlt(total)}</span>
          </div>
        )}
        <div className="border-t-2 border-black" />

        {/* ── Payment line(s). Single payment → "Paid: X (Method)".
             Multiple → list each method on its own line. */}
        <div className="text-[12px] mt-3 space-y-0.5">
          {invoice.payments.length === 0 ? (
            <p>Status: <span className="font-bold">Unpaid</span></p>
          ) : invoice.payments.length === 1 ? (
            <p>
              <span className="font-bold">Paid:</span>{" "}
              <span className="font-mono">{fmt(invoice.payments[0].amount)}</span>{" "}
              <span>({invoice.payments[0].method.replace(/_/g, " ")})</span>
            </p>
          ) : (
            <>
              <p className="font-bold">Paid: {fmt(paid)}</p>
              {invoice.payments.map((p) => (
                <div key={p.id} className="flex justify-between text-[11px]">
                  <span>{p.method.replace(/_/g, " ")}{p.reference ? ` · ${p.reference}` : ""}</span>
                  <span className="font-mono">{fmt(p.amount)}</span>
                </div>
              ))}
            </>
          )}
          {due > 0 && (
            <p>
              <span className="font-bold">Balance:</span>{" "}
              <span className="font-mono">{fmtPrimary(due)}</span>
              {fmtAlt(due) && (
                <span className="text-stone-500 italic"> · ≈ {fmtAlt(due)}</span>
              )}
            </p>
          )}
          {due < 0 && (
            <p>
              <span className="font-bold">Change:</span>{" "}
              <span className="font-mono">{fmt(Math.abs(due))}</span>
            </p>
          )}
        </div>

        {invoice.notes && (
          <p className="text-center text-[10px] italic mt-2">{invoice.notes}</p>
        )}

        {/* ── Footer — review QR, social, legal credit ── */}
        <div className="border-t border-dashed border-stone-700 mt-3" />
        <div className="text-center mt-3 space-y-2">
          {/* QR + review prompt moved here from the header so the
              clinic monogram leads the receipt and the call-to-
              action sits at the end where the patient is most
              likely to act on it. */}
          <div className="flex justify-center">
            {qrUrl ? <ReceiptQR value={qrUrl} size={100} /> : <div style={{ width: 100, height: 100 }} />}
          </div>
          <p className="text-[11px] font-bold">Scan to leave a review ★</p>
          <p className="text-[12px] font-semibold pt-1">Thank you for visiting!</p>
        </div>
        <p className="text-center text-[9px] text-stone-500 mt-3 mb-1">
          {receiptPoweredBy}
        </p>
      </div>

      {/* Receipt sizing rules. Width is 80mm (standard thermal); 58mm
          printers can accept the same content via the printer driver
          shrinking. We hide everything outside #receipt during print so
          the dashboard chrome (sidebar / topbar) doesn't waste paper. */}
      <style jsx global>{`
        .receipt-screen {
          max-width: 380px;
          margin: 0 auto;
          padding: 16px;
          background: #fff;
          border: 1px solid #e7e5e4;
          border-radius: 12px;
          font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
          color: #1c1917;
        }
        @media print {
          @page { size: 80mm auto; margin: 0; }
          html, body { background: #fff !important; margin: 0 !important; padding: 0 !important; }
          body * { visibility: hidden !important; }
          #receipt, #receipt * { visibility: visible !important; }
          /* Fill the full printed page and center contents. We can't
             rely on @page being honored — many Windows thermal drivers
             ignore it and fall back to the user's default paper, which
             leaves an 80mm-wide block stranded in the top-left. Setting
             left:0/right:0 stretches the absolute box to the full page
             width regardless of what the driver picked. */
          #receipt {
            position: absolute;
            left: 0; right: 0; top: 0;
            width: auto;
            max-width: none;
            border: 0 !important;
            border-radius: 0 !important;
            padding: 4mm 4mm !important;
            font-size: 12px !important;
            color: #000 !important;
          }
          /* Pure-black borders on print so thermal heads render every
             rule line consistently — Tailwind's stone-300/400 default
             can come out faint on 203dpi heads. */
          #receipt .border, #receipt .border-t, #receipt .border-b,
          #receipt .border-l, #receipt .border-r,
          #receipt .border-t-2, #receipt .border-b-2, #receipt .border-y-2 {
            border-color: #000 !important;
          }
        }
      `}</style>
    </>
  );
}

// ─── Receipt sub-components ────────────────────────────────────

function MetaRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex">
      <span className="font-bold w-24 shrink-0">{label}:</span>
      <span className="flex-1 min-w-0">{value}</span>
    </div>
  );
}

function TotalLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-end justify-between">
      <span className="font-bold">{label}</span>
      <span className="font-mono border-b border-black min-w-[80px] text-right pb-0.5">
        {value}
      </span>
    </div>
  );
}

// ============================================================
// v58 — "New insurance claim" trigger on the invoice detail.
// ============================================================
// Lazy-loads the patient's active insurance policies on click; if
// none exist, surfaces a helpful message instead of opening the
// modal. Defaulting claimedAmount to balanceDue (or invoice total
// when fully paid by the patient) matches what the API does
// server-side, but we let the user override.
interface InsurancePolicy {
  id: string;
  provider: string;
  policyNumber: string;
  coverageType: string | null;
  isActive: boolean;
  expiryDate: string | null;
}

function NewClaimButton({
  patientId, invoiceId, invoiceTotal, balanceDue,
}: {
  patientId: string;
  invoiceId: string;
  invoiceTotal: number;
  balanceDue: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [policies, setPolicies] = useState<InsurancePolicy[]>([]);
  const [insuranceId, setInsuranceId] = useState("");
  const [claimedAmount, setClaimedAmount] = useState(String(balanceDue > 0 ? balanceDue : invoiceTotal));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function openModal() {
    setOpen(true);
    setError("");
    if (policies.length === 0) {
      setLoading(true);
      try {
        // /api/patients/[id] includes the insurance array in its
        // detail response — saves us a dedicated endpoint.
        const res = await fetch(`/api/patients/${patientId}`, { credentials: "include" })
          .then((r) => r.json());
        const list = (res?.data?.insurance ?? []) as InsurancePolicy[];
        const active = list.filter((p) => p.isActive);
        setPolicies(active);
        if (active.length === 1) setInsuranceId(active[0].id);
        if (!active.length && !res?.success) setError(res?.error || "Could not load insurance policies");
      } finally { setLoading(false); }
    }
  }

  async function submit() {
    if (!insuranceId) { setError("Pick an insurance policy"); return; }
    const amt = parseFloat(claimedAmount);
    if (!Number.isFinite(amt) || amt <= 0) { setError("Claimed amount must be > 0"); return; }
    if (amt > invoiceTotal) { setError("Claimed amount cannot exceed invoice total"); return; }
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/claims", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ invoiceId, insuranceId, claimedAmount: amt }),
      }).then((r) => r.json());
      if (!res?.success) { setError(res?.error || "Failed to create claim"); setBusy(false); return; }
      router.push("/billing/claims");
    } catch {
      setError("Network error");
      setBusy(false);
    }
  }

  return (
    <>
      <Button variant="outline" size="sm" iconLeft={<ShieldCheck className="w-3.5 h-3.5" />} onClick={openModal}>
        New claim
      </Button>
      {open && (
        <Modal isOpen onClose={() => setOpen(false)} title="New insurance claim" subtitle="Submit this invoice to an active insurance policy.">
          <div className="space-y-4">
            {loading ? (
              <div className="flex items-center justify-center py-8"><LoadingSpinner /></div>
            ) : policies.length === 0 ? (
              <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
                No active insurance on file for this patient. Add a policy from the patient profile first.
              </div>
            ) : (
              <>
                <div>
                  <label className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-1.5 block">Policy</label>
                  <select
                    value={insuranceId}
                    onChange={(e) => setInsuranceId(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm bg-white border border-stone-200 rounded-xl outline-none focus:border-violet-500"
                  >
                    <option value="">Select…</option>
                    {policies.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.provider} — {p.policyNumber}{p.coverageType ? ` (${p.coverageType})` : ""}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-1.5 block">Claimed amount (PKR)</label>
                  <input
                    type="number"
                    value={claimedAmount}
                    onChange={(e) => setClaimedAmount(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm bg-white border border-stone-200 rounded-xl outline-none focus:border-violet-500"
                    min="0"
                    max={invoiceTotal}
                    step="0.01"
                  />
                  <p className="text-[11px] text-stone-400 mt-1">
                    Defaults to balance due ({balanceDue.toLocaleString()}). Cannot exceed invoice total ({invoiceTotal.toLocaleString()}).
                  </p>
                </div>
              </>
            )}
            {error && <p className="text-xs text-red-600">{error}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
              <Button size="sm" onClick={submit} disabled={busy || policies.length === 0}>
                {busy ? "Creating…" : "Create draft claim"}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
