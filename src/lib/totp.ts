/**
 * RFC 6238 TOTP — hand-rolled (no third-party dep).
 *
 * Used for two purposes:
 *   1. generateSecret() — produce a fresh 20-byte base32 secret to
 *      hand to the authenticator app (Google Authenticator, Authy,
 *      1Password, etc.).
 *   2. verifyCode(secret, code) — check a 6-digit code against the
 *      current 30-second window plus ±1 window of clock skew.
 *
 * `otpauthURL()` produces the otpauth:// string the user typically
 * scans as a QR code during enrollment.
 */
import { createHmac, randomBytes } from "crypto";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const STEP_SECONDS = 30;
const DIGITS = 6;
const WINDOW_SLACK = 1; // accept ±1 step for clock skew

function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (let i = 0; i < buf.length; i++) {
    value = (value << 8) | buf[i];
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 0x1f];
      bits -= 5;
    }
  }
  if (bits > 0) {
    out += BASE32_ALPHABET[(value << (5 - bits)) & 0x1f];
  }
  return out;
}

function base32Decode(s: string): Buffer {
  const clean = s.replace(/=+$/g, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const c of clean) {
    const idx = BASE32_ALPHABET.indexOf(c);
    if (idx < 0) throw new Error("Invalid base32 character");
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** Generate a fresh 20-byte (160-bit) secret, base32-encoded. */
export function generateSecret(): string {
  return base32Encode(randomBytes(20));
}

/** Build the otpauth:// URI used as a QR-code source. */
export function otpauthURL(opts: {
  secret: string;        // base32
  account: string;       // doctor email
  issuer: string;        // clinic / app name
}): string {
  const params = new URLSearchParams();
  params.set("secret", opts.secret);
  params.set("issuer", opts.issuer);
  params.set("algorithm", "SHA1");
  params.set("digits", String(DIGITS));
  params.set("period", String(STEP_SECONDS));
  const label = `${encodeURIComponent(opts.issuer)}:${encodeURIComponent(opts.account)}`;
  return `otpauth://totp/${label}?${params.toString()}`;
}

function hotp(secret: Buffer, counter: number): string {
  // RFC 4226: 8-byte big-endian counter HMAC-SHA1, dynamic-truncate
  // to 31-bit int, modulo 10^digits. Counter values for TOTP at
  // 30-second steps stay well within 2^31 for the next ~1700 years,
  // so JS number precision is fine here. We split high/low halves
  // to avoid >>> on a number > 2^31 without invoking BigInt.
  const counterBuf = Buffer.alloc(8);
  const high = Math.floor(counter / 0x100000000);
  const low = counter >>> 0; // force 32-bit unsigned
  counterBuf.writeUInt32BE(high, 0);
  counterBuf.writeUInt32BE(low, 4);
  const hmac = createHmac("sha1", secret).update(counterBuf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(code % 10 ** DIGITS).padStart(DIGITS, "0");
}

/**
 * Verify a 6-digit code against the secret. Accepts the current
 * 30-second window plus ±WINDOW_SLACK windows to tolerate clock
 * drift between server and authenticator.
 */
export function verifyCode(base32Secret: string, code: string, atMs?: number): boolean {
  const cleanCode = code.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(cleanCode)) return false;
  const secret = base32Decode(base32Secret);
  const now = Math.floor((atMs ?? Date.now()) / 1000);
  const counter = Math.floor(now / STEP_SECONDS);
  for (let w = -WINDOW_SLACK; w <= WINDOW_SLACK; w++) {
    if (hotp(secret, counter + w) === cleanCode) return true;
  }
  return false;
}
