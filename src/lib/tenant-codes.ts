/**
 * @system ScalaMedic — race-safe per-tenant code generation
 *
 * Replaces the MAX(code)+1 pattern in PT-NNNN / APT-NNNN /
 * INV-YYYY-NNNN / CLM-YYYY-NNNN issuance. MAX+1 in a transaction
 * is correct under single-writer load but two concurrent inserts
 * see the same MAX and the second loses on the per-tenant unique
 * index — a 409 the user has to retry.
 *
 * nextCode() uses INSERT … ON CONFLICT DO UPDATE … RETURNING
 * against the tenant_code_counters table (v65). The whole
 * sequence is atomic at the row level: Postgres serialises any
 * concurrent INSERT on the same (tenantId, codePrefix) primary
 * key, returns a unique nextNumber to each caller, and never
 * collides.
 *
 * Call inside a transaction together with the row that uses the
 * code so a failed insert rolls back the counter increment too:
 *
 *   await prisma.$transaction(async (tx) => {
 *     const code = await nextCode(tx, tenantId, "APT");
 *     return tx.appointment.create({ data: { appointmentCode: code, … } });
 *   });
 *
 * Year-rolled prefixes (e.g. "INV-2026", "CLM-2026") are handled
 * by passing the full prefix including the year. On 1 Jan, the
 * first call with the new year's prefix creates a fresh counter
 * row starting at 1 — no rollover plumbing needed elsewhere.
 *
 * The v65 migration seeds the counters from current MAX values
 * so legacy rows and new codes don't collide.
 */
import type { Prisma, PrismaClient } from "@prisma/client";

type Tx = Prisma.TransactionClient | PrismaClient;

/**
 * Issue the next per-tenant code with the given prefix.
 *
 * @param tx       prisma client OR a $transaction client; passing
 *                 the same tx as your dependent INSERT keeps the
 *                 counter increment atomic with the row create.
 * @param tenantId target tenant
 * @param prefix   "PT" | "APT" | "INV-2026" | "CLM-2026" | …
 *                 Pass the full prefix you want before the dash;
 *                 the helper appends `-NNNN` (zero-padded).
 * @param pad      width of the numeric suffix (default 4 = NNNN)
 */
export async function nextCode(
  tx: Tx,
  tenantId: string,
  prefix: string,
  pad: number = 4,
): Promise<string> {
  // Atomic increment. ON CONFLICT path returns the previous
  // nextNumber (so the first caller gets 1, the second 2, etc.).
  // First-ever call for a (tenant, prefix) takes the INSERT path
  // with nextNumber=2 and returns 1 via the SELECT.
  const rows = await tx.$queryRaw<Array<{ issued: number }>>`
    INSERT INTO tenant_code_counters ("tenantId", "codePrefix", "nextNumber", "createdAt", "updatedAt")
    VALUES (${tenantId}::uuid, ${prefix}, 2, NOW(), NOW())
    ON CONFLICT ("tenantId", "codePrefix") DO UPDATE
      SET "nextNumber" = tenant_code_counters."nextNumber" + 1,
          "updatedAt"  = NOW()
    RETURNING ("nextNumber" - 1)::int AS issued
  `;
  const issued = rows[0]?.issued;
  if (typeof issued !== "number") {
    throw new Error(`nextCode: counter for (${tenantId}, ${prefix}) returned no row`);
  }
  return `${prefix}-${String(issued).padStart(pad, "0")}`;
}
