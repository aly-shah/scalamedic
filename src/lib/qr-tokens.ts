/**
 * @system MediCore ERP — QR token issuer
 *
 * Each thermal receipt prints a QR that points to /qr/[token]. The
 * token is an opaque random string (16 bytes → 22 chars base64url),
 * NEVER an appointmentId or invoiceId, so the URL leaks no PII even
 * if the receipt is photographed.
 *
 * Generation is idempotent per (appointment, invoice) tuple — calling
 * `getOrCreateToken` again with the same target returns the existing
 * row, so reprinting a receipt produces the same QR.
 */
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";

/** 16-byte random token, base64url-encoded → 22 chars (no padding). */
export function generateRawToken(): string {
  return randomBytes(16).toString("base64url");
}

interface TokenTarget {
  appointmentId?: string | null;
  invoiceId?: string | null;
}

/** Find an existing live token for the given target, or create one.
 *  "Live" = not revoked. Expired tokens are still returned so reprints
 *  match what was originally printed. */
export async function getOrCreateToken(
  target: TokenTarget,
  createdById?: string | null,
) {
  const { appointmentId, invoiceId } = target;
  if (!appointmentId && !invoiceId) {
    throw new Error("getOrCreateToken: must provide appointmentId or invoiceId");
  }

  // Prefer an appointment-scoped token if we have one; that's what the
  // staff workflow page resolves against. We deliberately don't gate
  // on invoiceId match for appointment tokens — one appointment can
  // generate multiple invoices and they all share the same QR.
  const existing = await prisma.qrToken.findFirst({
    where: {
      revokedAt: null,
      ...(appointmentId
        ? { appointmentId }
        : { invoiceId, appointmentId: null }),
    },
    orderBy: { createdAt: "desc" },
  });
  if (existing) return existing;

  // Collision-free in practice (~10^-19 per insert at 16 bytes), but
  // the unique constraint will catch the impossible case.
  const token = generateRawToken();
  return prisma.qrToken.create({
    data: {
      token,
      appointmentId: appointmentId ?? null,
      invoiceId: invoiceId ?? null,
      createdById: createdById ?? null,
    },
  });
}

/** Build the absolute URL printed in the QR. Caller passes in the
 *  request origin so we don't hardcode a hostname. */
export function tokenUrl(origin: string, token: string): string {
  return `${origin.replace(/\/$/, "")}/qr/${token}`;
}

/** Token state for the resolver. */
export type TokenState = "VALID" | "REVOKED" | "EXPIRED" | "NOT_FOUND";

export interface ResolvedToken {
  state: TokenState;
  tokenId?: string;
  appointmentId?: string | null;
  invoiceId?: string | null;
}

/** Resolve a raw token from the URL. Returns the state + ids; the
 *  caller decides what to render (staff workflow / thank-you). */
export async function resolveToken(rawToken: string): Promise<ResolvedToken> {
  const row = await prisma.qrToken.findUnique({
    where: { token: rawToken },
    select: {
      id: true,
      appointmentId: true,
      invoiceId: true,
      revokedAt: true,
      expiresAt: true,
    },
  });
  if (!row) return { state: "NOT_FOUND" };
  if (row.revokedAt) {
    return { state: "REVOKED", tokenId: row.id, appointmentId: row.appointmentId, invoiceId: row.invoiceId };
  }
  if (row.expiresAt && row.expiresAt < new Date()) {
    return { state: "EXPIRED", tokenId: row.id, appointmentId: row.appointmentId, invoiceId: row.invoiceId };
  }
  return {
    state: "VALID",
    tokenId: row.id,
    appointmentId: row.appointmentId,
    invoiceId: row.invoiceId,
  };
}
