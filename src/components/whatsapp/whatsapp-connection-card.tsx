"use client";

/**
 * WhatsApp connection card — drops onto any dashboard or settings
 * page. Shows current link state, the linked clinic number when
 * connected, and a "Connect WhatsApp" CTA that pops the QR modal.
 *
 * Polls /api/whatsapp/status every 5s. Cheap (single int + string
 * over the wire) and keeps the card honest if the phone goes
 * offline / Meta logs us out / etc.
 */
import { useEffect, useState } from "react";
import {
  MessageCircle, QrCode, CheckCircle2, AlertTriangle, LogOut, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useAuth } from "@/lib/auth-context";
import { WhatsAppQRModal } from "./whatsapp-qr-modal";

export type WAStatusPayload = {
  connected: boolean;
  state: "connecting" | "open" | "close" | "logged_out";
  phone: string | null;
  serviceAvailable: boolean;
  serviceError?: string;
};

export function WhatsAppConnectionCard({ compact }: { compact?: boolean }) {
  const { user } = useAuth();
  const isAdminOrReception = !!user && ["SUPER_ADMIN", "ADMIN", "RECEPTIONIST"].includes(user.role);
  const isAdmin = !!user && ["SUPER_ADMIN", "ADMIN"].includes(user.role);
  const [status, setStatus] = useState<WAStatusPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [showQR, setShowQR] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const { confirm } = useConfirm();

  useEffect(() => {
    let cancelled = false;
    let timer: NodeJS.Timeout | null = null;
    const poll = async () => {
      try {
        const res = await fetch("/api/whatsapp/status", { credentials: "include" });
        const d = await res.json();
        if (!cancelled && d.success) setStatus(d.data);
      } catch { /* ignore — keep showing last known */ }
      finally {
        if (!cancelled) {
          setLoading(false);
          // Faster poll while connecting (QR rotation / waiting for scan),
          // slower poll once stable.
          const next = status?.state === "connecting" ? 3000 : 5000;
          timer = setTimeout(poll, next);
        }
      }
    };
    poll();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleDisconnect() {
    const ok = await confirm({
      title: "Disconnect WhatsApp?",
      message:
        "The clinic's WhatsApp will unlink and you'll need to scan the QR again from the clinic phone to send messages. Any reminders queued for the next cron run will fail until you re-link.",
      confirmLabel: "Disconnect",
      variant: "danger",
    });
    if (!ok) return;
    setDisconnecting(true);
    try {
      await fetch("/api/whatsapp/disconnect", { method: "POST", credentials: "include" });
      // Status will flip via the next poll tick.
    } finally {
      setDisconnecting(false);
    }
  }

  if (loading) {
    return (
      <Card padding="lg">
        <div className="flex items-center gap-3 text-stone-400 text-sm">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading WhatsApp status…
        </div>
      </Card>
    );
  }

  // Service offline — sidecar down or env var missing. Shows once,
  // doesn't poll-storm. Admin-actionable error.
  if (!status?.serviceAvailable) {
    return (
      <Card padding="lg">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-stone-100 text-stone-400 flex items-center justify-center shrink-0">
            <MessageCircle className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-stone-900">WhatsApp service offline</p>
            <p className="text-xs text-stone-500 mt-0.5">
              The WhatsApp sidecar isn&apos;t reachable. Reminders + manual sends won&apos;t go through.
            </p>
            {isAdmin && status?.serviceError && (
              <p className="text-[11px] text-stone-400 mt-1 font-mono truncate">{status.serviceError}</p>
            )}
          </div>
        </div>
      </Card>
    );
  }

  const connected = status.connected;
  const state = status.state;
  const phone = status.phone;

  return (
    <>
      <Card padding="lg">
        <div className="flex items-start gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
            connected ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"
          }`}>
            <MessageCircle className="w-5 h-5" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-semibold text-stone-900">WhatsApp</p>
              {connected ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <CheckCircle2 className="w-3 h-3" /> Linked
                </span>
              ) : state === "connecting" ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                  <Loader2 className="w-3 h-3 animate-spin" /> Linking
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-stone-100 text-stone-600 border border-stone-200">
                  <AlertTriangle className="w-3 h-3" /> Not linked
                </span>
              )}
            </div>

            <p className="text-xs text-stone-500 mt-1">
              {connected
                ? `Linked as ${formatPhone(phone)} — reminders + manual sends go through this number.`
                : compact
                  ? "Scan a QR to link the clinic number."
                  : "Link the clinic's WhatsApp number once. Reception, billing, and the cron reminder job all send through it."}
            </p>

            {!compact && (
              <div className="flex items-center gap-2 mt-3 flex-wrap">
                {!connected && isAdminOrReception && (
                  <Button
                    type="button"
                    size="sm"
                    iconLeft={<QrCode className="w-3.5 h-3.5" />}
                    onClick={() => setShowQR(true)}
                  >
                    {state === "connecting" ? "Show QR" : "Connect WhatsApp"}
                  </Button>
                )}
                {connected && isAdmin && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    iconLeft={
                      disconnecting
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : <LogOut className="w-3.5 h-3.5" />
                    }
                    onClick={handleDisconnect}
                    disabled={disconnecting}
                  >
                    {disconnecting ? "Disconnecting…" : "Disconnect"}
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      </Card>

      <WhatsAppQRModal
        isOpen={showQR}
        onClose={() => setShowQR(false)}
        onConnected={() => setShowQR(false)}
      />
    </>
  );
}

function formatPhone(p: string | null): string {
  if (!p) return "";
  // 923001234567 → +92 300 1234567
  if (p.startsWith("92") && p.length >= 12) {
    return `+92 ${p.slice(2, 5)} ${p.slice(5)}`;
  }
  return `+${p}`;
}
