"use client";

/**
 * Patient Overview tab
 * ────────────────────
 * Smart-glance dashboard for the patient profile. Surfaces:
 *
 *   - Top KPIs: last visit · next appointment · outstanding balance · active Rx
 *   - Quick vitals capture (inline form, POSTs to /api/patients/[id]/vitals)
 *   - Recent invoices with print + open shortcuts
 *   - Active prescriptions
 *   - Recent visits
 *
 * Replaces the previous slim "summary cards" version. The 14 deep-dive
 * tabs around it are unchanged — this tab just makes the most-used
 * actions one click instead of three.
 */
import { useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import {
  Activity, Calendar, Pill, Heart, Receipt, Plus, Loader2, Printer,
  Stethoscope, AlertTriangle, ExternalLink,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/ui/loading";
import {
  usePatientAppointments,
  usePatientPrescriptions,
  usePatientVitals,
  usePatientBilling,
  queryKeys,
} from "@/hooks/use-queries";
import { formatDate } from "@/lib/utils";
import { useFormatCurrency } from "@/hooks/use-format-currency";
import { useAuth } from "@/lib/auth-context";
import type { Patient, Appointment, Prescription, Vitals, Invoice } from "@/types";

const fmtDate = (d?: string) => (d ? formatDate(d) : "—");

export function OverviewTab({ patient }: { patient: Patient }) {
  const formatCurrency = useFormatCurrency();
  const { data: vitalsRes,    isLoading: tLoad } = usePatientVitals(patient.id);
  const { data: apptRes,      isLoading: aLoad } = usePatientAppointments(patient.id);
  const { data: rxRes,        isLoading: rLoad } = usePatientPrescriptions(patient.id);
  const { data: billingRes,   isLoading: bLoad } = usePatientBilling(patient.id);

  if (tLoad || aLoad || rLoad || bLoad) {
    return <div className="flex justify-center py-10"><LoadingSpinner /></div>;
  }

  const vitalsRecords = (vitalsRes?.data || []) as Vitals[];
  const latestVitals = vitalsRecords[0] || null;

  const appointments = ((apptRes?.data || []) as Appointment[])
    .slice()
    .sort((a, b) => `${b.date} ${b.startTime}`.localeCompare(`${a.date} ${a.startTime}`));
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = appointments
    .filter((a) => (a.date >= today) && a.status !== "COMPLETED" && a.status !== "CANCELLED" && a.status !== "NO_SHOW")
    .sort((a, b) => `${a.date} ${a.startTime}`.localeCompare(`${b.date} ${b.startTime}`))[0];
  const lastVisit = appointments.find((a) => a.status === "COMPLETED");

  const allRx = (rxRes?.data || []) as Prescription[];
  const activeRx = allRx.slice(0, 3); // newest few

  // Billing endpoint returns { invoices, totalOutstanding } OR an array
  // depending on caller. Normalize.
  const billingRaw = billingRes?.data as { invoices?: Invoice[]; totalOutstanding?: number } | Invoice[] | undefined;
  const invoices: Invoice[] = Array.isArray(billingRaw) ? billingRaw : billingRaw?.invoices ?? [];
  const outstandingBalance = Array.isArray(billingRaw)
    ? invoices.reduce((s, i) => s + Number(i.balanceDue ?? 0), 0)
    : (billingRaw?.totalOutstanding ?? 0);
  const recentInvoices = invoices.slice(0, 5);

  return (
    <div data-id="PATIENT-OVERVIEW-TAB" className="space-y-5">

      {/* ── KPI strip ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiTile
          icon={<Calendar className="w-4 h-4" />}
          label="Last visit"
          value={lastVisit ? formatDate(lastVisit.date) : "—"}
          sub={lastVisit?.doctorName}
          tone="bg-stone-50 text-stone-700"
        />
        <KpiTile
          icon={<Calendar className="w-4 h-4" />}
          label="Next appointment"
          value={upcoming ? formatDate(upcoming.date) : "None"}
          sub={upcoming ? `${upcoming.startTime} · ${upcoming.doctorName}` : "Book one"}
          tone="bg-teal-50 text-teal-700"
        />
        <KpiTile
          icon={<Receipt className="w-4 h-4" />}
          label="Outstanding"
          value={formatCurrency(outstandingBalance)}
          sub={outstandingBalance > 0 ? "Balance due" : "All settled"}
          tone={outstandingBalance > 0 ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}
        />
        <KpiTile
          icon={<Pill className="w-4 h-4" />}
          label="Active Rx"
          value={String(allRx.length)}
          sub={allRx.length > 0 ? "On medication" : "None"}
          tone="bg-violet-50 text-violet-700"
        />
      </div>

      {/* ── Vitals row ────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-1">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <Heart className="w-4 h-4 text-red-500" />
              <h3 className="text-sm font-semibold text-stone-900">Last vitals</h3>
              {latestVitals?.createdAt && (
                <span className="ml-auto text-[11px] text-stone-400">{formatDate(latestVitals.createdAt)}</span>
              )}
            </div>
            {latestVitals ? (
              <dl className="space-y-1.5 text-sm">
                <VitalRow label="Blood pressure" value={latestVitals.systolicBP && latestVitals.diastolicBP ? `${latestVitals.systolicBP}/${latestVitals.diastolicBP} mmHg` : "—"} />
                <VitalRow label="Heart rate" value={latestVitals.heartRate ? `${latestVitals.heartRate} bpm` : "—"} />
                <VitalRow label="Temperature" value={latestVitals.temperature ? `${latestVitals.temperature} °C` : "—"} />
                <VitalRow label="Weight" value={latestVitals.weight ? `${latestVitals.weight} kg` : "—"} />
                <VitalRow label="BMI" value={latestVitals.bmi ? String(latestVitals.bmi) : "—"} />
                <VitalRow label="O₂ Sat" value={latestVitals.oxygenSaturation ? `${latestVitals.oxygenSaturation}%` : "—"} />
              </dl>
            ) : (
              <p className="text-sm text-stone-400 italic">No vitals recorded yet.</p>
            )}
          </CardContent>
        </Card>

        <QuickVitalsCard patientId={patient.id} className="lg:col-span-2" />
      </div>

      {/* ── Recent invoices ───────────────────────────────────────── */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Receipt className="w-4 h-4 text-amber-600" />
              <h3 className="text-sm font-semibold text-stone-900">Recent invoices</h3>
            </div>
            <Link href="/billing" className="text-xs text-teal-600 hover:text-teal-700 font-medium">
              View all in Billing →
            </Link>
          </div>
          {recentInvoices.length === 0 ? (
            <p className="text-sm text-stone-400 italic py-4 text-center">No invoices yet.</p>
          ) : (
            <div className="space-y-1.5">
              {recentInvoices.map((inv) => {
                const due = Number(inv.balanceDue ?? 0);
                const isPaid = inv.status === "PAID" || due === 0;
                const isOverdue = inv.status === "OVERDUE";
                return (
                  <div key={inv.id} className="flex items-center gap-3 px-2.5 py-2 rounded-lg hover:bg-stone-50 transition-colors">
                    <Link href={`/billing/invoices/${inv.id}`} className="flex-1 min-w-0 flex items-center gap-3">
                      <span className="font-mono text-xs text-stone-700 shrink-0">{inv.invoiceNumber}</span>
                      <span className="text-xs text-stone-400 shrink-0">{formatDate(inv.createdAt)}</span>
                      <span className="text-xs text-stone-500 truncate">
                        {inv.items && inv.items.length > 0 ? inv.items[0].description : "—"}
                        {inv.items && inv.items.length > 1 && <span className="text-stone-300"> · +{inv.items.length - 1}</span>}
                      </span>
                    </Link>
                    <span className="font-mono text-sm font-semibold text-stone-900 shrink-0">
                      {formatCurrency(Number(inv.total ?? 0))}
                    </span>
                    <Badge
                      variant={isPaid ? "success" : isOverdue ? "danger" : "warning"}
                      className="text-[10px] shrink-0"
                    >
                      {inv.status}
                    </Badge>
                    <button
                      type="button"
                      onClick={() => window.open(`/billing/invoices/${inv.id}?print=1`, "_blank", "width=420,height=720,noopener=yes")}
                      className="p-1 rounded text-stone-400 hover:text-stone-700 hover:bg-stone-100 cursor-pointer"
                      title="Print receipt"
                    >
                      <Printer className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Two-column: Recent visits + Active Rx ─────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <Stethoscope className="w-4 h-4 text-teal-600" />
              <h3 className="text-sm font-semibold text-stone-900">Recent visits</h3>
            </div>
            {appointments.length === 0 ? (
              <p className="text-sm text-stone-400 italic py-3 text-center">No appointments yet.</p>
            ) : (
              <ul className="space-y-1.5">
                {appointments.slice(0, 5).map((a) => {
                  const past = a.date < today;
                  const tone =
                    a.status === "COMPLETED" ? "success" :
                    a.status === "CANCELLED" || a.status === "NO_SHOW" ? "danger" :
                    a.status === "IN_PROGRESS" ? "info" :
                    past ? "default" : "warning";
                  return (
                    <li key={a.id} className="flex items-center gap-3 px-2 py-1.5 rounded-lg hover:bg-stone-50 transition-colors">
                      <span className="text-xs text-stone-500 shrink-0 w-20">{formatDate(a.date)}</span>
                      <span className="text-xs text-stone-400 shrink-0 w-12">{a.startTime}</span>
                      <span className="text-sm text-stone-800 flex-1 min-w-0 truncate">
                        {a.doctorName ?? "—"}
                        {a.type && <span className="text-stone-400"> · {a.type.replace("_", " ").toLowerCase()}</span>}
                      </span>
                      <Badge variant={tone} className="text-[10px] shrink-0">{a.status}</Badge>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Pill className="w-4 h-4 text-emerald-500" />
                <h3 className="text-sm font-semibold text-stone-900">Active prescriptions</h3>
              </div>
              {allRx.length > 3 && (
                <span className="text-[11px] text-stone-400">{allRx.length} total</span>
              )}
            </div>
            {activeRx.length === 0 ? (
              <p className="text-sm text-stone-400 italic py-3 text-center">No active prescriptions.</p>
            ) : (
              <ul className="space-y-2">
                {activeRx.flatMap((rx) =>
                  (rx.items || []).slice(0, 3).map((item) => (
                    <li key={`${rx.id}-${item.id}`} className="flex items-start gap-2 text-sm">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-1.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-stone-900 truncate">{item.medicineName}</p>
                        <p className="text-xs text-stone-500">
                          {[item.dosage, item.frequency, item.duration].filter(Boolean).join(" · ")}
                        </p>
                      </div>
                      <span className="text-[10px] text-stone-400 shrink-0">{formatDate(rx.createdAt)}</span>
                    </li>
                  )),
                )}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────

function KpiTile({
  icon, label, value, sub, tone,
}: {
  icon: React.ReactNode; label: string; value: string; sub?: string; tone: string;
}) {
  return (
    <div className="bg-white border border-stone-100 rounded-2xl p-3.5">
      <div className={`inline-flex w-7 h-7 rounded-lg items-center justify-center ${tone}`}>
        {icon}
      </div>
      <p className="mt-2 text-[10px] uppercase tracking-wider text-stone-400 font-semibold">{label}</p>
      <p className="text-base font-bold text-stone-900 truncate">{value}</p>
      {sub && <p className="text-[11px] text-stone-500 truncate">{sub}</p>}
    </div>
  );
}

function VitalRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-stone-500">{label}</span>
      <span className="font-medium text-stone-900">{value}</span>
    </div>
  );
}

/** Inline vitals capture form. Posts to the existing
 *  /api/patients/[id]/vitals endpoint and refetches the vitals
 *  query so the "Last vitals" tile next to it updates instantly. */
function QuickVitalsCard({ patientId, className }: { patientId: string; className?: string }) {
  const { user } = useAuth();
  const qc = useQueryClient();

  const [systolicBP, setSys] = useState("");
  const [diastolicBP, setDia] = useState("");
  const [heartRate, setHr] = useState("");
  const [temperature, setTemp] = useState("");
  const [weight, setWeight] = useState("");
  const [height, setHeight] = useState("");
  const [oxygenSaturation, setO2] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const reset = () => {
    setSys(""); setDia(""); setHr(""); setTemp("");
    setWeight(""); setHeight(""); setO2(""); setNotes("");
  };

  const submit = async () => {
    setError(null);
    setSuccess(false);
    if (!user?.id) {
      setError("Session not ready, try again.");
      return;
    }
    // At least one field must be filled — empty submit is a no-op.
    const anyValue = [systolicBP, diastolicBP, heartRate, temperature, weight, height, oxygenSaturation, notes].some((v) => v.trim());
    if (!anyValue) {
      setError("Fill at least one vital before saving.");
      return;
    }
    setSubmitting(true);
    try {
      const r = await fetch(`/api/patients/${patientId}/vitals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          systolicBP:  systolicBP  ? Number(systolicBP)  : undefined,
          diastolicBP: diastolicBP ? Number(diastolicBP) : undefined,
          heartRate:   heartRate   ? Number(heartRate)   : undefined,
          temperature: temperature ? Number(temperature) : undefined,
          temperatureUnit: "C",
          weight: weight ? Number(weight) : undefined,
          height: height ? Number(height) : undefined,
          oxygenSaturation: oxygenSaturation ? Number(oxygenSaturation) : undefined,
          notes: notes.trim() || undefined,
          recordedById: user.id,
        }),
      });
      const d = await r.json();
      if (!d.success) {
        setError(d.error || "Save failed");
        return;
      }
      setSuccess(true);
      reset();
      qc.invalidateQueries({ queryKey: queryKeys.patients.vitals(patientId) });
      setTimeout(() => setSuccess(false), 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card className={className}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-teal-600" />
            <h3 className="text-sm font-semibold text-stone-900">Record vitals</h3>
          </div>
          <Link href={`/vitals?patientId=${patientId}`} className="text-xs text-stone-400 hover:text-stone-600 inline-flex items-center gap-1">
            Full history <ExternalLink className="w-3 h-3" />
          </Link>
        </div>

        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5">
          <SmallField label="Systolic" suffix="mmHg" value={systolicBP} onChange={setSys} />
          <SmallField label="Diastolic" suffix="mmHg" value={diastolicBP} onChange={setDia} />
          <SmallField label="HR" suffix="bpm" value={heartRate} onChange={setHr} />
          <SmallField label="Temp" suffix="°C" value={temperature} onChange={setTemp} step="0.1" />
          <SmallField label="Weight" suffix="kg" value={weight} onChange={setWeight} step="0.1" />
          <SmallField label="Height" suffix="cm" value={height} onChange={setHeight} step="0.5" />
          <SmallField label="O₂ Sat" suffix="%" value={oxygenSaturation} onChange={setO2} />
        </div>

        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          placeholder="Notes (optional) — e.g. 'BP slightly elevated, repeat in 30 min'"
          className="mt-2.5 w-full rounded-lg border border-stone-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none"
        />

        {error && (
          <p className="mt-2 text-xs text-red-600 inline-flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" /> {error}
          </p>
        )}
        {success && (
          <p className="mt-2 text-xs text-emerald-700 font-medium">✓ Vitals saved.</p>
        )}

        <div className="mt-3 flex justify-end">
          <Button
            size="sm"
            onClick={submit}
            disabled={submitting}
            iconLeft={submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
          >
            {submitting ? "Saving…" : "Save vitals"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function SmallField({
  label, suffix, value, onChange, step,
}: {
  label: string; suffix: string; value: string; onChange: (v: string) => void; step?: string;
}) {
  return (
    <label className="text-xs text-stone-500">
      <span className="block mb-1 uppercase tracking-wider text-[10px] font-semibold">{label}</span>
      <div className="relative">
        <input
          type="number"
          step={step ?? "1"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full pr-10 px-2.5 py-1.5 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        />
        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-stone-400">{suffix}</span>
      </div>
    </label>
  );
}
