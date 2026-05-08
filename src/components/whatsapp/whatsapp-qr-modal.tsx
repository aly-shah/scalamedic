"use client";

/**
 * WhatsApp QR modal — polls /api/whatsapp/qr every 2s and renders
 * the latest QR as a data URL. Closes itself once the sidecar
 * reports `connected: true` (the user has scanned).
 *
 * Baileys rotates the QR every ~30s while waiting for a scan; the
 * sidecar always exposes the latest one, so polling pulls fresh
 * codes automatically without us tracking expiry here.
 */
import { useEffect, useState } from "react";
import { Loader2, CheckCircle2, MessageCircle, AlertTriangle } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";

interface QRPayload {
  connected: boolean;
  state: "connecting" | "open" | "close" | "logged_out";
  qr: string | null;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onConnected?: () => void;
}

export function WhatsAppQRModal({ isOpen, onClose, onConnected }: Props) {
  const [qr, setQr] = useState<QRPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    let timer: NodeJS.Timeout | null = null;
    setError(null);

    const poll = async () => {
      try {
        const res = await fetch("/api/whatsapp/qr", { credentials: "include" });
        const d = await res.json();
        if (cancelled) return;
        if (!d.success) {
          setError(d.error || "Failed to fetch QR");
          // Keep polling — sidecar might come back up.
          timer = setTimeout(poll, 5000);
          return;
        }
        setQr(d.data);
        setError(null);
        if (d.data?.connected) {
          // Brief celebration moment before closing.
          setTimeout(() => onConnected?.(), 1200);
          return;
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Network error");
        }
      }
      if (!cancelled) timer = setTimeout(poll, 2000);
    };
    poll();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [isOpen, onConnected]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Link WhatsApp"
      subtitle="Scan from the clinic's WhatsApp app to send reminders + confirmations"
      size="md"
      footer={
        <Button variant="outline" onClick={onClose}>
          Close
        </Button>
      }
    >
      <div className="space-y-4">
        {/* Step-by-step (matches the WhatsApp Linked Devices flow exactly) */}
        <ol className="text-xs text-stone-600 space-y-1.5 list-decimal pl-5">
          <li>Open <span className="font-semibold">WhatsApp</span> on the clinic phone</li>
          <li>Tap <span className="font-semibold">⋮</span> (Android) or <span className="font-semibold">Settings</span> (iPhone) → <span className="font-semibold">Linked devices</span></li>
          <li>Tap <span className="font-semibold">Link a device</span></li>
          <li>Point your camera at this code</li>
        </ol>

        {/* QR area — fixed height so layout doesn't jump between states */}
        <div className="bg-stone-50 border border-stone-200 rounded-2xl p-4 flex items-center justify-center min-h-[320px]">
          {qr?.connected ? (
            <div className="text-center">
              <div className="w-16 h-16 mx-auto bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mb-3">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <p className="text-sm font-semibold text-stone-900">WhatsApp linked</p>
              <p className="text-xs text-stone-500 mt-1">You can close this dialog.</p>
            </div>
          ) : qr?.qr ? (
            <div className="text-center">
              <img
                src={qr.qr}
                alt="WhatsApp QR code"
                className="w-[260px] h-[260px] mx-auto"
              />
              <p className="text-[11px] text-stone-500 mt-2">
                Code refreshes every ~30s while waiting for a scan.
              </p>
            </div>
          ) : error ? (
            <div className="text-center">
              <div className="w-12 h-12 mx-auto bg-red-100 text-red-600 rounded-full flex items-center justify-center mb-3">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <p className="text-sm font-semibold text-stone-900">Couldn&apos;t fetch QR</p>
              <p className="text-xs text-stone-500 mt-1 max-w-xs">{error}</p>
              <p className="text-[11px] text-stone-400 mt-2">Retrying…</p>
            </div>
          ) : (
            <div className="text-center text-stone-400">
              <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
              <p className="text-xs">Generating QR…</p>
            </div>
          )}
        </div>

        {/* Footnote about what the link enables */}
        <div className="flex items-start gap-2 px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-100 text-xs text-emerald-800">
          <MessageCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <div>
            Once linked, reception can send appointment reminders, confirmations, prescription summaries, and overdue invoice nudges — all from the clinic&apos;s real WhatsApp number.
          </div>
        </div>
      </div>
    </Modal>
  );
}
