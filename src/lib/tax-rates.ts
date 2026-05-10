/**
 * @system MediCore ERP — Tax rate resolver (per-tenant scheme aware)
 *
 * Single source of truth for the tax rate that applies to a given
 * invoice line. Each tenant carries a `taxScheme` ("PK" | "US", v61);
 * the rate for a (scheme, category) tuple is looked up below.
 *
 * Schemes shipped:
 *   PK — 3% medical / 8% cosmetic / 8% slimming, 3% consultation
 *        (Pakistani GST-style on aesthetic services).
 *   US — 0% medical / 8% cosmetic / 8% slimming, 0% consultation
 *        (most US states exempt medical from sales tax; cosmetic
 *        services are typically taxable, with rates that vary by
 *        state — 8% is a sane default. Per-state overrides can ride
 *        on top of this if/when a tenant onboards with stricter
 *        local rates.)
 *
 * Used both server-side (invoice creation) and client-side (live total
 * preview in the check-in pay panel + create invoice modal). Treatments
 * carry the catalog `taxCategory`; consultation lines (no treatmentId)
 * get the consultation rate for the scheme.
 */
import type { TaxCategory } from "@prisma/client";

export type TaxScheme = "PK" | "US";

const RATES_BY_SCHEME: Record<TaxScheme, Record<TaxCategory, number>> = {
  PK: { MEDICAL: 3, COSMETIC: 8, SLIMMING: 8 },
  US: { MEDICAL: 0, COSMETIC: 8, SLIMMING: 8 },
};

const CONSULTATION_BY_SCHEME: Record<TaxScheme, number> = {
  PK: 3,
  US: 0,
};

/** Back-compat default-scheme exports — kept so any caller written
 *  against the pre-v61 API keeps producing PK-scheme rates without
 *  touching the call site. New callers should pass an explicit scheme. */
export const TAX_RATES: Record<TaxCategory, number> = RATES_BY_SCHEME.PK;
export const CONSULTATION_TAX_RATE = CONSULTATION_BY_SCHEME.PK;

export const TAX_CATEGORY_LABELS: Record<TaxCategory, string> = {
  MEDICAL: "Medical (3%)",
  COSMETIC: "Cosmetic (8%)",
  SLIMMING: "Slimming (8%)",
};

/** Resolve the tax rate (as a percentage) for a given category in a
 *  given scheme. Pass `null`/`undefined` for consultation lines. The
 *  scheme arg defaults to "PK" so callers that haven't been updated
 *  to pass tenant.taxScheme keep producing PK-scheme rates. */
export function rateForTaxCategory(
  cat: TaxCategory | null | undefined,
  scheme: TaxScheme = "PK",
): number {
  if (!cat) return CONSULTATION_BY_SCHEME[scheme];
  return RATES_BY_SCHEME[scheme][cat] ?? CONSULTATION_BY_SCHEME[scheme];
}

/** Resolve the consultation rate for a given tenant scheme. */
export function consultationRateFor(scheme: TaxScheme = "PK"): number {
  return CONSULTATION_BY_SCHEME[scheme];
}

/** Compute the tax amount for a line. `subtotal` is post-discount.
 *  Returns a number rounded to 2dp so totals add up cleanly. */
export function calcLineTax(subtotalAfterDiscount: number, ratePercent: number): number {
  const raw = (subtotalAfterDiscount * ratePercent) / 100;
  return Math.round(raw * 100) / 100;
}

/** Coerce an arbitrary string into a known TaxScheme. The DB CHECK on
 *  tenants."taxScheme" already restricts the column to {PK, US}, but
 *  callers reading raw rows (or strings from query params) want a
 *  narrowing helper. Defaults to PK for unknown / nullish inputs. */
export function asTaxScheme(input: unknown): TaxScheme {
  return input === "US" ? "US" : "PK";
}

/** Reverse-derive the tax that's embedded in a tax-inclusive gross
 *  amount. Use for consultation lines where the doctor's
 *  consultationFee already includes the 3% — the patient hands over
 *  exactly the gross figure and we split out the embedded GST so the
 *  receipt prints "Sub Total Excl. GST" + "GST 3%" + "Net Amount". */
export function calcInclusiveTax(grossAfterDiscount: number, ratePercent: number): number {
  if (grossAfterDiscount <= 0 || ratePercent <= 0) return 0;
  const raw = (grossAfterDiscount * ratePercent) / (100 + ratePercent);
  return Math.round(raw * 100) / 100;
}
