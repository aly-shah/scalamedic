"use client";

/**
 * Tenant-aware currency formatter for client components.
 *
 * Wraps useAuth() so the caller doesn't have to repeat the
 * `tenant.currency / tenant.locale` plumbing on every page. Returns
 * a curried formatter — if the auth context hasn't hydrated yet, the
 * formatter falls back to the platform defaults (PKR / en-PK), which
 * is what existing callers saw before v61.
 *
 *   import { useFormatCurrency } from "@/hooks/use-format-currency";
 *   const formatCurrency = useFormatCurrency();
 *   <span>{formatCurrency(invoice.total)}</span>
 *
 * For server-side rendering / route handlers, call
 * lib/utils.ts:formatCurrency() directly with explicit currency +
 * locale resolved via getCurrentTenant().
 */
import { useCallback } from "react";
import { useAuth } from "@/lib/auth-context";
import { formatCurrency as fmt } from "@/lib/utils";

export function useFormatCurrency() {
  const { tenant } = useAuth();
  const currency = tenant?.currency ?? "PKR";
  const locale = tenant?.locale ?? "en-PK";
  return useCallback(
    (amount: number) => fmt(amount, currency, locale),
    [currency, locale],
  );
}
