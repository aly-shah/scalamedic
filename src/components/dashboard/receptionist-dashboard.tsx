"use client";

/**
 * Receptionist Dashboard — restructured 2026-05-06.
 *
 * Adopts the visual language of /call-center (gradient hero, KPI
 * strip, big content cards) but with receptionist-shaped widgets:
 *
 *   - Hero: "Front Desk · today's queue" with quick actions for
 *     Register Patient + Book Appointment
 *   - KPI strip: today's appointments / checked in / waiting / completed
 *   - Quick patient lookup (search by phone or name)
 *   - Check-In Queue with inline payment panel + per-invoice chips
 *   - WhatsApp connection card
 *   - Live waiting queue + live activity tickers (when populated)
 *
 * The LiveCallPanel was removed from this surface — the call-center
 * page is where calls live; reception duty is the floor, not the
 * phone. The page can be wired back if a receptionist also handles
 * calls, but the empty state was visual noise.
 */

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Calendar, UserCheck, Clock, CheckCircle, UserPlus, DoorOpen, Printer,
  Search as SearchIcon, PhoneCall, CalendarPlus, ArrowRight, Users,
} from "lucide-react";
import { StatCard } from "@/components/ui/stat-card";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SearchInput } from "@/components/ui/search-input";
import { useDashboardStats, useAppointments, usePatients } from "@/hooks/use-queries";
import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useModuleStore } from "@/modules/core/store";
import { useAuth } from "@/lib/auth-context";
import { CheckInPayPanel } from "@/components/appointments/check-in-pay-panel";
import { WhatsAppConnectionCard } from "@/components/whatsapp/whatsapp-connection-card";
import { getClinicToday, CLINIC_TZ } from "@/lib/utils";

type PatientRow = { id: string; firstName: string; lastName: string; phone: string };

function getAptName(apt: Record<string, unknown>): string {
  if (apt.patientName) return String(apt.patientName);
  const p = apt.patient as Record<string, unknown> | undefined;
  if (p?.firstName) return `${p.firstName} ${p.lastName || ""}`.trim();
  return "Patient";
}
function getAptDoc(apt: Record<string, unknown>): string {
  if (apt.doctorName) return String(apt.doctorName);
  const d = apt.doctor as Record<string, unknown> | undefined;
  if (d?.name) return String(d.name);
  return "Doctor";
}

export function ReceptionistDashboard() {
  const router = useRouter();
  const { activities, waitingQueue } = useModuleStore();
  const { user } = useAuth();
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const todayLabel = new Date().toLocaleDateString("en-PK", {
    weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: CLINIC_TZ,
  });

  // ─── Data ────────────────────────────────────────────────────────
  const { data: statsData, isLoading: statsLoading, isError: statsError } = useDashboardStats("receptionist");
  const stats = (statsData?.data as Record<string, unknown>) || {};
  const totalAppointments = (stats.appointments as number) || 0;
  const checkedIn = (stats.checkedIn as number) || 0;
  const waiting = (stats.waiting as number) || 0;
  const completed = (stats.completed as number) || 0;

  const today = getClinicToday();
  const { data: aptsData, isLoading: aptsLoading, isError: aptsError } = useAppointments({ date: today });
  const todayApts = (Array.isArray(aptsData?.data) ? aptsData.data : []) as Array<Record<string, unknown>>;
  const checkInQueue = todayApts.filter(
    (a) => a.status === "SCHEDULED" || a.status === "CONFIRMED" || a.status === "CHECKED_IN" || a.status === "WAITING",
  );

  const { data: patientsResponse } = usePatients();
  const allPatients = (patientsResponse?.data || []) as PatientRow[];

  // ─── Quick patient lookup ────────────────────────────────────────
  const [search, setSearch] = useState("");
  const q = search.trim().toLowerCase();
  const matches = useMemo(() => {
    if (!q) return [];
    return allPatients
      .filter((p) =>
        (p.phone || "").includes(q) ||
        (p.firstName || "").toLowerCase().includes(q) ||
        (p.lastName || "").toLowerCase().includes(q),
      )
      .slice(0, 25);
  }, [q, allPatients]);

  // ─── Inline check-in payment ──────────────────────────────────────
  const qc = useQueryClient();
  const [payTarget, setPayTarget] = useState<Record<string, unknown> | null>(null);

  // Prefetch invoice route bundles so per-invoice clicks feel instant.
  // Cache priming is intentionally NOT done — partial slices in the
  // appointments payload would crash the receipt render.
  useEffect(() => {
    todayApts.forEach((apt) => {
      const invoices = (apt.invoices as Array<Record<string, unknown>> | undefined) || [];
      invoices.forEach((inv) => {
        if (inv?.id) router.prefetch(`/billing/invoices/${inv.id}`);
      });
    });
  }, [todayApts, router]);

  return (
    <div className="space-y-5 sm:space-y-6 animate-fade-in" data-id="DASH-RECEPTION">
      {/* ===== HERO ===== */}
      <div className="relative overflow-hidden rounded-2xl border border-stone-100 bg-gradient-to-br from-teal-600 via-emerald-600 to-cyan-600 px-5 py-5 sm:px-7 sm:py-6 text-white">
        <div className="absolute inset-0 opacity-25 [background:radial-gradient(circle_at_30%_30%,#fff_0,transparent_45%)]" />
        <div className="relative flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <DoorOpen className="w-4 h-4" />
              <span className="text-[11px] uppercase tracking-wider font-semibold opacity-90">Front Desk</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-semibold leading-tight">
              {greeting}, {user?.name?.split(" ")[0] || "there"}.
            </h1>
            <p className="text-sm opacity-90 mt-1 max-w-xl">
              {todayLabel} — {checkInQueue.length > 0
                ? `${checkInQueue.length} ${checkInQueue.length === 1 ? "patient" : "patients"} on the floor today.`
                : "Quiet for now. Use the search to look someone up or book a fresh slot."}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Link href="/patients">
              <Button
                variant="outline"
                size="sm"
                iconLeft={<UserPlus className="w-3.5 h-3.5" />}
                className="!bg-white/15 !border-white/30 !text-white hover:!bg-white/25"
              >
                Register patient
              </Button>
            </Link>
            <Link href="/appointments">
              <Button
                size="sm"
                iconLeft={<CalendarPlus className="w-3.5 h-3.5" />}
                className="!bg-white !text-teal-700 hover:!bg-stone-50"
              >
                Book appointment
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Error banner */}
      {(statsError || aptsError) && (
        <div className="bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl px-4 py-3">
          Unable to load some dashboard data. Please try refreshing.
        </div>
      )}

      {/* ===== KPI CARDS ===== */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard label="Appointments" value={statsLoading ? 0 : totalAppointments} icon={<Calendar className="w-5 h-5" />} color="primary" />
        <StatCard label="Checked in"   value={statsLoading ? 0 : checkedIn}          icon={<UserCheck className="w-5 h-5" />} color="success" />
        <StatCard label="Waiting"      value={statsLoading ? 0 : waiting}            icon={<Clock className="w-5 h-5" />}     color="warning" />
        <StatCard label="Completed"    value={statsLoading ? 0 : completed}          icon={<CheckCircle className="w-5 h-5" />} color="info" />
      </div>

      {/* ===== QUICK PATIENT LOOKUP ===== */}
      <Card padding="lg">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-base font-semibold text-stone-900">Quick patient lookup</h2>
            <p className="text-xs text-stone-500 mt-0.5">Type a phone number or name. Results appear as you type.</p>
          </div>
          <span className="text-xs text-stone-400">{allPatients.length.toLocaleString()} patients</span>
        </div>
        <SearchInput placeholder="Search by phone or name…" value={search} onChange={setSearch} />
        {q && (
          <div className="mt-3">
            {matches.length === 0 ? (
              <div className="text-center py-6 border border-dashed border-stone-200 rounded-2xl">
                <Users className="w-8 h-8 text-stone-300 mx-auto mb-2" />
                <p className="text-sm font-medium text-stone-700">No patients found for &ldquo;{search}&rdquo;</p>
                <p className="text-xs text-stone-500 mt-1">Walk-in? Register them first, then book.</p>
                <Link href="/patients">
                  <Button size="sm" className="mt-3" iconLeft={<UserPlus className="w-3.5 h-3.5" />}>
                    Register patient
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="space-y-2">
                {matches.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center gap-3 p-2.5 rounded-xl border border-stone-100 hover:border-stone-200 hover:bg-stone-50 transition-colors"
                  >
                    <Avatar name={`${p.firstName} ${p.lastName}`} size="sm" />
                    <button
                      onClick={() => router.push(`/patients/${p.id}`)}
                      className="flex-1 min-w-0 text-left cursor-pointer"
                    >
                      <p className="text-sm font-medium text-stone-900 truncate">
                        {p.firstName} {p.lastName}
                      </p>
                      <p className="text-xs text-stone-500 truncate">{p.phone || "—"}</p>
                    </button>
                    {p.phone && (
                      <a
                        href={`tel:${p.phone.replace(/\s+/g, "")}`}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-emerald-50 text-emerald-700 hover:bg-emerald-100 cursor-pointer"
                        title="Call this patient"
                      >
                        <PhoneCall className="w-3.5 h-3.5" /> Call
                      </a>
                    )}
                    <button
                      onClick={() => router.push(`/calendar?patientId=${p.id}`)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-stone-100 text-stone-700 hover:bg-stone-200 cursor-pointer"
                      title="Book an appointment"
                    >
                      <CalendarPlus className="w-3.5 h-3.5" /> Book
                    </button>
                    <button
                      onClick={() => router.push(`/patients/${p.id}`)}
                      className="text-stone-400 hover:text-stone-600 cursor-pointer p-1"
                      title="Open patient profile"
                    >
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        {!q && (
          <p className="mt-3 text-xs text-stone-400 inline-flex items-center gap-1.5">
            <SearchIcon className="w-3.5 h-3.5" /> Tip: search by partial phone (e.g. last 4 digits) or first name.
          </p>
        )}
      </Card>

      {/* ===== CHECK-IN QUEUE ===== */}
      <Card padding="lg">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-base font-semibold text-stone-900">Check-In Queue</h2>
            <p className="text-xs text-stone-500 mt-0.5">Today&apos;s scheduled, checked-in, and waiting patients.</p>
          </div>
          <Link href="/appointments/check-in" className="text-sm text-teal-600 font-medium hover:text-teal-700 transition-colors">
            View all →
          </Link>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {aptsLoading ? (
            <div className="text-sm text-stone-400 py-8 text-center col-span-2">Loading queue…</div>
          ) : checkInQueue.length === 0 ? (
            <div className="text-sm text-stone-400 py-8 text-center col-span-2">No patients in the check-in queue.</div>
          ) : (
            checkInQueue.slice(0, 8).map((apt) => {
              const needsCheckIn = apt.status === "SCHEDULED" || apt.status === "CONFIRMED";
              const isCheckedIn = apt.status === "CHECKED_IN";
              const isWaiting = apt.status === "WAITING";

              return (
                <div
                  key={apt.id as string}
                  className="bg-white rounded-2xl border border-stone-100 shadow-sm p-4 sm:p-5 flex items-center gap-4 hover:shadow-md transition-shadow"
                >
                  <Avatar name={getAptName(apt)} size="sm" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-stone-900 truncate">{getAptName(apt)}</p>
                    <p className="text-xs text-stone-500">{(apt.startTime as string) || "—"} · {getAptDoc(apt)}</p>
                  </div>
                  {needsCheckIn && (
                    <Button
                      size="sm"
                      data-id="APPT-CHECKIN-CONFIRM"
                      onClick={() => setPayTarget(apt)}
                      className="bg-teal-600 hover:bg-teal-700 text-white rounded-xl px-5 font-medium"
                    >
                      CHECK IN
                    </Button>
                  )}
                  {!needsCheckIn && (() => {
                    const invoices = (apt.invoices as Array<Record<string, unknown>> | undefined) || [];
                    return (
                      <div className="flex flex-wrap items-center justify-end gap-1.5">
                        {isCheckedIn && <Badge variant="success">Checked In</Badge>}
                        {isWaiting && <Badge variant="warning" dot>Waiting</Badge>}
                        {invoices.map((inv) => {
                          const id = inv.id as string;
                          const number = (inv.invoiceNumber as string) || "INV";
                          const status = (inv.status as string) || "";
                          const due = Number(inv.balanceDue ?? 0);
                          const isPaid = status === "PAID" || due === 0;
                          return (
                            <span key={id} className="inline-flex items-center gap-0.5">
                              <Link
                                href={`/billing/invoices/${id}`}
                                title={`${number} · ${status}`}
                                className={`text-[10px] font-mono px-2 py-1 rounded-l-full border-y border-l transition-colors ${
                                  isPaid
                                    ? "bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100"
                                    : "bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100"
                                }`}
                              >
                                {number}
                              </Link>
                              <button
                                type="button"
                                title="Print receipt"
                                onClick={() => window.open(`/billing/invoices/${id}?print=1`, "_blank", "width=420,height=720,noopener=yes")}
                                className={`p-1 rounded-r-full border-y border-r transition-colors cursor-pointer ${
                                  isPaid
                                    ? "bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100"
                                    : "bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100"
                                }`}
                              >
                                <Printer className="w-3 h-3" />
                              </button>
                            </span>
                          );
                        })}
                        <Button size="sm" variant="outline" onClick={() => setPayTarget(apt)} className="rounded-xl">
                          Add bill
                        </Button>
                      </div>
                    );
                  })()}
                </div>
              );
            })
          )}
        </div>
      </Card>

      {/* ===== WHATSAPP CONNECTION ===== */}
      <WhatsAppConnectionCard />

      {/* ===== LIVE WAITING / ACTIVITY ===== */}
      {(waitingQueue.length > 0 || activities.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {waitingQueue.length > 0 && (
            <Card padding="lg">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-stone-900">Live waiting queue</h3>
                <span className="text-xs text-stone-400">{waitingQueue.length} live</span>
              </div>
              <div className="space-y-2">
                {waitingQueue.slice(0, 6).map((entry) => (
                  <div key={entry.appointmentId} className="bg-stone-50 rounded-xl p-2.5 flex items-center gap-3">
                    <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-stone-900 truncate">{entry.patientName}</p>
                      <p className="text-xs text-stone-500">{entry.doctorName} · {entry.stage.toLowerCase()}</p>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
          {activities.length > 0 && (
            <Card padding="lg">
              <h3 className="text-sm font-semibold text-stone-900 mb-3">Live activity</h3>
              <div className="space-y-1.5">
                {activities.slice(0, 8).map((act) => (
                  <div key={act.id} className="flex items-start gap-2 text-sm text-stone-600 py-0.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-teal-400 mt-1.5 shrink-0" />
                    <span>{act.message}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}

      <CheckInPayPanel
        appointment={payTarget as unknown as Parameters<typeof CheckInPayPanel>[0]["appointment"]}
        onClose={() => setPayTarget(null)}
        onCompleted={() => {
          setPayTarget(null);
          qc.invalidateQueries({ queryKey: ["appointments"] });
        }}
      />
    </div>
  );
}
