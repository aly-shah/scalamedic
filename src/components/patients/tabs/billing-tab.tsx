"use client";

import { useState } from "react";
import { Receipt, CreditCard, RotateCcw } from "lucide-react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from "@/components/ui/table";
import { LoadingSpinner } from "@/components/ui/loading";
import { usePatientBilling } from "@/hooks/use-queries";
import { PaymentModal } from "@/components/billing/payment-modal";
import { formatDate, formatCurrency } from "@/lib/utils";
import type { Invoice } from "@/types";

const statusVariant: Record<string, "success" | "warning" | "danger" | "info" | "default"> = {
  PAID: "success",
  PENDING: "warning",
  PARTIAL: "info",
  OVERDUE: "danger",
  DRAFT: "default",
  CANCELLED: "default",
  REFUNDED: "danger",
};

export function BillingTab({ patientId }: { patientId: string }) {
  const { data: response, isLoading } = usePatientBilling(patientId);
  const [payInvoice, setPayInvoice] = useState<Invoice | null>(null);

  if (isLoading) return <LoadingSpinner />;

  // The billing endpoint returns { invoices: [...], totalOutstanding: number }
  const raw = response?.data as { invoices?: Invoice[]; totalOutstanding?: number } | Invoice[] | undefined;
  const invoices = Array.isArray(raw) ? raw : (raw?.invoices || []);
  const outstanding = Array.isArray(raw)
    ? invoices.filter((i) => ["PENDING", "OVERDUE", "PARTIAL"].includes(i.status)).reduce((sum, i) => sum + (i.total || 0), 0)
    : (raw?.totalOutstanding || 0);

  const canPay = (inv: Invoice) => ["PENDING", "PARTIAL", "OVERDUE", "DRAFT"].includes(inv.status);

  return (
    <div data-id="PATIENT-BILLING-TAB" className="space-y-4">
      {/* Outstanding Balance Card */}
      {outstanding > 0 && (
        <Card padding="md" className="border-l-4 border-red-400">
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-stone-500">Outstanding Balance</p>
                <p className="text-2xl font-bold text-red-500">{formatCurrency(outstanding)}</p>
              </div>
              <Badge variant="danger">Action Required</Badge>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Invoices Table */}
      <Card padding="md">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Receipt className="w-4 h-4 text-teal-600" />
            <h3 className="text-sm font-semibold text-stone-900">Invoices ({invoices.length})</h3>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {invoices.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice #</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Paid</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((inv) => {
                  const paid = (inv.payments || []).reduce((sum, p) => sum + (p.amount || 0), 0);
                  const due = (inv.total || 0) - paid;
                  return (
                    <TableRow key={inv.id}>
                      <TableCell><span className="font-mono text-xs">{inv.invoiceNumber}</span></TableCell>
                      <TableCell>{formatDate(inv.createdAt)}</TableCell>
                      <TableCell><span className="font-semibold">{formatCurrency(inv.total)}</span></TableCell>
                      <TableCell className="text-emerald-600">{formatCurrency(paid)}</TableCell>
                      <TableCell className={due > 0 ? "text-red-600 font-semibold" : "text-emerald-600"}>
                        {formatCurrency(due)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusVariant[inv.status] || "default"} dot>{inv.status}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          {canPay(inv) && (
                            <Button size="sm" variant="ghost" onClick={() => setPayInvoice(inv)} title="Collect Payment">
                              <CreditCard className="w-3.5 h-3.5 text-teal-600" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <div className="py-8 text-center text-sm text-stone-500">No invoices found</div>
          )}
        </CardContent>
      </Card>

      {/* Payment Modal */}
      {payInvoice && (
        <PaymentModal
          isOpen={!!payInvoice}
          onClose={() => setPayInvoice(null)}
          invoice={payInvoice}
        />
      )}
    </div>
  );
}
