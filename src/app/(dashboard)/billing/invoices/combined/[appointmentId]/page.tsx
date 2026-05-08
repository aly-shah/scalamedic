"use client";

/**
 * Combined receipt — one printable sheet that bundles every invoice for
 * a single appointment. Opened from the checkout dialog when the patient
 * is leaving and reception wants to hand them one piece of paper that
 * covers the check-in fee + any procedures added mid-consult, etc.
 *
 * Same 80mm thermal-receipt layout as /billing/invoices/[id], but each
 * invoice gets its own block (number + items + payments + subtotal),
 * then a grand total at the bottom across all invoices. Auto-fires
 * window.print() so the user lands directly in the print dialog.
 */
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/ui/loading";
import { ReceiptQR, ReceiptBarcode, useVisitQrUrl } from "@/components/billing/receipt-bits";

type Money = number | string | null | undefined;
const num = (v: Money): number => {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "string") { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; }
  return 0;
};
const fmt = (v: Money): string => num(v).toLocaleString();
const fmtDateTime = (d: string | Date): string => {
  if (!d) return "";
  return new Date(d).toLocaleString("en-PK", {
    timeZone: "Asia/Karachi",
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: true,
  });
};

interface Item {
  id: string; description: string; quantity: number;
  unitPrice: Money; discount: Money; tax: Money; total: Money;
  treatment?: { name: string; category: string; taxCategory?: "MEDICAL" | "COSMETIC" | "SLIMMING" | null } | null;
}
interface Payment {
  id: string; amount: Money; method: string; reference?: string | null;
  status: string; processedAt: string | null;
}
interface Invoice {
  id: string; invoiceNumber: string; status: string;
  subtotal: Money; discount: Money; tax: Money; total: Money;
  amountPaid: Money; balanceDue: Money;
  createdAt: string;
  items: Item[]; payments: Payment[];
}
interface CombinedData {
  id: string; appointmentCode: string; date: string;
  startTime: string; endTime: string;
  patient: { firstName: string; lastName: string; patientCode: string; phone: string | null };
  branch: { name: string; address: string; phone: string };
  doctor: { name: string; speciality: string | null } | null;
  invoices: Invoice[];
}

export default function CombinedReceiptPage() {
  const { appointmentId } = useParams<{ appointmentId: string }>();
  const router = useRouter();
  const [data, setData] = useState<CombinedData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!appointmentId) return;
    fetch(`/api/billing/invoices/combined?appointmentId=${appointmentId}`)
      .then((r) => r.json())
      .then((res: { success: boolean; data?: CombinedData; error?: string }) => {
        if (!res.success) { setError(res.error || "Failed to load"); return; }
        setData(res.data || null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"));
  }, [appointmentId]);

  // QR target — fetch the visit's token URL once we have the appointment.
  const qrUrl = useVisitQrUrl({ appointmentId: data?.id ?? null, invoiceId: null });

  // Auto-print once data + QR are both ready (otherwise the receipt
  // prints with an empty QR box).
  useEffect(() => {
    if (!data || !qrUrl) return;
    const t = setTimeout(() => window.print(), 400);
    return () => clearTimeout(t);
  }, [data, qrUrl]);

  if (error) {
    return <div className="p-8 text-center text-red-600">{error}</div>;
  }
  if (!data) {
    return <div className="flex items-center justify-center py-20"><LoadingSpinner size="lg" /></div>;
  }

  if (data.invoices.length === 0) {
    return (
      <div className="max-w-md mx-auto p-8 text-center">
        <p className="text-stone-600 mb-4">No invoices for this appointment yet.</p>
        <Button variant="outline" onClick={() => router.back()}>Back</Button>
      </div>
    );
  }

  // Roll-ups across every invoice on this appointment.
  const grandSubtotal = data.invoices.reduce((s, i) => s + num(i.subtotal), 0);
  const grandDiscount = data.invoices.reduce((s, i) => s + num(i.discount), 0);
  const grandTax = data.invoices.reduce((s, i) => s + num(i.tax), 0);
  const grandTotal = data.invoices.reduce((s, i) => s + num(i.total), 0);
  const grandPaid = data.invoices.reduce((s, i) => s + num(i.amountPaid), 0);
  const grandDue = data.invoices.reduce((s, i) => s + num(i.balanceDue), 0);

  return (
    <>
      {/* On-screen toolbar (hidden in print). */}
      <div className="no-print max-w-md mx-auto p-4 flex items-center justify-between">
        <Link href={`/appointments`} className="inline-flex items-center gap-1 text-sm text-stone-500 hover:text-stone-700">
          <ArrowLeft className="w-4 h-4" /> Back
        </Link>
        <Button onClick={() => window.print()} iconLeft={<Printer className="w-4 h-4" />} size="sm">
          Print receipt
        </Button>
      </div>

      <div id="receipt" className="receipt-screen">
        {/* ── Header ── */}
        <div className="text-center">
          <h1 className="text-[15px] font-bold tracking-wide uppercase">{data.branch.name}</h1>
          {/* QR encodes /qr/<token> on this host. Server resolves the
              scan to the staff workflow page (when logged in) or the
              public /thank-you page (anonymous). No PII in the URL. */}
          <div className="my-2 flex justify-center">
            {qrUrl ? <ReceiptQR value={qrUrl} size={110} /> : <div style={{ width: 110, height: 110 }} />}
          </div>
          <p className="text-[10px] font-mono">{data.appointmentCode}</p>
          {data.branch.address && (
            <p className="text-[10px] mt-1 leading-tight px-2">{data.branch.address}</p>
          )}
          {data.branch.phone && (
            <p className="text-[10px] mt-0.5">{data.branch.phone}</p>
          )}
        </div>

        {/* ── Title block ── */}
        <div className="border-t-2 border-black mt-3" />
        <p className="text-center font-bold text-[13px] tracking-widest py-2">VISIT RECEIPT</p>
        <div className="border-t-2 border-black mb-2" />
        <p className="text-center text-[10px] mb-2">
          Combined bill · {data.invoices.length} invoice{data.invoices.length === 1 ? "" : "s"}
        </p>

        {/* ── Patient + visit meta ── */}
        <div className="text-[12px] space-y-0.5">
          <div className="flex"><span className="font-bold w-20 shrink-0">Patient:</span><span className="flex-1">{data.patient.firstName} {data.patient.lastName}</span></div>
          <div className="flex"><span className="font-bold w-20 shrink-0">Code:</span><span className="flex-1 font-mono">{data.patient.patientCode}</span></div>
          {data.doctor && <div className="flex"><span className="font-bold w-20 shrink-0">Doctor:</span><span className="flex-1">{data.doctor.name}</span></div>}
          <div className="flex"><span className="font-bold w-20 shrink-0">Visit:</span><span className="flex-1 font-mono">{data.appointmentCode}</span></div>
          <div className="flex"><span className="font-bold w-20 shrink-0">Date:</span><span className="flex-1">{fmtDateTime(data.date)}</span></div>
        </div>

        {/* ── Each invoice as its own bordered block ── */}
        {data.invoices.map((inv) => (
          <div key={inv.id} className="mt-3 border border-black">
            <div className="flex items-center justify-between px-1.5 py-1 border-b border-black bg-stone-50">
              <span className="font-bold text-[12px] font-mono">{inv.invoiceNumber}</span>
              <span className="text-[10px]">{fmtDateTime(inv.createdAt)}</span>
            </div>

            {/* Items table inside the invoice block */}
            <div className="grid grid-cols-[1fr_56px_42px_64px] text-[11px] font-bold border-b border-stone-400 px-1.5 py-1">
              <span>Item</span>
              <span className="text-right">Price</span>
              <span className="text-right">Qty</span>
              <span className="text-right">Amount</span>
            </div>
            {inv.items.map((it) => (
              <div key={it.id} className="grid grid-cols-[1fr_56px_42px_64px] text-[11px] px-1.5 py-1 border-b border-dotted border-stone-300 last:border-b-0">
                <span className="truncate pr-1">{it.treatment?.name || it.description}</span>
                <span className="text-right font-mono">{fmt(it.unitPrice)}</span>
                <span className="text-right font-mono">{it.quantity}</span>
                <span className="text-right font-mono">{fmt(it.total)}</span>
              </div>
            ))}

            {/* Per-invoice total + payments */}
            <div className="flex items-center justify-between px-1.5 py-1 border-t border-black text-[11px]">
              <span className="font-bold">Invoice total</span>
              <span className="font-mono font-bold">{fmt(inv.total)}</span>
            </div>
            {inv.payments.length > 0 && (
              <div className="px-1.5 py-1 text-[10px] space-y-0.5 border-t border-dotted border-stone-400">
                {inv.payments.map((p) => (
                  <div key={p.id} className="flex justify-between">
                    <span>{p.method.replace(/_/g, " ")}{p.reference ? ` · ${p.reference}` : ""}</span>
                    <span className="font-mono">Rs. {fmt(p.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}

        <div className="border-t-2 border-black mt-3" />

        {/* ── Grand totals ── */}
        <div className="text-[12px] mt-2 space-y-0.5">
          <div className="flex items-end justify-between">
            <span className="font-bold">Subtotal</span>
            <span className="font-mono border-b border-black min-w-[80px] text-right pb-0.5">{fmt(grandSubtotal)}</span>
          </div>
          {grandDiscount > 0 && (
            <div className="flex items-end justify-between">
              <span className="font-bold">Discount</span>
              <span className="font-mono border-b border-black min-w-[80px] text-right pb-0.5">−{fmt(grandDiscount)}</span>
            </div>
          )}
          {grandTax > 0 && (() => {
            // Roll all line-level tax into per-bracket buckets so a
            // multi-invoice visit prints "GST Cosmetic 8%: Rs. X" / "GST
            // Medical 3%: Rs. Y" instead of one mixed total.
            const buckets = new Map<string, number>();
            for (const inv of data.invoices) {
              for (const it of inv.items) {
                const tax = num(it.tax);
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
            }
            const entries = Array.from(buckets.entries());
            // Single bucket (or zero, edge case): use the simple "Tax" line.
            if (entries.length <= 1) {
              return (
                <div className="flex items-end justify-between">
                  <span className="font-bold">Tax</span>
                  <span className="font-mono border-b border-black min-w-[80px] text-right pb-0.5">{fmt(grandTax)}</span>
                </div>
              );
            }
            return entries.map(([label, amount]) => (
              <div key={label} className="flex items-end justify-between">
                <span className="font-bold">{label}</span>
                <span className="font-mono border-b border-black min-w-[80px] text-right pb-0.5">{fmt(amount)}</span>
              </div>
            ));
          })()}
          <div className="flex items-end justify-between pt-2">
            <span className="font-bold text-[15px]">Grand Total</span>
            <span className="font-mono font-bold text-[20px] leading-none border-y-2 border-double border-black px-1">
              {fmt(grandTotal)}
            </span>
          </div>
        </div>

        {/* ── Paid / Balance — boxed ── */}
        <div className="mt-3 border border-black">
          <div className="flex items-center justify-between px-2 py-1 border-b border-black">
            <span className="font-bold text-[13px]">Paid</span>
            <span className="font-mono font-bold text-[15px]">{fmt(grandPaid)}</span>
          </div>
          <div className="flex items-center justify-between px-2 py-1">
            <span className="font-bold text-[13px]">{grandDue > 0 ? "Balance Due" : grandDue < 0 ? "Change" : "Settled"}</span>
            <span className="font-mono font-bold text-[15px]">
              {grandDue === 0 ? "—" : fmt(Math.abs(grandDue))}
            </span>
          </div>
        </div>

        {/* ── Barcode (encodes appointment code so reception can re-look-up the visit) ── */}
        <div className="mt-3 flex justify-center">
          <ReceiptBarcode value={data.appointmentCode} height={36} />
        </div>

        <div className="text-[10px] mt-2 space-y-0.5 border-t border-stone-300 pt-2">
          <p>Print Date: {fmtDateTime(new Date())}</p>
        </div>

        <div className="text-center text-[10px] mt-2 mb-1 font-semibold">
          Thank you for visiting {data.branch.name}!
        </div>
      </div>

      {/* Same thermal-receipt CSS as the single-invoice page so the
          combined receipt prints to the same 80mm-wide format. */}
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
          /* See /billing/invoices/[id] for the rationale — fill the full
             page width so the print isn't stranded top-left when the
             driver ignores the 80mm @page hint. */
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
        }
      `}</style>
    </>
  );
}
