"use client";

/**
 * Small client-only renderers for the bits on a thermal receipt
 * that need a JS lib — the QR code + the Code 128 barcode.
 *
 * Both render to <canvas> via their respective libraries
 * (qrcode + jsbarcode), then we read out a data URL into an <img>.
 * Why not just emit <canvas>: print engines on Chrome/Edge sometimes
 * rasterize a <canvas> at screen DPI which looks blurry on a 203dpi
 * thermal head. <img src="data:image/png">s print at the printer's
 * native DPI cleanly.
 */
import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import JsBarcode from "jsbarcode";

/**
 * Get-or-create the QR token for the receipt's appointment / invoice
 * and return the absolute URL that should be encoded into the QR. Idle
 * until at least one of the two ids is available; reprints of the same
 * receipt produce the same token (server is idempotent).
 *
 * The URL points to /qr/<token> — a server-side route handler that
 * decides whether to send the scanner to the staff workflow page or
 * the public thank-you page.
 */
export function useVisitQrUrl({
  appointmentId,
  invoiceId,
}: {
  appointmentId?: string | null;
  invoiceId?: string | null;
}): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!appointmentId && !invoiceId) {
      setUrl(null);
      return;
    }
    let cancelled = false;
    fetch("/api/qr-tokens", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ appointmentId: appointmentId ?? null, invoiceId: invoiceId ?? null }),
    })
      .then((r) => r.json())
      .then((d: { success: boolean; data?: { token: string } }) => {
        if (cancelled) return;
        if (d.success && d.data?.token) {
          // Resolution order:
          //   1. NEXT_PUBLIC_QR_BASE_URL — patient-facing review host
          //      (e.g. https://app.drnakhodas.com). Set on every box
          //      that prints receipts so the QR is always the same
          //      brand regardless of which staff dashboard generated
          //      the print.
          //   2. NEXT_PUBLIC_APP_URL — staff host fallback (so dev
          //      and one-off setups still work).
          //   3. window.location.origin — last-resort dev fallback.
          const base =
            process.env.NEXT_PUBLIC_QR_BASE_URL?.replace(/\/$/, "") ||
            process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
            (typeof window !== "undefined" ? window.location.origin : "");
          if (!base) { setUrl(null); return; }
          setUrl(`${base}/qr/${d.data.token}`);
        } else {
          setUrl(null);
        }
      })
      .catch(() => { if (!cancelled) setUrl(null); });
    return () => { cancelled = true; };
  }, [appointmentId, invoiceId]);
  return url;
}

export function ReceiptQR({
  value,
  size = 110,
  className,
}: { value: string; size?: number; className?: string }) {
  const [src, setSrc] = useState<string>("");
  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(value, {
      margin: 1,
      width: size,
      errorCorrectionLevel: "M",
      color: { dark: "#000000", light: "#ffffff" },
    })
      .then((url) => { if (!cancelled) setSrc(url); })
      .catch(() => { if (!cancelled) setSrc(""); });
    return () => { cancelled = true; };
  }, [value, size]);
  if (!src) return <div style={{ width: size, height: size }} />;
  return <img src={src} alt="QR code" width={size} height={size} className={className} />;
}

export function ReceiptBarcode({
  value,
  height = 36,
  className,
}: { value: string; height?: number; className?: string }) {
  const ref = useRef<SVGSVGElement | null>(null);
  useEffect(() => {
    if (!ref.current) return;
    try {
      JsBarcode(ref.current, value, {
        format: "CODE128",
        height,
        displayValue: true,
        fontSize: 11,
        margin: 0,
        // Slim bars so a long invoice number still fits in the 80mm
        // print width without overflow.
        width: 1.5,
        background: "#ffffff",
        lineColor: "#000000",
      });
    } catch {
      // jsbarcode throws if the value contains chars Code 128 can't
      // encode; very unlikely for invoice numbers (alphanumeric +
      // hyphen) but we don't want to crash the whole receipt.
    }
  }, [value, height]);
  return <svg ref={ref} className={className} />;
}
