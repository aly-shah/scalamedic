/**
 * @system MediCore ERP — Tax rate resolver
 *
 * Single source of truth for the tax rate that applies to a given
 * invoice line. Treatments carry a `taxCategory` field on the catalog
 * row; consultation lines (no treatmentId) get the consultation rate.
 *
 *   MEDICAL    3%   — most clinical procedures
 *   COSMETIC   8%   — purely aesthetic
 *   SLIMMING   8%   — body-contouring / weight management
 *   (consult)  3%   — appointment fee with no treatment link
 *
 * Used both server-side (invoice creation) and client-side (live total
 * preview in the check-in pay panel + create invoice modal).
 */
import type { TaxCategory } from "@prisma/client";

export const TAX_RATES: Record<TaxCategory, number> = {
  MEDICAL: 3,
  COSMETIC: 8,
  SLIMMING: 8,
};

export const CONSULTATION_TAX_RATE = 3;

export const TAX_CATEGORY_LABELS: Record<TaxCategory, string> = {
  MEDICAL: "Medical (3%)",
  COSMETIC: "Cosmetic (8%)",
  SLIMMING: "Slimming (8%)",
};

/** Resolve the tax rate (as a percentage) for a given category. Pass
 *  `null`/`undefined` for consultation lines. */
export function rateForTaxCategory(cat: TaxCategory | null | undefined): number {
  if (!cat) return CONSULTATION_TAX_RATE;
  return TAX_RATES[cat] ?? CONSULTATION_TAX_RATE;
}

/** Compute the tax amount for a line. `subtotal` is post-discount.
 *  Returns a number rounded to 2dp so totals add up cleanly. */
export function calcLineTax(subtotalAfterDiscount: number, ratePercent: number): number {
  const raw = (subtotalAfterDiscount * ratePercent) / 100;
  return Math.round(raw * 100) / 100;
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
