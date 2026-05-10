"use client";

import {
  Receipt, DollarSign, AlertTriangle, Package,
  Banknote, CreditCard, Building2, ShoppingBag,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { StatCard } from "@/components/ui/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useDashboardStats, useInvoices } from "@/hooks/use-queries";
import { CLINIC_TZ } from "@/lib/utils";
import { useFormatCurrency } from "@/hooks/use-format-currency";
import { useModuleStore } from "@/modules/core/store";
import { useAuth } from "@/lib/auth-context";

// Defensive — the /api/billing/invoices endpoint returns nested
// patient: { firstName, lastName }, but legacy mock data used a flat
// patientName string. Take whichever is present.
function invPatientName(inv: Record<string, unknown>): string {
  const flat = inv.patientName as string | undefined;
  if (flat && flat.trim()) return flat;
  const p = inv.patient as Record<string, unknown> | undefined;
  if (p?.firstName) return `${p.firstName} ${p.lastName ?? ""}`.trim();
  return "Unknown";
}

const paymentMethods = [
  { method: "Cash", amount: 0, icon: <Banknote className="w-6 h-6" />, bg: "bg-emerald-50", text: "text-emerald-600" },
  { method: "Card", amount: 0, icon: <CreditCard className="w-6 h-6" />, bg: "bg-teal-50", text: "text-teal-600" },
  { method: "Insurance", amount: 0, icon: <Building2 className="w-6 h-6" />, bg: "bg-sky-50", text: "text-sky-600" },
  { method: "Package", amount: 0, icon: <ShoppingBag className="w-6 h-6" />, bg: "bg-amber-50", text: "text-amber-600" },
];

export function BillingDashboard() {
  const formatCurrency = useFormatCurrency();
  const router = useRouter();
  const { activities } = useModuleStore();
  const { user } = useAuth();
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const todayLabel = new Date().toLocaleDateString("en-PK", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: CLINIC_TZ });
  const billingActivities = activities.filter((a) => a.moduleId === "billing");

  // API data
  const { data: statsData, isLoading: statsLoading, isError: statsError } = useDashboardStats("billing");
  const stats = (statsData?.data as Record<string, unknown>) || {};
  const pending = (stats.pending as number) || 0;
  const collectedToday = (stats.collectedToday as number) || 0;
  const outstanding = (stats.outstanding as number) || 0;
  const packagesActive = (stats.packagesActive as number) || 0;

  // Payment method breakdown from stats if available
  const methodBreakdown = (stats.paymentMethods as Record<string, number>) || {};
  const resolvedMethods = paymentMethods.map((p) => ({
    ...p,
    amount: (methodBreakdown[p.method.toLowerCase()] as number) || p.amount,
  }));

  const { data: invoicesData, isLoading: invoicesLoading, isError: invoicesError } = useInvoices({ status: "PENDING,PARTIAL,OVERDUE" });
  const pendingInvoices = (Array.isArray(invoicesData?.data) ? invoicesData.data : []) as Array<Record<string, unknown>>;

  return (
    <div className="space-y-4 sm:space-y-6 animate-fade-in" data-id="DASH-BILLING">
      {/* Welcome Card */}
      <div className="bg-gradient-to-r from-teal-600 to-teal-500 rounded-2xl p-4 sm:p-6 text-white shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-teal-100 text-sm">Billing</p>
            <h1 className="text-lg sm:text-xl font-semibold">{greeting}, {user?.name || "there"}</h1>
            <p className="text-teal-100 mt-1 text-sm">{todayLabel} &mdash; Here&apos;s your billing overview.</p>
          </div>
          <Button
            data-id="BILL-CREATE"
            onClick={() => router.push("/billing")}
            className="bg-white/20 hover:bg-white/30 text-white rounded-xl backdrop-blur-sm"
          >
            <Receipt className="w-4 h-4 mr-2" />
            New Invoice
          </Button>
        </div>
      </div>

      {/* Error banner */}
      {(statsError || invoicesError) && (
        <div className="bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl px-4 py-3">
          Unable to load some billing data. Please try refreshing.
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard label="Pending" value={statsLoading ? "Rs 0" : `Rs ${pending.toLocaleString()}`} icon={<Receipt className="w-6 h-6" />} color="warning" />
        <StatCard label="Collected Today" value={statsLoading ? "Rs 0" : `Rs ${collectedToday.toLocaleString()}`} icon={<DollarSign className="w-6 h-6" />} color="success" />
        <StatCard label="Outstanding" value={statsLoading ? "Rs 0" : `Rs ${outstanding.toLocaleString()}`} icon={<AlertTriangle className="w-6 h-6" />} color="danger" />
        <StatCard label="Packages Active" value={statsLoading ? 0 : packagesActive} icon={<Package className="w-6 h-6" />} color="primary" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        {/* Pending Payments */}
        <div className="lg:col-span-2 space-y-4">
          <h2 className="text-base sm:text-lg font-semibold text-stone-900">Pending Payments</h2>
          <div className="space-y-3">
            {invoicesLoading ? (
              <div className="text-sm text-stone-400 py-8 text-center">Loading invoices...</div>
            ) : pendingInvoices.length === 0 ? (
              <div className="text-sm text-stone-400 py-8 text-center">No pending payments.</div>
            ) : (
              pendingInvoices.map((inv) => (
                <div
                  key={inv.id as string}
                  className="bg-white rounded-2xl border border-stone-100 shadow-sm p-4 sm:p-5 flex items-center gap-4 hover:shadow-md transition-shadow"
                >
                  <div className="min-w-[80px]">
                    <p className="text-xs text-stone-400 font-medium">{(inv.invoiceNumber as string) || "—"}</p>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-stone-900 truncate">{invPatientName(inv)}</p>
                  </div>
                  <Badge
                    variant={
                      inv.status === "OVERDUE" ? "danger"
                        : inv.status === "PARTIAL" ? "info"
                        : "warning"
                    }
                  >
                    {(inv.status as string) || "—"}
                  </Badge>
                  <p className="text-base font-semibold text-stone-900 min-w-[80px] text-right">
                    {formatCurrency(Number(inv.total) || 0)}
                  </p>
                  <Button
                    size="sm"
                    data-id="BILL-PAYMENT"
                    onClick={() => router.push(`/billing/invoices/${String(inv.id)}`)}
                    className="bg-teal-600 hover:bg-teal-700 text-white rounded-xl px-5 font-medium"
                  >
                    PAY
                  </Button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Payment Methods */}
        <div className="space-y-4">
          <h2 className="text-base sm:text-lg font-semibold text-stone-900">Payment Methods</h2>
          <div className="grid grid-cols-1 gap-3">
            {resolvedMethods.map((p) => (
              <div
                key={p.method}
                className="bg-white rounded-2xl border border-stone-100 shadow-sm p-4 sm:p-5 flex items-center gap-4 hover:shadow-md transition-shadow"
              >
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${p.bg} ${p.text}`}>
                  {p.icon}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-stone-900">{p.method}</p>
                  <p className="text-xs text-stone-400">This month</p>
                </div>
                <p className="text-base font-semibold text-stone-900">{formatCurrency(p.amount)}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Live Billing Activity */}
      {billingActivities.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-stone-400 uppercase tracking-wider">Live Activity</p>
          {billingActivities.slice(0, 5).map((act) => (
            <div key={act.id} className="flex items-start gap-2 text-sm text-stone-600 py-1">
              <span className="w-1.5 h-1.5 rounded-full bg-teal-400 mt-1.5 shrink-0" />
              <span>{act.message}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
