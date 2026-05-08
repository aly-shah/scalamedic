"use client";

import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  DollarSign,
  Clock,
  CheckCircle,
  AlertTriangle,
  Plus,
  CreditCard,
  FileText,
  User,
  Download,
  Printer,
  Receipt,
  Stethoscope,
  CalendarDays,
} from "lucide-react";
import {
  Button,
  Badge,
  StatCard,
  SearchInput,
} from "@/components/ui";
import { DatePicker } from "@/components/ui/date-picker";
import { invoiceStatusColors } from "@/lib/constants";
import { useInvoices } from "@/hooks/use-queries";
import { LoadingSpinner } from "@/components/ui/loading";
import { formatCurrency, formatDate, getClinicToday, toClinicDay } from "@/lib/utils";
import { downloadCSV } from "@/lib/export";
import { api } from "@/lib/api";
import { CreateInvoiceModal } from "@/components/billing/create-invoice-modal";
import { PaymentModal } from "@/components/billing/payment-modal";
import { useModuleAccess } from "@/modules/core/hooks";
import type { Invoice } from "@/types";
import { useRouter } from "next/navigation";
import Link from "next/link";

// Defensive — /api/billing/invoices returns nested
// patient: { firstName, lastName } and appointment: { doctor: { name } };
// the legacy `Invoice.patientName` flat string isn't actually populated
// by the API. Without these helpers, `inv.patientName.toLowerCase()` in
// the search filter throws and the page crashes silently.
function invPatientName(inv: Invoice): string {
  const flat = (inv as Invoice & { patientName?: string }).patientName;
  if (flat && flat.trim()) return flat;
  const p = (inv as Invoice & { patient?: { firstName?: string; lastName?: string } }).patient;
  if (p?.firstName) return `${p.firstName} ${p.lastName ?? ""}`.trim();
  return "—";
}
function invDoctorName(inv: Invoice): string | null {
  const doc = (inv as Invoice & { appointment?: { doctor?: { name?: string } } }).appointment?.doctor;
  return doc?.name?.trim() || null;
}

const statusBadgeVariant = (status: string) =>
  (invoiceStatusColors[status] || "default") as
    | "success"
    | "warning"
    | "danger"
    | "info"
    | "default";

export default function BillingPage() {
  const router = useRouter();
  const access = useModuleAccess("MOD-BILLING");
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState("ALL");
  // Date scope for the invoice list. Defaults to today's clinic-date
  // so the receptionist sees only the receipts they're working on now;
  // empty string = "show every invoice ever" (the toggle below).
  const [dateFilter, setDateFilter] = useState<string>(getClinicToday());
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);

  const { data: invoicesResponse, isLoading } = useInvoices();
  const invoices = (invoicesResponse?.data || []) as Invoice[];

  // Prime the per-invoice React Query cache from the list payload, so
  // the receptionist clicking View → /billing/invoices/[id] sees the
  // receipt instantly (page reads cache → renders → revalidates).
  // The list response already has patient + branch + items + payments
  // + appointment.doctor, which is everything the receipt needs.
  //
  // Also call router.prefetch so the route's JS bundle is warm by the
  // time the user clicks. The data was already instant via setQueryData,
  // but the bundle download was still happening on first click — that's
  // what was making View feel slow.
  const qc = useQueryClient();
  useEffect(() => {
    invoices.forEach((inv) => {
      qc.setQueryData(["invoice", inv.id], inv);
      router.prefetch(`/billing/invoices/${inv.id}`);
    });
  }, [invoices, qc, router]);

  const filters = ["ALL", "PENDING", "PAID", "PARTIAL", "OVERDUE", "DRAFT"];

  const filtered = invoices.filter((inv) => {
    const q = search.trim().toLowerCase();
    if (q) {
      const hay = [
        inv.invoiceNumber,
        invPatientName(inv),
        invDoctorName(inv) || "",
      ].filter(Boolean).join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (activeFilter !== "ALL" && inv.status !== activeFilter) return false;
    // Day filter — empty string means "all dates". Compares using the
    // clinic timezone so an invoice created at 2026-05-08T19:30Z (which
    // is 2026-05-09T00:30 PKT) is filed under May 9 in the UI.
    if (dateFilter && toClinicDay(inv.createdAt) !== dateFilter) return false;
    return true;
  });

  // Prisma serializes Decimal columns as strings in the JSON response;
  // `sum + inv.total` would do string concatenation when inv.total is a
  // string, e.g. 0 + "5000" → "05000" → "050005000". Force-coerce here.
  const num = (v: unknown): number => {
    if (typeof v === "number") return Number.isFinite(v) ? v : 0;
    if (typeof v === "string") {
      const n = parseFloat(v);
      return Number.isFinite(n) ? n : 0;
    }
    return 0;
  };

  // Money-in-the-bank = sum of `amountPaid` across every non-cancelled,
  // non-refunded invoice. The previous "totalRevenue" summed `total`
  // (incl. drafts and unpaid) which over-stated by a lot.
  const collected = invoices
    .filter((inv) => inv.status !== "CANCELLED" && inv.status !== "REFUNDED")
    .reduce((sum, inv) => sum + num(inv.amountPaid), 0);
  // Outstanding = sum of `balanceDue` on every open invoice (PENDING /
  // PARTIAL / OVERDUE). Excludes draft, cancelled, refunded, paid.
  const pending = invoices
    .filter(
      (inv) => inv.status === "PENDING" || inv.status === "PARTIAL" || inv.status === "OVERDUE",
    )
    .reduce((sum, inv) => sum + num(inv.balanceDue), 0);
  // Overdue is a subset of pending — only the OVERDUE-flagged ones.
  const overdue = invoices
    .filter((inv) => inv.status === "OVERDUE")
    .reduce((sum, inv) => sum + num(inv.balanceDue), 0);
  // Total billed (excl. cancelled / refunded) — keeps the original
  // "Total Revenue" headline number meaningful instead of summing
  // string-typed Decimals.
  const totalRevenue = invoices
    .filter((inv) => inv.status !== "CANCELLED" && inv.status !== "REFUNDED" && inv.status !== "DRAFT")
    .reduce((sum, inv) => sum + num(inv.total), 0);

  if (isLoading) {
    return <div className="flex items-center justify-center py-20"><LoadingSpinner size="lg" /></div>;
  }

  if (!access.canView) {
    return (
      <div className="flex items-center justify-center py-20 text-stone-500">
        You don&apos;t have access to this module.
      </div>
    );
  }

  // Chip counts respect the day scope so "PAID · 3" reflects the date
  // currently selected, not all-time. Search isn't applied here on
  // purpose — the chips help you pivot the view, the search is a
  // narrowing-within filter.
  const dayScoped = dateFilter
    ? invoices.filter((i) => toClinicDay(i.createdAt) === dateFilter)
    : invoices;
  const statusCount = (s: string) =>
    s === "ALL" ? dayScoped.length : dayScoped.filter((i) => i.status === s).length;

  return (
    <div data-id="BILL-INVOICE" className="animate-fade-in space-y-5 sm:space-y-6">
      {/* ===== HERO ===== */}
      <div className="relative overflow-hidden rounded-2xl border border-stone-100 bg-gradient-to-br from-emerald-600 via-green-600 to-teal-600 px-5 py-5 sm:px-7 sm:py-6 text-white">
        <div className="absolute inset-0 opacity-25 [background:radial-gradient(circle_at_30%_30%,#fff_0,transparent_45%)]" />
        <div className="relative flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <Receipt className="w-4 h-4" />
              <span className="text-[11px] uppercase tracking-wider font-semibold opacity-90">Billing</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-semibold leading-tight">Invoices, payments, receipts.</h1>
            <p className="text-sm opacity-90 mt-1 max-w-xl">
              Collect from open invoices, print receipts, and keep an eye on what&apos;s overdue.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Link
              href="/billing/reports"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-white/15 border border-white/30 text-white hover:bg-white/25"
            >
              <CalendarDays className="w-3.5 h-3.5" /> Daily &amp; monthly report
            </Link>
            <Button
              variant="outline"
              size="sm"
              iconLeft={<Download className="w-3.5 h-3.5" />}
              onClick={() => downloadCSV(filtered.map(inv => ({
                Invoice: inv.invoiceNumber,
                Patient: invPatientName(inv),
                Doctor: invDoctorName(inv) || "",
                Status: inv.status,
                Total: inv.total,
                Paid: inv.amountPaid ?? "",
                Balance: inv.balanceDue ?? "",
                Date: formatDate(inv.createdAt),
              })), "invoices")}
              className="!bg-white/15 !border-white/30 !text-white hover:!bg-white/25"
            >
              Export
            </Button>
            <Button
              size="sm"
              iconLeft={<Plus className="w-3.5 h-3.5" />}
              onClick={() => setShowCreateModal(true)}
              className="!bg-white !text-emerald-700 hover:!bg-stone-50"
            >
              New invoice
            </Button>
          </div>
        </div>
      </div>

      {/* ===== KPI CARDS ===== */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard
          label="Total Billed"
          value={formatCurrency(totalRevenue)}
          icon={<DollarSign className="w-5 h-5" />}
          color="primary"
        />
        <StatCard
          label="Pending"
          value={formatCurrency(pending)}
          icon={<Clock className="w-5 h-5" />}
          color="warning"
        />
        <StatCard
          label="Collected"
          value={formatCurrency(collected)}
          icon={<CheckCircle className="w-5 h-5" />}
          color="success"
        />
        <StatCard
          label="Overdue"
          value={formatCurrency(overdue)}
          icon={<AlertTriangle className="w-5 h-5" />}
          color="danger"
        />
      </div>

      {/* ===== SEARCH + FILTER CHIPS ===== */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-3">
        <SearchInput
          placeholder="Search by invoice #, patient, or doctor..."
          value={search}
          onChange={setSearch}
          className="w-full sm:max-w-sm"
        />
        <div className="flex flex-wrap gap-2">
          {filters.map((f) => {
            const count = statusCount(f);
            return (
              <button
                key={f}
                onClick={() => setActiveFilter(f)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-all cursor-pointer flex items-center gap-1.5 ${
                  activeFilter === f
                    ? "bg-teal-600 text-white shadow-sm"
                    : "bg-stone-100 text-stone-500 hover:bg-stone-200"
                }`}
              >
                {f === "ALL" ? "All" : f.charAt(0) + f.slice(1).toLowerCase()}
                <span className={`text-[10px] font-semibold px-1.5 rounded-full ${
                  activeFilter === f ? "bg-white/20" : "bg-white/80 text-stone-500"
                }`}>{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ===== DATE SCOPE ===== */}
      {/* Default scope is today — the receptionist usually only cares
          about the receipts they're collecting on right now. The chips
          let them flip between Today / Yesterday / All-time without
          opening a date picker; for older days the picker takes over. */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] text-stone-400 uppercase tracking-wider mr-1">Date</span>
        {([
          { v: getClinicToday(), label: "Today" },
          { v: toClinicDay(new Date(Date.now() - 24 * 60 * 60 * 1000)), label: "Yesterday" },
          { v: "", label: "All time" },
        ] as const).map((opt) => {
          const active = dateFilter === opt.v;
          return (
            <button
              key={opt.label}
              onClick={() => setDateFilter(opt.v)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all cursor-pointer ${
                active
                  ? "bg-stone-900 text-white shadow-sm"
                  : "bg-stone-100 text-stone-500 hover:bg-stone-200"
              }`}
            >
              {opt.label}
            </button>
          );
        })}
        <div className="w-44">
          <DatePicker
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value || "")}
            placeholder="Pick a day…"
          />
        </div>
        {dateFilter && (
          <span className="text-[11px] text-stone-400">
            Showing {filtered.length} {filtered.length === 1 ? "receipt" : "receipts"} for {formatDate(dateFilter)}
          </span>
        )}
      </div>

      {/* ===== INVOICE ROWS ===== */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-12 text-center">
          <FileText className="w-10 h-10 text-stone-200 mx-auto mb-3" />
          <p className="text-sm text-stone-500 font-medium">
            {search.trim() || activeFilter !== "ALL" || dateFilter
              ? "No invoices match these filters"
              : "No invoices yet"}
          </p>
          <p className="text-xs text-stone-400 mt-1">
            {dateFilter
              ? "Try a different date — receipts default to today."
              : search.trim() || activeFilter !== "ALL"
              ? "Try a different search or clear the status filter."
              : "Create one from a completed visit, or use New invoice."}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-stone-100 shadow-sm overflow-hidden">
          {/* Header — desktop only. Mobile collapses to a stacked row. */}
          <div className="hidden md:grid grid-cols-[1.4fr_1.5fr_1.4fr_0.8fr_1fr_1.6fr] gap-3 px-4 py-2.5 border-b border-stone-100 bg-stone-50/60 text-[10px] uppercase tracking-wider text-stone-400 font-semibold">
            <div>Invoice</div>
            <div>Patient</div>
            <div>Doctor</div>
            <div>Status</div>
            <div className="text-right">Amount</div>
            <div className="text-right pr-1">Actions</div>
          </div>

          <ul className="divide-y divide-stone-100">
            {filtered.map((invoice) => {
              const patientName = invPatientName(invoice);
              const doctorName = invDoctorName(invoice);
              const showCollect =
                invoice.status !== "PAID" &&
                invoice.status !== "DRAFT" &&
                invoice.status !== "CANCELLED" &&
                invoice.status !== "REFUNDED";
              const balance = num(invoice.balanceDue);
              return (
                <li
                  key={invoice.id}
                  className="md:grid md:grid-cols-[1.4fr_1.5fr_1.4fr_0.8fr_1fr_1.6fr] md:gap-3 md:items-center px-4 py-3 hover:bg-stone-50/60 transition-colors"
                >
                  {/* Invoice # + date */}
                  <div className="flex items-center gap-3 mb-2 md:mb-0">
                    <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0">
                      <FileText className="w-4 h-4 text-emerald-600" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-stone-900 truncate">{invoice.invoiceNumber}</p>
                      <p className="text-[11px] text-stone-400">{formatDate(invoice.createdAt)}</p>
                    </div>
                  </div>

                  {/* Patient */}
                  <div className="flex items-center gap-2 mb-1 md:mb-0 min-w-0">
                    <User className="w-3.5 h-3.5 text-stone-400 md:hidden shrink-0" />
                    <span className="text-sm text-stone-700 truncate">{patientName}</span>
                  </div>

                  {/* Doctor */}
                  <div className="flex items-center gap-2 mb-2 md:mb-0 min-w-0">
                    {doctorName ? (
                      <>
                        <Stethoscope className="w-3.5 h-3.5 text-violet-400 md:hidden shrink-0" />
                        <span className="text-sm text-stone-600 truncate">{doctorName}</span>
                      </>
                    ) : (
                      <span className="text-sm text-stone-300">—</span>
                    )}
                  </div>

                  {/* Status */}
                  <div className="mb-2 md:mb-0">
                    <Badge variant={statusBadgeVariant(invoice.status)} dot>
                      {invoice.status}
                    </Badge>
                  </div>

                  {/* Amount */}
                  <div className="flex md:justify-end items-baseline gap-2 md:gap-1 md:flex-col md:items-end mb-2 md:mb-0">
                    <p className="text-sm font-semibold text-stone-900 tabular-nums">
                      {formatCurrency(invoice.total)}
                    </p>
                    {balance > 0 && (
                      <p className="text-[11px] font-medium text-amber-600 tabular-nums">
                        {formatCurrency(balance)} due
                      </p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex md:justify-end items-center gap-1.5 flex-wrap">
                    {showCollect && (
                      <Button
                        size="sm"
                        variant="primary"
                        iconLeft={<CreditCard className="w-3.5 h-3.5" />}
                        onClick={() => {
                          setSelectedInvoice(invoice);
                          setShowPaymentModal(true);
                        }}
                      >
                        Collect
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      iconLeft={<FileText className="w-3.5 h-3.5" />}
                      onClick={() => router.push(`/billing/invoices/${invoice.id}`)}
                    >
                      View
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      title="Print receipt"
                      onClick={() =>
                        window.open(
                          `/billing/invoices/${invoice.id}?print=1`,
                          "_blank",
                          "width=420,height=720,noopener=yes",
                        )
                      }
                    >
                      <Printer className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* ===== MODALS ===== */}
      <CreateInvoiceModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
      />

      {selectedInvoice && (
        <PaymentModal
          isOpen={showPaymentModal}
          onClose={() => {
            setShowPaymentModal(false);
            setSelectedInvoice(null);
          }}
          invoice={selectedInvoice}
        />
      )}

    </div>
  );
}
