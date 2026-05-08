/**
 * @system MediCore ERP — String case utilities
 *
 * Used to normalize human names (Patient.firstName/lastName,
 * User.name) at the persistence boundary so the database always
 * stores capitalized values regardless of how the API caller typed
 * them. Wired into prisma.ts via a Client Extension; routes don't
 * need to call these directly.
 *
 * Both helpers are SAFE on:
 *   - null / undefined / non-string  → returned unchanged
 *   - empty / whitespace-only        → trimmed to ""
 *   - already-capitalized            → idempotent (no-op)
 *   - leading/trailing whitespace    → trimmed
 */

/** Uppercase the first character. Rest is preserved as-typed.
 *  "ujala shahid" → "Ujala shahid". */
export function capitalizeFirst<T>(value: T): T {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (trimmed.length === 0) return trimmed as T;
  return (trimmed.charAt(0).toUpperCase() + trimmed.slice(1)) as T;
}

/** Uppercase the first character of EACH word; preserve the rest of
 *  each word as-typed (so "JOHN" stays "JOHN" — we don't overwrite
 *  intentional all-caps). Handles hyphens and apostrophes inside
 *  names: "mary-jane" → "Mary-Jane", "o'connor" → "O'Connor".
 *  "ujala shahid" → "Ujala Shahid". */
export function capitalizeWords<T>(value: T): T {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (trimmed.length === 0) return trimmed as T;
  // Collapse internal whitespace runs to single spaces so the saved
  // value is canonical: "  ujala   shahid  " → "Ujala Shahid".
  return trimmed
    .replace(/\s+/g, " ")
    .replace(/(^|[\s'-])([a-z])/g, (_, sep, c) => sep + c.toUpperCase()) as T;
}

/** Normalize an email address for storage: lowercase + trim. RFC
 *  technically allows case-sensitive local parts, but every mail
 *  provider in practice treats them case-insensitively, and our
 *  partial-unique index on Patient.email assumes a single canonical
 *  form. Same null/undefined/non-string safety as the others. */
export function normalizeEmail<T>(value: T): T {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (trimmed.length === 0) return trimmed as T;
  return trimmed.toLowerCase() as T;
}
