/**
 * Server-side proxy helper for the whatsapp-server sidecar.
 *
 * The browser never talks to localhost:3003 directly — every call
 * goes through MediCore's /api/whatsapp/* routes which forward here.
 * That keeps the JWT auth gate in front of every action and keeps
 * the service token (which is the keys-to-the-kingdom for the WA
 * session) server-side only.
 */

const WA_BASE_URL = process.env.WA_INTERNAL_URL || "http://127.0.0.1:3003";
const WA_TOKEN = process.env.WHATSAPP_SERVICE_TOKEN || "";

interface WAResult<T = unknown> {
  ok: boolean;
  status: number;
  data?: T;
  error?: string;
}

async function call<T = unknown>(
  path: string,
  init?: RequestInit,
): Promise<WAResult<T>> {
  if (!WA_TOKEN) {
    return { ok: false, status: 503, error: "WhatsApp service token not configured" };
  }
  try {
    const res = await fetch(`${WA_BASE_URL}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        "X-Service-Token": WA_TOKEN,
        ...(init?.headers || {}),
      },
      // 8s — sock.sendMessage usually returns under 1s, status under
      // 100ms. If the sidecar is hung we want to fail fast so the UI
      // can render "service unavailable" instead of spinning.
      signal: AbortSignal.timeout(8000),
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        error: typeof json.error === "string" ? json.error : `HTTP ${res.status}`,
      };
    }
    return { ok: true, status: res.status, data: json as T };
  } catch (e) {
    // Sidecar down / DNS fail / timeout — treat as service unavailable
    // so callers can degrade gracefully (e.g. show "Connect WhatsApp"
    // with a "service offline" badge instead of crashing the UI).
    return {
      ok: false,
      status: 503,
      error: e instanceof Error ? e.message : "WhatsApp service unreachable",
    };
  }
}

export type WAStatus = {
  connected: boolean;
  state: "connecting" | "open" | "close" | "logged_out";
  phone: string | null;
  lastEventAt: string;
};

export type WAQR = {
  connected: boolean;
  state: WAStatus["state"];
  qr: string | null; // data URL or null
};

export const whatsapp = {
  status: () => call<WAStatus>("/status"),
  qr: () => call<WAQR>("/qr"),
  send: (to: string, message: string) =>
    call<{ success: boolean; messageId?: string; to?: string }>("/send", {
      method: "POST",
      body: JSON.stringify({ to, message }),
    }),
  disconnect: () =>
    call<{ success: boolean }>("/disconnect", { method: "POST" }),
};
