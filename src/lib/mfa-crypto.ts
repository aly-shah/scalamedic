/**
 * MFA secret encryption-at-rest.
 *
 * TOTP secrets stored in the DB are encrypted with AES-256-GCM
 * using a server-side key from env (MFA_SECRET_KEY). The key MUST
 * be a 32-byte value (we accept it as either base64 or 64-char
 * hex). A DB dump without the env key is therefore useless for
 * generating TOTP codes — the standard mitigation for "I stole the
 * Postgres backup" attacks.
 *
 * Per-record IVs (12 bytes for GCM) and auth tags (16 bytes) are
 * stored alongside the ciphertext. All three components are base64
 * for portability inside text columns.
 */
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGO = "aes-256-gcm";

function getKey(): Buffer {
  const raw = process.env.MFA_SECRET_KEY;
  if (!raw) {
    throw new Error("MFA_SECRET_KEY is not set");
  }
  // Accept hex (64 chars) or base64 (44 chars). Reject anything
  // else early so we don't deploy a misconfigured key by accident.
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    return Buffer.from(raw, "hex");
  }
  const buf = Buffer.from(raw, "base64");
  if (buf.length !== 32) {
    throw new Error("MFA_SECRET_KEY must decode to exactly 32 bytes (hex64 or base64)");
  }
  return buf;
}

export interface EncryptedSecret {
  ciphertext: string;  // base64
  iv: string;          // base64
  authTag: string;     // base64
}

export function encryptSecret(plaintext: string): EncryptedSecret {
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    ciphertext: enc.toString("base64"),
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
  };
}

export function decryptSecret(enc: EncryptedSecret): string {
  const key = getKey();
  const iv = Buffer.from(enc.iv, "base64");
  const authTag = Buffer.from(enc.authTag, "base64");
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(authTag);
  const dec = Buffer.concat([
    decipher.update(Buffer.from(enc.ciphertext, "base64")),
    decipher.final(),
  ]);
  return dec.toString("utf8");
}
