/**
 * Patient invite token helpers.
 *
 * Tokens are 32 random bytes encoded as base64url. The plaintext is
 * shown to the admin once and dispatched to the patient out-of-band
 * (SMS/email/WhatsApp). Only the SHA-256 of the token is stored in
 * `patient_invites.tokenHash`, so a DB dump alone doesn't yield
 * redeemable invites.
 *
 * Default expiry: 7 days. Tunable via the second arg.
 */
import { createHash, randomBytes } from "crypto";

export const INVITE_TTL_DAYS = 7;

export interface IssuedInvite {
  /** Plaintext token — show ONCE to admin, never persist. */
  token: string;
  /** SHA-256 hex of the token; this is what goes in the DB. */
  tokenHash: string;
  /** When the invite stops being redeemable. */
  expiresAt: Date;
}

/** Generate a fresh invite token + hash + expiry. */
export function issueInvite(ttlDays: number = INVITE_TTL_DAYS): IssuedInvite {
  // 32 bytes → ~43-char base64url. Plenty of entropy; URL-safe so
  // it survives going through SMS/email links unencoded.
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + ttlDays * 86400_000);
  return { token, tokenHash, expiresAt };
}

/** SHA-256 hex of an invite token. Stable: identical input → identical hex. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
