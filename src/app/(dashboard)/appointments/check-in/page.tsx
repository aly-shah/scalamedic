"use client";

/**
 * Check-In
 * ────────
 * Receptionist's "patients arriving today" board. Same family of
 * shape-mismatch bugs that the calendar view + dashboards had:
 *
 *  - Read appt.patientName / appt.doctorName / appt.patientPhone flat,
 *    but /api/appointments returns nested patient + doctor; the queue
 *    rows ended up rendering blanks for everyone.
 *  - Filtered with `a.date === today` (a clean YYYY-MM-DD string) but
 *    Prisma serialises @db.Date as a full ISO timestamp, so the client
 *    filter dropped every row even though the API server-side filter
 *    had returned the right ones.
 *  - Used native confirm() for No-Show.
 *
 * Plus the chrome was the old style (plain h1, custom search box,
 * inline badges). Updated to match the recently-modernised admin
 * pages: gradient hero, StatCard tiles, SearchInput, DatePicker so the
 * receptionist can also see tomorrow's arrivals.
 */

import { useMemo, useState } from "react";
import {
  LogIn,
  Clock,
  UserX,
  CheckCircle2,
  Users,
  Timer,
  Heart,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { StatCard } from "@/components/ui/stat-card";
import { SearchInput } from "@/components/ui/search-input";
import { DatePicker } from "@/components/ui/date-picker";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { AppointmentStatus } from "@/types";
import type { Appointment } from "@/types";
import {
  appointmentTypeLabels,
} from "@/lib/constants";
import { useModuleAccess, useModuleEmit } from "@/modules/core/hooks";
import { useAppointments, useCheckInAppointment, useNoShowAppointment } from "@/hooks/use-queries";
import { LoadingSpinner } from "@/components/ui/loading";
import { SystemEvents } from "@/modules/core/events";
import { CheckInPayPanel } from "@/components/appointments/check-in-pay-panel";
import { useQueryClient } from "@tanstack/react-query";
import { getClinicToday, shiftDay, CLINIC_TZ } from "@/lib/utils";

// ─── Defensive nested→flat extractors ───────────────────────────────
// /api/appointments returns nested patient + doctor; legacy callers
// shipped flat strings. Take whichever is present (same pattern as the
// dashboard panels and the calendar view).
function aptName(a: Appointment): string {
  const flat = (a as unknown as { patientName?: string }).patientName;
  if (flat && flat.trim()) return flat;
  const p = (a as unknown as { patient?: { firstName?: string; lastName?: string } }).patient;
  if (p?.firstName) return `${p.firstName} ${p.lastName ?? ""}`.trim();
  return "Patient";
}
function aptDoctor(a: Appointment): string {
  const flat = (a as unknown as { doctorName?: string }).doctorName;
  if (flat && flat.trim()) return flat;
  const d = (a as unknown as { doctor?: { name?: string } }).doctor;
  if (d?.name) return String(d.name);
  return "—";
}
function aptPhone(a: Appointment): string {
  const flat = (a as unknown as { patientPhone?: string }).patientPhone;
  if (flat && flat.trim()) return flat;
  const p = (a as unknown as { patient?: { phone?: string } }).patient;
  return p?.phone ?? "";
}
// Prisma serialises @db.Date as a full ISO timestamp; compare on YYYY-MM-DD only.
function aptDateKey(a: Appointment): string {
  return (a.date || "").slice(0, 10);
}

function minutesSince(checkinTime: string | undefined): string {
  if (!checkinTime) return "";
  const [h, m] = checkinTime.split(":").map(Number);
  const now = new Date();
  const diff = (now.getHours() - h) * 60 + (now.getMinutes() - m);
  if (diff <= 0) return "Just now";
  return `${diff} min`;
}
function minutesSinceNum(checkinTime: string | undefined): number {
  if (!checkinTime) return 0;
  const [h, m] = checkinTime.split(":").map(Number);
  const now = new Date();
  return Math.max(0, (now.getHours() - h) * 60 + (now.getMinutes() - m));
}

// ═══════════════════════════════════════════════════════════════════════

export default function CheckInPage() {
  const access = useModuleAccess("MOD-APPOINTMENT");
  const emit = useModuleEmit("MOD-APPOINTMENT");
  const checkInMutation = useCheckInAppointment();
  const noShowMutation = useNoShowAppointment();
  const { confirm } = useConfirm();
  const qc = useQueryClient();

  const [date, setDate] = useState(getClinicToday());
  const [search, setSearch] = useState("");
  const [localStatuses, setLocalStatuses] = useState<Record<string, AppointmentStatus>>({});
  // Appointment whose check-in payment panel is open. Click "Check In" → set this;
  // the panel does the actual transition via the check-in-payment endpoint.
  const [payTarget, setPayTarget] = useState<Appointment | null>(null);

  const { data: appointmentsResponse, isLoading } = useAppointments({ date });
  const allAppointments = (appointmentsResponse?.data || []) as Appointment[];

  const dayAppointments = useMemo(() => {
    return allAppointments
      .filter((a) => aptDateKey(a) === date)
      .filter(
        (a) =>
          a.status !== AppointmentStatus.CANCELLED &&
          a.status !== AppointmentStatus.NO_SHOW
      )
      .sort((a, b) => (a.startTime || "").localeCompare(b.startTime || ""));
  }, [allAppointments, date]);

  const filtered = useMemo(() => {
    if (!search) return dayAppointments;
    const q = search.toLowerCase();
    return dayAppointments.filter((a) => {
      return (
        aptName(a).toLowerCase().includes(q) ||
        aptPhone(a).toLowerCase().includes(q) ||
        aptDoctor(a).toLowerCase().includes(q)
      );
    });
  }, [dayAppointments, search]);

  const getStatus = (id: string, original: AppointmentStatus) =>
    localStatuses[id] || original;

  const stats = useMemo(() => {
    let scheduled = 0;
    let waiting = 0;
    let inProgress = 0;
    let completed = 0;
    for (const a of dayAppointments) {
      const s = getStatus(a.id, a.status);
      if (s === AppointmentStatus.SCHEDULED || s === AppointmentStatus.CONFIRMED) scheduled++;
      else if (s === AppointmentStatus.CHECKED_IN || s === AppointmentStatus.WAITING) waiting++;
      else if (s === AppointmentStatus.IN_PROGRESS) inProgress++;
      else if (s === AppointmentStatus.COMPLETED) completed++;
    }
    return { total: dayAppointments.length, scheduled, waiting, inProgress, completed };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayAppointments, localStatuses]);

  // Check-in is a two-step flow now: click → open the payment panel,
  // panel calls the new check-in-payment endpoint which both records
  // the invoice/payment AND transitions the appointment status. The
  // legacy useCheckInAppointment mutation is kept around for the
  // No-Show flow but isn't called here anymore.
  const handleCheckIn = (id: string) => {
    const appt = dayAppointments.find((a) => a.id === id);
    if (appt) setPayTarget(appt);
    void checkInMutation;
  };

  const handlePaymentDone = () => {
    if (payTarget) {
      setLocalStatuses((prev) => ({ ...prev, [payTarget.id]: AppointmentStatus.WAITING }));
      emit(SystemEvents.APPOINTMENT_CHECKED_IN, {
        patientName: aptName(payTarget),
        doctorName: aptDoctor(payTarget),
      }, { patientId: payTarget.patientId, appointmentId: payTarget.id });
    }
    setPayTarget(null);
    qc.invalidateQueries({ queryKey: ["appointments"] });
  };

  const handleNoShow = async (id: string) => {
    const appt = dayAppointments.find((a) => a.id === id);
    const ok = await confirm({
      title: "Mark as no-show?",
      message: appt
        ? `${aptName(appt)} (${appt.startTime}) will be marked NO_SHOW. The appointment row stays visible in the schedule but moves out of today's queue. You can't undo from this screen.`
        : "Mark this appointment as no-show?",
      confirmLabel: "Mark no-show",
      variant: "warning",
    });
    if (!ok) return;
    setLocalStatuses((prev) => ({ ...prev, [id]: AppointmentStatus.NO_SHOW }));
    try {
      await noShowMutation.mutateAsync({ id, reason: "Patient did not arrive" });
      if (appt) {
        emit(SystemEvents.APPOINTMENT_NO_SHOW, { patientName: aptName(appt) }, {
          patientId: appt.patientId,
          appointmentId: appt.id,
        });
      }
    } catch {
      setLocalStatuses((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }
  };

  const waitingPatients = filtered.filter((a) => {
    const s = getStatus(a.id, a.status);
    return s === AppointmentStatus.WAITING || s === AppointmentStatus.CHECKED_IN;
  });

  const typeBadgeVariant = (type: string): "primary" | "success" | "warning" | "default" => {
    switch (type) {
      case "CONSULTATION": return "primary";
      case "PROCEDURE": return "success";
      case "FOLLOW_UP": return "warning";
      default: return "default";
    }
  };

  const dateLabel = new Date(date + "T12:00:00+05:00").toLocaleDateString("en-PK", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: CLINIC_TZ,
  });
  const isToday = date === getClinicToday();

  if (isLoading) {
    return <div className="flex items-center justify-center py-20"><LoadingSpinner size="lg" /></div>;
  }
  if (!access.canView) {
    return (
      <div className="flex items-center justify-center py-20 text-stone-500 text-sm">
        You don&apos;t have access to this module.
      </div>
    );
  }

  return (
    <div data-id="APPT-CHECKIN" className="animate-fade-in space-y-5 sm:space-y-6">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl border border-stone-100 bg-gradient-to-br from-emerald-600 via-teal-600 to-cyan-600 px-5 py-5 sm:px-7 sm:py-6 text-white">
        <div className="absolute inset-0 opacity-25 [background:radial-gradient(circle_at_30%_30%,#fff_0,transparent_45%)]" />
        <div className="relative flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <LogIn className="w-4 h-4" />
              <span className="text-[11px] uppercase tracking-wider font-semibold opacity-90">Check-in</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-semibold leading-tight">
              {isToday ? "Today's arrivals." : "Pre-check arrivals for the day."}
            </h1>
            <p className="text-sm opacity-90 mt-1 max-w-xl">{dateLabel}</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setDate(shiftDay(date, -1))}
              aria-label="Previous day"
              className="p-2 rounded-xl bg-white/15 border border-white/30 text-white hover:bg-white/25 cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="min-w-[160px]">
              <DatePicker value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <button
              onClick={() => setDate(shiftDay(date, 1))}
              aria-label="Next day"
              className="p-2 rounded-xl bg-white/15 border border-white/30 text-white hover:bg-white/25 cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            {!isToday && (
              <Button
                size="sm"
                onClick={() => setDate(getClinicToday())}
                className="!bg-white !text-emerald-700 hover:!bg-stone-50"
                iconLeft={<CalendarDays className="w-3.5 h-3.5" />}
              >
                Today
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard label="Scheduled" value={stats.scheduled} icon={<CalendarDays className="w-5 h-5" />} color="info" />
        <StatCard label="Waiting" value={stats.waiting} icon={<Timer className="w-5 h-5" />} color="warning" />
        <StatCard label="In consultation" value={stats.inProgress} icon={<Heart className="w-5 h-5" />} color="primary" />
        <StatCard label="Completed" value={stats.completed} icon={<CheckCircle2 className="w-5 h-5" />} color="success" />
      </div>

      {/* Search */}
      <SearchInput
        placeholder="Search patient name, phone, or doctor..."
        value={search}
        onChange={setSearch}
        className="w-full sm:max-w-md"
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        {/* Queue */}
        <div className="lg:col-span-2 flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-stone-500 uppercase tracking-wider">
              {isToday ? "Today's Queue" : "Queue"}
            </h2>
            <span className="text-xs text-stone-400">({filtered.length})</span>
          </div>

          {filtered.length === 0 ? (
            <div className="rounded-2xl border-2 border-dashed border-stone-200 py-16 px-6 text-center">
              <div className="w-14 h-14 mx-auto rounded-full bg-emerald-50 flex items-center justify-center mb-3">
                <Heart className="w-7 h-7 text-emerald-400" />
              </div>
              <p className="text-sm text-stone-700 font-medium mb-1">
                {search ? "No patients match your search." : "Nothing scheduled for this day."}
              </p>
              <p className="text-xs text-stone-400">
                {search ? "Try a different name or phone." : "Bookings made on /appointments will land here."}
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {filtered.map((appt) => {
                const status = getStatus(appt.id, appt.status);
                const isCheckedIn =
                  status === AppointmentStatus.CHECKED_IN ||
                  status === AppointmentStatus.WAITING;
                const isCompleted = status === AppointmentStatus.COMPLETED;
                const isInProgress = status === AppointmentStatus.IN_PROGRESS;
                const isNoShow = status === AppointmentStatus.NO_SHOW;
                const canCheckIn =
                  status === AppointmentStatus.SCHEDULED ||
                  status === AppointmentStatus.CONFIRMED;

                return (
                  <Card
                    key={appt.id}
                    className={`transition-all duration-200 ${
                      isCheckedIn ? "border-emerald-200 bg-emerald-50/30" : ""
                    } ${isNoShow ? "opacity-50" : ""}`}
                  >
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 sm:p-5 gap-3 sm:gap-4">
                      <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
                        <Avatar name={aptName(appt)} size="xl" />
                        <div className="min-w-0">
                          <p className="text-base sm:text-lg font-semibold text-stone-900 truncate">
                            {aptName(appt)}
                          </p>
                          <div className="flex items-center gap-3 mt-1.5 text-sm text-stone-500">
                            <span className="flex items-center gap-1.5">
                              <Clock className="w-3.5 h-3.5 text-stone-400" />
                              {appt.startTime} - {appt.endTime}
                            </span>
                            <span className="text-stone-300">|</span>
                            <span>{aptDoctor(appt)}</span>
                          </div>
                          <div className="flex items-center gap-2 mt-2.5">
                            <Badge variant={typeBadgeVariant(appt.type)}>
                              {appointmentTypeLabels[appt.type] || appt.type}
                            </Badge>
                            {isCheckedIn && appt.checkinTime && (
                              <span className="flex items-center gap-1 text-xs text-emerald-600 font-medium">
                                <Timer className="w-3 h-3" />
                                Waiting {minutesSince(appt.checkinTime)}
                              </span>
                            )}
                            {aptPhone(appt) && (
                              <span className="text-[11px] text-stone-400 font-mono">{aptPhone(appt)}</span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-row sm:flex-col items-center sm:items-end gap-2 sm:gap-3 flex-shrink-0 w-full sm:w-auto">
                        {canCheckIn && (
                          <>
                            <Button
                              size="lg"
                              variant="primary"
                              iconLeft={<LogIn className="w-5 h-5" />}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCheckIn(appt.id);
                              }}
                              className="rounded-2xl px-8 py-3.5 text-base shadow-sm shadow-teal-200"
                            >
                              Check In
                            </Button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleNoShow(appt.id);
                              }}
                              className="text-xs text-stone-400 hover:text-red-500 transition-colors cursor-pointer font-medium flex items-center gap-1"
                            >
                              <UserX className="w-3 h-3" />
                              Mark as No Show
                            </button>
                          </>
                        )}
                        {isCheckedIn && (
                          <div className="flex items-center gap-2 bg-emerald-100 text-emerald-700 rounded-2xl px-5 py-3">
                            <CheckCircle2 className="w-5 h-5" />
                            <span className="font-semibold text-sm">Checked In</span>
                          </div>
                        )}
                        {isInProgress && (
                          <Badge variant="info" dot>In Consultation</Badge>
                        )}
                        {isCompleted && (
                          <Badge variant="success" dot>Completed</Badge>
                        )}
                        {isNoShow && (
                          <Badge variant="danger" dot>No Show</Badge>
                        )}
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>

        {/* Waiting Room */}
        <div className="flex flex-col gap-4">
          <Card className="sticky top-6">
            <CardHeader className="border-b-0 pb-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 bg-emerald-50 rounded-xl flex items-center justify-center">
                    <Users className="w-4 h-4 text-emerald-600" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-stone-900">Waiting Room</h3>
                    <p className="text-xs text-stone-400">Currently waiting</p>
                  </div>
                </div>
                <Badge variant="primary">{waitingPatients.length}</Badge>
              </div>
            </CardHeader>
            <CardContent>
              {waitingPatients.length === 0 ? (
                <div className="py-8 text-center">
                  <div className="w-12 h-12 bg-stone-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
                    <Users className="w-5 h-5 text-stone-400" />
                  </div>
                  <p className="text-sm text-stone-400 font-medium">No patients waiting</p>
                  <p className="text-xs text-stone-300 mt-0.5">
                    Patients will appear here after check-in
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-1">
                  {waitingPatients.map((appt) => {
                    const waitMin = minutesSinceNum(appt.checkinTime);
                    const isLongWait = waitMin > 20;
                    return (
                      <div
                        key={appt.id}
                        className="flex items-center justify-between py-3 px-3 rounded-xl hover:bg-stone-50 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <Avatar name={aptName(appt)} size="sm" />
                          <div>
                            <p className="text-sm font-medium text-stone-900">{aptName(appt)}</p>
                            <p className="text-xs text-stone-400">{aptDoctor(appt)}</p>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-0.5">
                          <span
                            className={`text-xs font-semibold ${
                              isLongWait ? "text-red-500" : "text-amber-600"
                            }`}
                          >
                            {appt.checkinTime
                              ? `${minutesSince(appt.checkinTime)} wait`
                              : "Just arrived"}
                          </span>
                          <span className="text-[10px] text-stone-400">
                            Appt: {appt.startTime}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <CheckInPayPanel
        appointment={payTarget as unknown as Parameters<typeof CheckInPayPanel>[0]["appointment"]}
        onClose={() => setPayTarget(null)}
        onCompleted={handlePaymentDone}
      />
    </div>
  );
}
