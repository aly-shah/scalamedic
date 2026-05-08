/**
 * MediCore WhatsApp service
 * ─────────────────────────────────────────────────────────────────
 * Holds a long-lived WhatsApp Web session via Baileys and exposes a
 * small HTTP API for the MediCore main app to call. Runs as a pm2
 * sibling on the prod box (alongside `medicore` and `dialer-server`).
 *
 * Endpoints (all gated by X-Service-Token; bind to 127.0.0.1 only):
 *   GET  /status         { connected, state, phone, lastEvent }
 *   GET  /qr             { connected, qr: "data:image/png;base64,…" | null }
 *   POST /send           { to, message } → forwards via sock.sendMessage
 *   POST /disconnect     logout + wipe session files
 *
 * Why a sidecar (vs in-process inside Next.js):
 *   - Baileys keeps a persistent WebSocket connection. Next.js worker
 *     processes can be recycled, hot-reloaded, or scaled — none of
 *     which works for a long-lived socket.
 *   - Session encryption keys live on disk; isolating them in their
 *     own process limits blast radius if the main app is compromised.
 *   - The sidecar can crash + restart without taking the main app
 *     down, and pm2 keeps it alive.
 *
 * Why Baileys (vs whatsapp-web.js):
 *   - Pure WebSocket, no Puppeteer/Chromium. Smaller image, faster
 *     boot, lower RAM (clinic box runs four apps).
 *   - Actively maintained; matches WhatsApp's protocol updates.
 */
import express, { Request, Response, NextFunction } from "express";
import qrcode from "qrcode";
import pino from "pino";
import {
  default as makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  Browsers,
  fetchLatestBaileysVersion,
  type WASocket,
} from "baileys";
import fs from "node:fs";
import path from "node:path";
import { Boom } from "@hapi/boom";

// ─── Config ──────────────────────────────────────────────────────
const PORT = parseInt(process.env.WA_PORT || "3003", 10);
const HOST = process.env.WA_HOST || "127.0.0.1";
const AUTH_DIR = process.env.WA_AUTH_DIR || "/var/lib/medicore-whatsapp/auth";
const SERVICE_TOKEN = process.env.WHATSAPP_SERVICE_TOKEN;

if (!SERVICE_TOKEN) {
  console.error("FATAL: WHATSAPP_SERVICE_TOKEN env var is required");
  process.exit(1);
}

// Ensure auth dir exists with restrictive perms (session keys live here)
fs.mkdirSync(AUTH_DIR, { recursive: true, mode: 0o700 });

const logger = pino({ level: process.env.LOG_LEVEL || "info" });

// ─── Connection state (module-level singleton) ───────────────────
type ConnState = "connecting" | "open" | "close" | "logged_out";

let sock: WASocket | null = null;
let connState: ConnState = "close";
let phoneNumber: string | null = null; // e.g. "923001234567"
let latestQRRaw: string | null = null;
let latestQRDataUrl: string | null = null;
let lastEventAt: string = new Date().toISOString();

function setState(next: ConnState, why?: string) {
  if (connState === next) return;
  connState = next;
  lastEventAt = new Date().toISOString();
  logger.info({ state: next, why }, "wa state change");
}

// ─── Connect / reconnect ─────────────────────────────────────────
async function connect() {
  setState("connecting");
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

  // Fetch the current WhatsApp Web protocol version. Baileys ships
  // with a baked-in version that goes stale within weeks; without
  // this fetch the WA server returns 405 right after handshake
  // (we hit that during initial integration). The fetcher hits a
  // small JSON endpoint maintained by the Baileys author so we
  // always negotiate against what WA is currently serving.
  let version: [number, number, number] | undefined;
  try {
    const v = await fetchLatestBaileysVersion();
    version = v.version;
    logger.info({ version, isLatest: v.isLatest }, "fetched WA version");
  } catch (e) {
    logger.error({ e }, "failed to fetch WA version, falling back to bundled");
  }

  sock = makeWASocket({
    auth: state,
    version,
    // Identifies the linked device in the user's WhatsApp → Linked
    // Devices list. Reception sees "MediCore Clinic" instead of a
    // generic "Chrome on Linux".
    browser: Browsers.appropriate("MediCore Clinic"),
    syncFullHistory: false,
    logger: pino({ level: "silent" }) as any,
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      latestQRRaw = qr;
      // Serve as a data URL so the front-end can <img src=...> directly.
      latestQRDataUrl = await qrcode.toDataURL(qr, {
        margin: 2,
        width: 300,
        color: { dark: "#0f172a", light: "#ffffff" },
      });
      setState("connecting", "new QR generated");
    }

    if (connection === "open") {
      latestQRRaw = null;
      latestQRDataUrl = null;
      // sock.user.id is "923001234567:1@s.whatsapp.net" — strip the
      // device suffix + jid suffix to get the bare phone number.
      const id = sock?.user?.id || "";
      phoneNumber = id.split(":")[0].split("@")[0] || null;
      setState("open", `connected as ${phoneNumber}`);
    }

    if (connection === "close") {
      const status = (lastDisconnect?.error as Boom)?.output?.statusCode;
      const loggedOut = status === DisconnectReason.loggedOut;

      latestQRRaw = null;
      latestQRDataUrl = null;
      phoneNumber = null;

      if (loggedOut) {
        // User unlinked from their phone (or Meta forced logout).
        // Wipe the session so we start fresh on next connect attempt.
        setState("logged_out", "logged out, clearing session");
        try {
          fs.rmSync(AUTH_DIR, { recursive: true, force: true });
          fs.mkdirSync(AUTH_DIR, { recursive: true, mode: 0o700 });
        } catch (e) {
          logger.error({ e }, "failed to clear auth dir");
        }
      } else {
        // Network blip / server restart / phone offline. Reconnect
        // with backoff so we don't hammer Meta.
        setState("close", `disconnected: ${status ?? "unknown"}`);
        setTimeout(connect, 5000);
      }
    }
  });

  // Forward inbound messages to the main app's webhook so they land
  // in communication_logs alongside reception's outbound replies.
  // We only forward "notify" types (real-time delivery) — historical
  // sync ("append" type) on session restore is ignored to avoid
  // double-logging messages that were already captured.
  sock.ev.on("messages.upsert", (upsert) => {
    if (upsert.type !== "notify") return;
    for (const msg of upsert.messages) {
      // Skip our own outbound (those are recorded already by the
      // main app's send path) and protocol/status messages with no
      // body.
      if (msg.key.fromMe) continue;
      if (!msg.message) continue;
      const text =
        msg.message.conversation ||
        msg.message.extendedTextMessage?.text ||
        msg.message.imageMessage?.caption ||
        msg.message.videoMessage?.caption ||
        "";
      // The remoteJid is "<phone>@s.whatsapp.net" for 1:1 chats and
      // "<group-id>@g.us" for groups — we only forward 1:1.
      const jid = msg.key.remoteJid || "";
      if (!jid.endsWith("@s.whatsapp.net")) continue;
      const phone = jid.split("@")[0]; // bare digits, e.g. "923001234567"
      forwardInbound({
        phone,
        text,
        messageId: msg.key.id || null,
        pushName: msg.pushName || null,
        receivedAt: msg.messageTimestamp
          ? new Date(Number(msg.messageTimestamp) * 1000).toISOString()
          : new Date().toISOString(),
      }).catch((e) => logger.error({ e }, "forward inbound failed"));
    }
  });
}

// ─── Inbound webhook to the main app ─────────────────────────────
// Sidecar → main app HTTP call. Same X-Service-Token shared secret
// the main app uses on its end. Best-effort: a webhook failure is
// logged but never crashes the sidecar — at-most-once is fine, the
// patient can repeat the message if it didn't reach reception.
const MAIN_APP_INBOUND_URL =
  process.env.WA_INBOUND_WEBHOOK_URL ||
  "http://127.0.0.1:3002/api/whatsapp/inbound";

interface InboundPayload {
  phone: string;
  text: string;
  messageId: string | null;
  pushName: string | null;
  receivedAt: string;
}

async function forwardInbound(p: InboundPayload) {
  if (!p.text.trim()) return; // ignore reactions, typing-state, etc
  const r = await fetch(MAIN_APP_INBOUND_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Service-Token": SERVICE_TOKEN || "",
    },
    body: JSON.stringify(p),
  });
  if (!r.ok) {
    logger.error({ status: r.status, phone: p.phone }, "inbound webhook rejected");
  } else {
    logger.info({ phone: p.phone }, "inbound forwarded");
  }
}

connect().catch((e) => {
  logger.error({ e }, "initial connect failed");
  setTimeout(connect, 5000);
});

// ─── Phone normalization ─────────────────────────────────────────
//
// MediCore stores numbers in mixed formats: "+923001234567",
// "03001234567", "923001234567". WhatsApp wants
// "<countrycode><number>@s.whatsapp.net" with no leading + or 0.
//
// Pakistan default — drop a leading 0 and prefix 92. Already-prefixed
// numbers (start with 92) are passed through. International prefixes
// other than 92 are accepted as-is (just digit-stripped).
function toJid(raw: string): string {
  let digits = raw.replace(/[^0-9]/g, "");
  if (!digits) throw new Error("empty phone");
  if (digits.startsWith("0")) digits = "92" + digits.slice(1);
  return `${digits}@s.whatsapp.net`;
}

// ─── HTTP API ────────────────────────────────────────────────────
const app = express();
app.use(express.json());

// Token gate — every request from MediCore carries this header.
app.use((req: Request, res: Response, next: NextFunction) => {
  if (req.path === "/health") return next();
  if (req.headers["x-service-token"] !== SERVICE_TOKEN) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
});

app.get("/health", (_req, res) => {
  res.json({ ok: true, state: connState });
});

app.get("/status", (_req, res) => {
  res.json({
    connected: connState === "open",
    state: connState,
    phone: phoneNumber,
    lastEventAt,
  });
});

app.get("/qr", (_req, res) => {
  if (connState === "open") {
    return res.json({ connected: true, qr: null });
  }
  res.json({
    connected: false,
    state: connState,
    qr: latestQRDataUrl,
  });
});

app.post("/send", async (req, res) => {
  if (connState !== "open" || !sock) {
    return res.status(409).json({ error: "WhatsApp not connected" });
  }
  const { to, message } = req.body as { to?: string; message?: string };
  if (!to || !message) {
    return res.status(400).json({ error: "to and message required" });
  }
  try {
    const jid = toJid(String(to));
    const result = await sock.sendMessage(jid, { text: String(message) });
    res.json({
      success: true,
      messageId: result?.key?.id,
      to: jid,
    });
  } catch (e) {
    logger.error({ e, to }, "send failed");
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

app.post("/disconnect", async (_req, res) => {
  try {
    if (sock) await sock.logout("user requested");
    // logout triggers connection.update with loggedOut → session
    // wipe + state transition handled in the listener above.
    res.json({ success: true });
  } catch (e) {
    logger.error({ e }, "disconnect failed");
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

// ─── Listen ──────────────────────────────────────────────────────
app.listen(PORT, HOST, () => {
  logger.info({ port: PORT, host: HOST, authDir: AUTH_DIR }, "whatsapp-server up");
});
