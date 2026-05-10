import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const CLINIC_TZ = "Asia/Karachi";
export const CLINIC_TZ_OFFSET = "+05:00";

export function getClinicToday(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: CLINIC_TZ });
}

export function toClinicDay(value: string | Date): string {
  const d = value instanceof Date ? value : new Date(value);
  return d.toLocaleDateString("en-CA", { timeZone: CLINIC_TZ });
}

// Prisma's @db.Date columns are serialized using the UTC portion of any Date
// object passed as a filter bound. To match a DATE-only row stored as
// '2026-04-24', we need bounds whose UTC date is 2026-04-24 — i.e. UTC
// midnight, NOT PKT midnight (which would be 2026-04-23T19:00:00Z and shift
// the filter back one day). Hence the +00:00 offset here rather than +05:00.
export function clinicDayRange(dateStr: string): { gte: Date; lt: Date } {
  const gte = new Date(`${dateStr}T00:00:00Z`);
  const lt = new Date(gte.getTime() + 24 * 60 * 60 * 1000);
  return { gte, lt };
}

// For DateTime columns (Invoice.createdAt, Payment.processedAt, etc) where
// the actual instant matters. We want "all rows that happened on this PKT
// day", which is PKT midnight to PKT midnight — not UTC midnight.
//
// Why this is separate from clinicDayRange: an invoice created at
// 2026-05-02T21:07Z is actually 2026-05-03T02:07 PKT, so PKT-wise it's a
// May 3 invoice. UTC bounds for "May 2" would still match it (21:07 < 24:00)
// — that's the wrong day. The check-in receipt on the dashboard formats
// it as "May 3" via toLocaleDateString(timeZone: PKT), so the daily report
// has to agree.
export function clinicDayRangeTz(dateStr: string): { gte: Date; lt: Date } {
  const gte = new Date(`${dateStr}T00:00:00${CLINIC_TZ_OFFSET}`);
  const lt = new Date(gte.getTime() + 24 * 60 * 60 * 1000);
  return { gte, lt };
}

export function shiftDay(dateStr: string, deltaDays: number): string {
  const base = new Date(`${dateStr}T12:00:00${CLINIC_TZ_OFFSET}`);
  base.setUTCDate(base.getUTCDate() + deltaDays);
  return base.toLocaleDateString("en-CA", { timeZone: CLINIC_TZ });
}

// Default tenant locale + currency. Backwards-compatible — pre-v61
// tenants and any caller that hasn't migrated to useFormatCurrency()
// still render PKR amounts the way they always did.
//
// Decimal precision is currency-specific:
//   PKR — no fractional rupees in this market; round to whole.
//   USD — cents always shown.
// More currencies can be added here without touching call sites.
const CURRENCY_FRACTION_DIGITS: Record<string, number> = {
  PKR: 0,
  USD: 2,
};

/**
 * Format an amount in the tenant's currency. Server-side callers pass
 * `currency` and `locale` explicitly (resolve via getCurrentTenant()).
 * Client-side React components should use the useFormatCurrency() hook
 * instead — it pulls the values from auth-context and curries them in.
 */
export function formatCurrency(
  amount: number,
  currency: string = "PKR",
  locale: string = "en-PK",
): string {
  const fractionDigits = CURRENCY_FRACTION_DIGITS[currency] ?? 2;
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(amount);
}

/**
 * Compute integer age in years from an ISO date / Date. Used by client
 * pages because the API returns dateOfBirth, not a precomputed age.
 * Returns null if the input is unparseable or in the future.
 */
export function computeAge(dob: string | Date | null | undefined): number | null {
  if (!dob) return null;
  const d = typeof dob === "string" ? new Date(dob) : dob;
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  if (d > now) return null;
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age >= 0 ? age : null;
}

/**
 * Normalize a patient's allergies field into a flat string[] of labels.
 * The API returns full PatientAllergy[] (objects with .allergen) but
 * older mock data shipped flat strings, and several pages still assume
 * the latter shape. Centralising the read here means each consumer
 * just calls patientAllergyLabels(p) and gets strings either way.
 */
export function patientAllergyLabels(
  allergies: Array<{ allergen?: string } | string> | null | undefined
): string[] {
  if (!allergies) return [];
  return allergies
    .map((a) => (typeof a === "string" ? a : a?.allergen ?? ""))
    .filter((s): s is string => !!s && s.length > 0);
}

export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: CLINIC_TZ,
  }).format(new Date(date));
}

export function formatTime(date: string | Date): string {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: CLINIC_TZ,
  }).format(new Date(date));
}

export function formatDateTime(date: string | Date): string {
  return `${formatDate(date)} ${formatTime(date)}`;
}

export function getInitials(name: string): string {
  return (name || "?")
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function generateId(prefix: string, num: number): string {
  return `${prefix}-${num.toString().padStart(4, "0")}`;
}

export function calculateAge(dob: string | Date): number {
  const today = new Date();
  const birthDate = new Date(dob);
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
}

export function calculateBMI(weightKg: number, heightCm: number): string {
  const heightM = heightCm / 100;
  const bmi = weightKg / (heightM * heightM);
  return bmi.toFixed(1);
}

export function timeAgo(date: string | Date): string {
  const now = new Date();
  const past = new Date(date);
  const diffMs = now.getTime() - past.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return formatDate(date);
}
