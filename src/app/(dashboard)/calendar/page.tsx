"use client";

import { useState, useMemo, useEffect, Suspense } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ChevronLeft, ChevronRight, Calendar as CalendarIcon, Users, DoorOpen,
  Plus, Clock, User, Stethoscope, AlertTriangle, Search, Ban, Zap, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { StatCard } from "@/components/ui/stat-card";
import { LoadingSpinner } from "@/components/ui/loading";
import { SlidePanel } from "@/components/ui/slide-panel";
import { SearchInput } from "@/components/ui/search-input";
import { DatePicker } from "@/components/ui/date-picker";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useCalendar, useStaff, useBranches, usePatients, usePatient, useCreateAppointment, useUpdateAppointment, usePatientAppointments, useTreatments, useAvailableSlots, useBlockSlot, useUnblockSlot } from "@/hooks/use-queries";
import { useModuleAccess, useModuleEmit } from "@/modules/core/hooks";
import { SystemEvents } from "@/modules/core/events";
import { useAuth } from "@/lib/auth-context";
import { AppointmentDetail } from "@/components/appointments/appointment-detail";
import { AddPatientModal } from "@/components/patients/add-patient-modal";
import { cn, getClinicToday, toClinicDay, CLINIC_TZ } from "@/lib/utils";
import type { Patient, Appointment } from "@/types";

type ViewMode = "day" | "week" | "doctor" | "room";

interface SlotInfo {
  time: string;
  endTime: string;
  status: string;
  appointment?: Record<string, unknown>;
  blocked?: Record<string, unknown>;
}

interface DoctorCalendar {
  doctor: { id: string; name: string; speciality?: string };
  slots: SlotInfo[];
  isOnLeave: boolean;
  leaveReason?: string;
}

interface RoomCalendar {
  room: { id: string; name: string; type: string; status: string };
  slots: SlotInfo[];
}

const STATUS_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  available: { bg: "bg-white hover:bg-teal-50", border: "border-stone-100 hover:border-teal-300", text: "text-stone-300" },
  booked: { bg: "bg-blue-50", border: "border-blue-200", text: "text-blue-700" },
  checked_in: { bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-700" },
  in_progress: { bg: "bg-teal-50", border: "border-teal-200", text: "text-teal-700" },
  completed: { bg: "bg-stone-50", border: "border-stone-200", text: "text-stone-400" },
  blocked: { bg: "bg-stone-100", border: "border-stone-200", text: "text-stone-400" },
  unavailable: { bg: "bg-stone-50", border: "border-transparent", text: "text-stone-300" },
  no_show: { bg: "bg-red-50", border: "border-red-200", text: "text-red-400" },
  cancelled: { bg: "bg-red-50/50", border: "border-red-100", text: "text-red-300" },
};

// Left-border accent keyed by AppointmentType — overrides STATUS_COLORS.border
// when an appointment is present so type is visible at a glance in the day grid.
const TYPE_ACCENT: Record<string, { border: string; dot: string; label: string }> = {
  CONSULTATION: { border: "border-l-indigo-500",  dot: "bg-indigo-500",  label: "Consult" },
  PROCEDURE:    { border: "border-l-emerald-500", dot: "bg-emerald-500", label: "Procedure" },
  FOLLOW_UP:    { border: "border-l-amber-500",   dot: "bg-amber-500",   label: "Follow-up" },
  REVIEW:       { border: "border-l-sky-500",     dot: "bg-sky-500",     label: "Review" },
  EMERGENCY:    { border: "border-l-red-500",     dot: "bg-red-500",     label: "Emergency" },
};

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-PK", { weekday: "short", month: "short", day: "numeric", timeZone: CLINIC_TZ });
}

function getWeekDates(date: string): string[] {
  const d = new Date(date + "T00:00:00");
  const day = d.getDay();
  const monday = new Date(d);
  monday.setDate(d.getDate() - day + (day === 0 ? -6 : 1));
  return Array.from({ length: 7 }, (_, i) => {
    const dd = new Date(monday);
    dd.setDate(monday.getDate() + i);
    return toClinicDay(dd);
  });
}

// Default export wraps the actual page in Suspense — Next 15 requires this
// when a client page calls useSearchParams() (otherwise static prerender
// bails with "should be wrapped in a suspense boundary").
export default function CalendarPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20"><LoadingSpinner size="lg" /></div>}>
      <CalendarPageInner />
    </Suspense>
  );
}

function CalendarPageInner() {
  const access = useModuleAccess("MOD-APPOINTMENT");
  // ?patientId=… arrives from the LiveCallPanel "Book appt" CTA so the
  // QuickBookPanel can open a slot with the caller already selected.
  const searchParams = useSearchParams();
  const prefilledPatientId = searchParams.get("patientId") || "";
  const [view, setView] = useState<ViewMode>("room");
  const [selectedDate, setSelectedDate] = useState(getClinicToday());
  const [doctorFilter, setDoctorFilter] = useState("");
  const [branchFilter, setBranchFilter] = useState("");
  const [bookingSlot, setBookingSlot] = useState<{ time: string; endTime: string; doctorId: string; doctorName: string; date: string } | null>(null);
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);
  const [showAvailability, setShowAvailability] = useState(false);
  const [showBlockForm, setShowBlockForm] = useState(false);
  const unblockSlot = useUnblockSlot();
  const updateAppointment = useUpdateAppointment();
  const { confirm } = useConfirm();
  const [rescheduleBanner, setRescheduleBanner] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  // Wrap the unblock with the global confirm dialog so we get a proper
  // modal instead of the platform-native confirm() the inner DayGrid
  // was using before. Returns the bound handler that DayGrid passes to
  // each blocked-slot's tiny "X" button.
  const handleUnblock = async (id: string) => {
    const ok = await confirm({
      title: "Unblock this slot?",
      message: "The window becomes bookable again immediately. Existing appointments aren't affected.",
      confirmLabel: "Unblock",
      variant: "warning",
    });
    if (!ok) return;
    unblockSlot.mutate(id);
  };

  // Given an appointment + target slot coords, issue the PUT. The server's
  // app-level findAppointmentConflicts + DB EXCLUDE constraint reject
  // overlaps; we surface those as a dismissable banner.
  function rescheduleAppointment(params: {
    apptId: string;
    apptCode?: string;
    date: string;       // YYYY-MM-DD
    startTime: string;  // "HH:MM"
    endTime: string;    // "HH:MM"
    doctorId?: string;
    roomId?: string | null;
  }) {
    const data: Record<string, unknown> = {
      date: params.date,
      startTime: params.startTime,
      endTime: params.endTime,
    };
    if (params.doctorId) data.doctorId = params.doctorId;
    if (params.roomId !== undefined) data.roomId = params.roomId;

    updateAppointment.mutate(
      { id: params.apptId, data },
      {
        onSuccess: () => {
          setRescheduleBanner({ kind: "ok", text: `Rescheduled ${params.apptCode || "appointment"} to ${params.date} ${params.startTime}` });
          setTimeout(() => setRescheduleBanner(null), 3000);
        },
        onError: (err) => {
          const msg = err instanceof Error ? err.message : "Could not reschedule";
          setRescheduleBanner({ kind: "err", text: msg });
          setTimeout(() => setRescheduleBanner(null), 5000);
        },
      }
    );
  }

  // Week dates
  const weekDates = useMemo(() => view === "week" ? getWeekDates(selectedDate) : [selectedDate], [view, selectedDate]);

  // Calendar data
  const calendarParams: Record<string, string> = { date: weekDates[0], view };
  if (weekDates.length > 1) calendarParams.endDate = weekDates[weekDates.length - 1];
  if (doctorFilter) calendarParams.doctorId = doctorFilter;
  if (branchFilter) calendarParams.branchId = branchFilter;

  const { data: calResponse, isLoading } = useCalendar(calendarParams);
  const calendarData = (calResponse?.data || {}) as Record<string, { doctors: DoctorCalendar[]; rooms: RoomCalendar[] }>;
  const summary = (calResponse?.summary || {}) as Record<string, number>;
  // Clinic working hours snapshot from /admin/settings (echoed by the
  // calendar API). Used to show a "closed today" banner when the
  // selected date isn't in the working-days list.
  const clinicHours = (calResponse?.clinicHours || null) as null | { opensAt: string; closesAt: string; workingDays: string[] };
  const SHORT_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const selectedDayShort = SHORT_DAYS[new Date(selectedDate + "T00:00:00").getDay()];
  const isClosedDay = !!clinicHours && !clinicHours.workingDays.includes(selectedDayShort);

  // Filters data
  const { data: staffRes } = useStaff();
  const doctors = ((staffRes?.data || []) as { id: string; name: string; role: string }[]).filter((u) => u.role === "DOCTOR");
  const { data: branchRes } = useBranches();
  const branches = ((branchRes?.data || []) as { id: string; name: string }[]);

  const navigateDate = (delta: number) => {
    const d = new Date(selectedDate + "T00:00:00");
    d.setDate(d.getDate() + (view === "week" ? delta * 7 : delta));
    setSelectedDate(toClinicDay(d));
  };

  const today = getClinicToday();

  if (!access.canView) {
    return <div className="flex items-center justify-center py-20 text-stone-500">You don&apos;t have access to this module.</div>;
  }

  return (
    <div className="space-y-5 sm:space-y-6 animate-fade-in" data-id="MOD-CALENDAR">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl border border-stone-100 bg-gradient-to-br from-violet-600 via-purple-600 to-fuchsia-600 px-5 py-5 sm:px-7 sm:py-6 text-white">
        <div className="absolute inset-0 opacity-25 [background:radial-gradient(circle_at_30%_30%,#fff_0,transparent_45%)]" />
        <div className="relative flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <CalendarIcon className="w-4 h-4" />
              <span className="text-[11px] uppercase tracking-wider font-semibold opacity-90">Calendar</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-semibold leading-tight">Schedule, reschedule, find a slot.</h1>
            <p className="text-sm opacity-90 mt-1 max-w-xl">
              Drag any appointment to move it. Click an empty slot to book.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              iconLeft={<Zap className="w-3.5 h-3.5" />}
              onClick={() => setShowAvailability(!showAvailability)}
              className="!bg-white/15 !border-white/30 !text-white hover:!bg-white/25"
            >
              {showAvailability ? "Hide" : "Find available"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              iconLeft={<Ban className="w-3.5 h-3.5" />}
              onClick={() => setShowBlockForm(true)}
              className="!bg-white/15 !border-white/30 !text-white hover:!bg-white/25"
            >
              Block slot
            </Button>
            <Button
              iconLeft={<Plus className="w-4 h-4" />}
              onClick={() => setBookingSlot({ time: "09:00", endTime: "09:30", doctorId: "", doctorName: "", date: selectedDate })}
              className="!bg-white !text-purple-700 hover:!bg-stone-50"
            >
              Book
            </Button>
          </div>
        </div>
      </div>

      {/* Closed-day banner — surfaces /admin/settings → working_days
          when the selected date falls on a non-working day. Slots
          render as unavailable for the whole day; this just explains
          why everything's grayed out. */}
      {isClosedDay && clinicHours && (
        <div className="flex items-start gap-3 p-3.5 rounded-2xl bg-amber-50 border border-amber-100">
          <CalendarIcon className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
          <div className="text-sm text-amber-800 flex-1">
            <p className="font-medium">Clinic closed on {selectedDayShort}.</p>
            <p className="text-xs mt-0.5">
              Working days: {clinicHours.workingDays.join(", ")}. Hours: {clinicHours.opensAt}–{clinicHours.closesAt}.
              Update from <Link href="/admin/settings" className="underline-offset-2 hover:underline font-medium">Admin → Settings → Appointments</Link>.
            </p>
          </div>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard label="Available slots" value={summary.availableSlots || 0} icon={<Clock className="w-5 h-5" />} color="primary" />
        <StatCard label="Booked" value={summary.bookedSlots || 0} icon={<CalendarIcon className="w-5 h-5" />} color="info" />
        <StatCard label="Doctors on shift" value={summary.doctorCount || 0} icon={<Stethoscope className="w-5 h-5" />} color="purple" />
        <StatCard label="Rooms available" value={summary.availableRooms || 0} icon={<DoorOpen className="w-5 h-5" />} color="success" />
      </div>

      {/* Controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2.5 flex-wrap">
        {/* Date Nav */}
        <div className="flex items-center gap-1.5 bg-white rounded-xl border border-stone-200 p-1">
          <button onClick={() => navigateDate(-1)} className="p-2 rounded-lg hover:bg-stone-100 cursor-pointer"><ChevronLeft className="w-4 h-4 text-stone-500" /></button>
          <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)}
            className="px-2 py-1.5 text-sm font-medium text-stone-900 bg-transparent border-none outline-none cursor-pointer" />
          <button onClick={() => navigateDate(1)} className="p-2 rounded-lg hover:bg-stone-100 cursor-pointer"><ChevronRight className="w-4 h-4 text-stone-500" /></button>
          {selectedDate !== today && (
            <button onClick={() => setSelectedDate(today)} className="px-2 py-1 text-xs font-medium text-teal-600 hover:bg-teal-50 rounded-lg cursor-pointer">Today</button>
          )}
        </div>

        {/* View Toggle */}
        <div className="flex items-center gap-0.5 bg-stone-100 rounded-xl p-1">
          {([
            { value: "room", label: "Rooms", icon: <DoorOpen className="w-3.5 h-3.5" /> },
            { value: "doctor", label: "Doctors", icon: <User className="w-3.5 h-3.5" /> },
            { value: "day", label: "All", icon: <Clock className="w-3.5 h-3.5" /> },
            { value: "week", label: "Week", icon: <CalendarIcon className="w-3.5 h-3.5" /> },
          ] as { value: ViewMode; label: string; icon: React.ReactNode }[]).map((v) => (
            <button key={v.value} onClick={() => setView(v.value)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer",
                view === v.value ? "bg-white text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-700"
              )}>
              {v.icon} {v.label}
            </button>
          ))}
        </div>

        {/* Filters */}
        <Select placeholder="All Doctors" value={doctorFilter} onChange={(e) => setDoctorFilter(e.target.value)}
          options={[{ value: "", label: "All Doctors" }, ...doctors.map((d) => ({ value: d.id, label: d.name }))]} />
        {branches.length > 1 && (
          <Select placeholder="All Branches" value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)}
            options={[{ value: "", label: "All Branches" }, ...branches.map((b) => ({ value: b.id, label: b.name }))]} />
        )}
      </div>

      {/* Calendar Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16"><LoadingSpinner size="lg" /></div>
      ) : (
        <>
          {/* Mobile Agenda View */}
          <div className="md:hidden">
            <AgendaView
              data={calendarData[selectedDate]}
              date={selectedDate}
              onAppointmentClick={(appt) => setSelectedAppointment(appt as unknown as Appointment)}
            />
          </div>
          {/* Reschedule banner (drag-drop feedback) */}
          {rescheduleBanner && (
            <div className={cn(
              "px-3 py-2 rounded-xl text-sm border mb-2 flex items-center gap-2",
              rescheduleBanner.kind === "ok"
                ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                : "bg-red-50 border-red-200 text-red-700"
            )}>
              {rescheduleBanner.kind === "ok" ? "✓" : "⚠"} {rescheduleBanner.text}
              <button onClick={() => setRescheduleBanner(null)} className="ml-auto text-current/60 hover:text-current">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Desktop Grid View */}
          <div className="hidden md:block">
            {(view === "day" || view === "doctor") ? (
              <DayGrid
                data={calendarData[selectedDate]}
                date={selectedDate}
                showDoctors={true}
                showRooms={view === "day"}
                onSlotClick={(time, endTime, colId, colName, colType) => {
                  if (colType === "doctor") setBookingSlot({ time, endTime, doctorId: colId, doctorName: colName, date: selectedDate });
                }}
                onAppointmentClick={(appt) => setSelectedAppointment(appt as unknown as Appointment)}
                onUnblock={handleUnblock}
                onReschedule={rescheduleAppointment}
              />
            ) : view === "room" ? (
              <DayGrid data={calendarData[selectedDate]} date={selectedDate} showDoctors={false} showRooms={true}
                onSlotClick={(time, endTime) => setBookingSlot({ time, endTime, doctorId: "", doctorName: "", date: selectedDate })}
                onAppointmentClick={(appt) => setSelectedAppointment(appt as unknown as Appointment)}
                onUnblock={handleUnblock}
                onReschedule={rescheduleAppointment} />
            ) : (
              <WeekGrid
                data={calendarData}
                dates={weekDates}
                onAppointmentClick={(appt) => setSelectedAppointment(appt as unknown as Appointment)}
                onSlotClick={(date, doctorId) => {
                  // Jump to the day view for that date + pre-select the doctor
                  setSelectedDate(date);
                  setView("doctor");
                  if (doctorId) setDoctorFilter(doctorId);
                }}
                onReschedule={rescheduleAppointment}
              />
            )}
          </div>
        </>
      )}

      {/* Availability Finder */}
      {showAvailability && (
        <AvailabilityPanel
          onBook={(slot) => setBookingSlot({ time: slot.time, endTime: slot.endTime, doctorId: slot.doctorId, doctorName: slot.doctorName, date: slot.date })}
        />
      )}

      {/* Block Slot Panel — was inline; now slide-over for consistency */}
      <BlockSlotPanel
        open={showBlockForm}
        doctors={doctors}
        onClose={() => setShowBlockForm(false)}
        selectedDate={selectedDate}
      />

      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-xs text-stone-500">
        {[
          { status: "available", label: "Available" },
          { status: "booked", label: "Booked" },
          { status: "checked_in", label: "Checked In" },
          { status: "in_progress", label: "In Progress" },
          { status: "completed", label: "Completed" },
          { status: "blocked", label: "Blocked" },
        ].map((s) => (
          <div key={s.status} className="flex items-center gap-1.5">
            <div className={cn("w-3 h-3 rounded", STATUS_COLORS[s.status]?.bg, "border", STATUS_COLORS[s.status]?.border)} />
            <span>{s.label}</span>
          </div>
        ))}
      </div>

      {/* Quick Book Panel */}
      <QuickBookPanel
        slot={bookingSlot}
        onClose={() => setBookingSlot(null)}
        doctors={doctors}
        prefilledPatientId={prefilledPatientId}
      />

      {/* Appointment Detail Slideover */}
      {selectedAppointment && (
        <AppointmentDetail
          appointment={selectedAppointment}
          onClose={() => setSelectedAppointment(null)}
        />
      )}
    </div>
  );
}

// ---- Day Grid Component ----

function DayGrid({ data, date, showDoctors, showRooms, onSlotClick, onAppointmentClick, onUnblock, onReschedule }: {
  data?: { doctors: DoctorCalendar[]; rooms: RoomCalendar[] };
  date: string;
  showDoctors: boolean;
  showRooms: boolean;
  onSlotClick?: (time: string, endTime: string, colId: string, colName: string, colType: "doctor" | "room") => void;
  onAppointmentClick?: (appointment: Record<string, unknown>) => void;
  onUnblock?: (blockId: string) => void;
  onReschedule?: (p: { apptId: string; apptCode?: string; date: string; startTime: string; endTime: string; doctorId?: string; roomId?: string | null }) => void;
}) {
  // Drag state — which appointment is being dragged, and which cell is the
  // current drop target. Keys use "colId|time" so we can highlight the exact
  // cell the cursor is over.
  const [dragAppt, setDragAppt] = useState<{
    id: string; code?: string; startTime: string; endTime: string; origColType: "doctor" | "room";
  } | null>(null);
  const [dropKey, setDropKey] = useState<string | null>(null);

  if (!data) return <div className="text-center text-stone-400 py-8">No data for this date</div>;

  const columns = [
    ...(showDoctors ? data.doctors.map((d) => ({ id: d.doctor.id, label: d.doctor.name, sub: d.doctor.speciality || "", slots: d.slots, isOnLeave: d.isOnLeave, type: "doctor" as const })) : []),
    ...(showRooms ? data.rooms.map((r) => ({ id: r.room.id, label: r.room.name, sub: r.room.type, slots: r.slots, isOnLeave: false, type: "room" as const })) : []),
  ];

  if (columns.length === 0) return <div className="text-center text-stone-400 py-8">No doctors or rooms found</div>;

  // Time labels from the first column's slots
  const timeLabels = columns[0]?.slots.map((s) => s.time) || [];

  // Current time indicator
  const now = new Date();
  const currentDateStr = toClinicDay(now);
  const isToday = date === currentDateStr;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  return (
    <div className="bg-white rounded-2xl border border-stone-100 shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <div className="min-w-[600px]">
          {/* Header */}
          <div className="grid border-b border-stone-100 sticky top-0 bg-white z-10"
            style={{ gridTemplateColumns: `80px repeat(${columns.length}, 1fr)` }}>
            <div className="px-3 py-3 text-xs font-semibold text-stone-400 uppercase tracking-wider border-r border-stone-100">
              Time
            </div>
            {columns.map((col) => (
              <div key={col.id} className="px-3 py-3 text-center border-r border-stone-50 last:border-r-0">
                <div className="flex items-center justify-center gap-1.5">
                  {col.type === "doctor" ? <Stethoscope className="w-3.5 h-3.5 text-teal-500" /> : <DoorOpen className="w-3.5 h-3.5 text-violet-500" />}
                  <span className="text-sm font-semibold text-stone-900 truncate">{col.label}</span>
                </div>
                {col.sub && <p className="text-[10px] text-stone-400 mt-0.5">{col.sub}</p>}
                {col.isOnLeave && <Badge variant="danger" className="mt-1 text-[10px]">On Leave</Badge>}
              </div>
            ))}
          </div>

          {/* Time Grid */}
          <div className="relative">
            {/* Current time line */}
            {isToday && nowMinutes >= 480 && nowMinutes <= 1080 && (
              <div className="absolute left-0 right-0 z-20 pointer-events-none"
                style={{ top: `${((nowMinutes - 480) / 30) * 48}px` }}>
                <div className="flex items-center">
                  <div className="w-2 h-2 rounded-full bg-red-500 -ml-1" />
                  <div className="flex-1 border-t-2 border-red-400 border-dashed" />
                </div>
              </div>
            )}

            {timeLabels.map((time, ti) => (
              <div key={time} className="grid border-b border-stone-50"
                style={{ gridTemplateColumns: `80px repeat(${columns.length}, 1fr)` }}>
                {/* Time label */}
                <div className="px-3 py-2.5 text-xs font-medium text-stone-400 border-r border-stone-100 flex items-center h-12">
                  {time}
                </div>
                {/* Slots */}
                {columns.map((col) => {
                  const slot = col.slots[ti];
                  if (!slot) return <div key={col.id} className="h-12" />;
                  const colors = STATUS_COLORS[slot.status] || STATUS_COLORS.available;
                  const appt = slot.appointment;
                  // When there's an appointment, the left border color switches to the
                  // TYPE accent (CONSULT vs PROCEDURE vs EMERGENCY…), while the BG
                  // still reflects the STATUS (booked / checked_in / in_progress / etc.).
                  const typeAccent = appt ? TYPE_ACCENT[String(appt.type)] : undefined;
                  const borderClass = typeAccent ? `border-l-4 ${typeAccent.border}` : `border-l-2 ${colors.border}`;
                  const cellKey = `${col.id}|${slot.time}`;

                  // Drag semantics: any slot can be a drop target (overlaps are
                  // rejected server-side by findAppointmentConflicts + the DB
                  // EXCLUDE constraint, surfaced as a 409 banner). Source cells
                  // with an appointment are draggable.
                  const canDrop = !!dragAppt && dragAppt.id !== String(appt?.id || "") && col.type === dragAppt.origColType;
                  const isDropTarget = canDrop && dropKey === cellKey;
                  const isBeingDragged = dragAppt?.id === String(appt?.id || "");

                  return (
                    <div key={col.id}
                      onDragOver={(e) => { if (canDrop) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; if (dropKey !== cellKey) setDropKey(cellKey); } }}
                      onDragLeave={(e) => { if ((e.target as HTMLElement) === e.currentTarget) setDropKey(null); }}
                      onDrop={(e) => {
                        e.preventDefault();
                        setDropKey(null);
                        const d = dragAppt;
                        if (!d || !onReschedule) return;
                        // Preserve original duration in minutes
                        const [sh, sm] = d.startTime.split(":").map(Number);
                        const [eh, em] = d.endTime.split(":").map(Number);
                        const durationMin = (eh * 60 + em) - (sh * 60 + sm);
                        const [nh, nm] = slot.time.split(":").map(Number);
                        const newEndTotal = nh * 60 + nm + (durationMin > 0 ? durationMin : 30);
                        const newEnd = `${String(Math.floor(newEndTotal / 60)).padStart(2, "0")}:${String(newEndTotal % 60).padStart(2, "0")}`;
                        onReschedule({
                          apptId: d.id,
                          apptCode: d.code,
                          date,
                          startTime: slot.time,
                          endTime: newEnd,
                          doctorId: col.type === "doctor" ? col.id : undefined,
                          roomId: col.type === "room" ? col.id : undefined,
                        });
                        setDragAppt(null);
                      }}
                      className={cn(
                        "border-r border-stone-50 last:border-r-0 h-12 px-1 py-0.5 transition-all",
                        colors.bg, borderClass,
                        (slot.status === "available" || appt) && "cursor-pointer",
                        isDropTarget && "ring-2 ring-teal-400 ring-inset bg-teal-50",
                        isBeingDragged && "opacity-30"
                      )}
                      onClick={() => {
                        if (slot.status === "available" && onSlotClick) {
                          onSlotClick(slot.time, slot.endTime, col.id, col.label, col.type);
                        } else if (appt && onAppointmentClick) {
                          onAppointmentClick(appt);
                        }
                      }}>
                      {appt ? (
                        <div
                          draggable={!!onReschedule}
                          onDragStart={(e) => {
                            e.stopPropagation();
                            e.dataTransfer.effectAllowed = "move";
                            e.dataTransfer.setData("text/appt-id", String(appt.id));
                            setDragAppt({ id: String(appt.id), code: appt.appointmentCode ? String(appt.appointmentCode) : undefined, startTime: slot.time, endTime: slot.endTime, origColType: col.type });
                          }}
                          onDragEnd={() => { setDragAppt(null); setDropKey(null); }}
                          className={cn("h-full flex flex-col justify-center px-2 min-w-0", onReschedule && "cursor-grab active:cursor-grabbing")}
                          title={onReschedule ? "Drag to reschedule" : undefined}
                        >
                          <div className="flex items-center gap-1.5 min-w-0">
                            {typeAccent && <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", typeAccent.dot)} />}
                            <p className={cn("text-xs font-medium truncate", colors.text)}>
                              {String(appt.patientName)}
                            </p>
                          </div>
                          <p className="text-[10px] text-stone-400 truncate">
                            {typeAccent?.label || String(appt.type).replace("_", " ")} · {String(appt.status).replace("_", " ")}
                          </p>
                        </div>
                      ) : slot.status === "blocked" ? (
                        <div className="h-full flex items-center justify-between px-2 group/block">
                          <p className="text-[10px] text-stone-400 truncate">
                            {String(slot.blocked?.reason || slot.blocked?.type || "Blocked")}
                          </p>
                          {slot.blocked?.id != null && onUnblock && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                // Confirmation handled by the parent's useConfirm wrapper.
                                onUnblock(String(slot.blocked?.id));
                              }}
                              className="opacity-0 group-hover/block:opacity-100 p-0.5 text-red-400 hover:text-red-600 cursor-pointer transition-opacity"
                              title="Unblock this slot"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      ) : slot.status === "available" ? (
                        <div className="h-full flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                          <Plus className="w-3.5 h-3.5 text-teal-400" />
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---- Week Grid Component ----

function WeekGrid({
  data, dates, onAppointmentClick, onSlotClick, onReschedule,
}: {
  data: Record<string, { doctors: DoctorCalendar[] }>;
  dates: string[];
  onAppointmentClick?: (appt: Record<string, unknown>) => void;
  onSlotClick?: (date: string, doctorId: string) => void;
  onReschedule?: (p: { apptId: string; apptCode?: string; date: string; startTime: string; endTime: string; doctorId?: string; roomId?: string | null }) => void;
}) {
  // One row per doctor × 7 day columns. Each cell shows real appointments
  // compact-list style: time + patient name, colored by AppointmentType.
  // Overflow beyond MAX_VISIBLE collapses into a "+N more" chip.
  const allDoctors = data[dates[0]]?.doctors || [];
  const MAX_VISIBLE = 5;
  const todayKey = getClinicToday();

  // Drag state for week view: chip → cell. Moving a chip preserves the
  // appointment's time-of-day (only the date + doctor change).
  const [dragChip, setDragChip] = useState<{ id: string; code?: string; startTime: string; endTime: string } | null>(null);
  const [dropCell, setDropCell] = useState<string | null>(null); // `${doctorId}|${dateKey}`

  return (
    <div className="bg-white rounded-2xl border border-stone-100 shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <div className="min-w-[900px]">
          {/* Header */}
          <div className="grid border-b border-stone-100 sticky top-0 bg-white z-10"
            style={{ gridTemplateColumns: `160px repeat(${dates.length}, 1fr)` }}>
            <div className="px-3 py-3 text-xs font-semibold text-stone-400 uppercase border-r border-stone-100">Doctor</div>
            {dates.map((d) => {
              const isToday = d === todayKey;
              return (
                <div key={d} className={cn("px-2 py-3 text-center border-r border-stone-50 last:border-r-0", isToday && "bg-teal-50/40")}>
                  <p className={cn("text-xs font-semibold", isToday ? "text-teal-700" : "text-stone-700")}>{formatDateLabel(d)}</p>
                </div>
              );
            })}
          </div>

          {/* Rows */}
          {allDoctors.map((doc) => (
            <div key={doc.doctor.id} className="grid border-b border-stone-50"
              style={{ gridTemplateColumns: `160px repeat(${dates.length}, 1fr)` }}>
              <div className="px-3 py-2 border-r border-stone-100 flex items-center gap-2">
                <Stethoscope className="w-3.5 h-3.5 text-teal-500 shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-stone-900 truncate">{doc.doctor.name}</p>
                  <p className="text-[10px] text-stone-400 truncate">{doc.doctor.speciality || ""}</p>
                </div>
              </div>

              {dates.map((dateKey) => {
                const dayDoc = data[dateKey]?.doctors.find((dd) => dd.doctor.id === doc.doctor.id);
                const isToday = dateKey === todayKey;

                if (!dayDoc) return <div key={dateKey} className="py-2 px-1.5 border-r border-stone-50" />;

                if (dayDoc.isOnLeave) {
                  return (
                    <div key={dateKey} className={cn("py-2 px-1.5 border-r border-stone-50 last:border-r-0 flex items-center justify-center",
                      isToday && "bg-teal-50/20")}>
                      <Badge variant="danger" className="text-[10px]">Leave{dayDoc.leaveReason ? ` · ${dayDoc.leaveReason}` : ""}</Badge>
                    </div>
                  );
                }

                const appts = dayDoc.slots
                  .filter((s) => s.appointment && !["cancelled", "no_show"].includes(s.status))
                  .map((s) => ({ time: s.time, endTime: s.endTime, status: s.status, appt: s.appointment! }));
                const visible = appts.slice(0, MAX_VISIBLE);
                const overflow = appts.length - visible.length;

                const cellKey = `${doc.doctor.id}|${dateKey}`;
                const isDropTarget = dragChip && dropCell === cellKey;
                const cellDndProps = onReschedule ? {
                  onDragOver: (e: React.DragEvent<HTMLElement>) => {
                    if (!dragChip) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    if (dropCell !== cellKey) setDropCell(cellKey);
                  },
                  onDragLeave: (e: React.DragEvent<HTMLElement>) => {
                    if ((e.target as HTMLElement) === e.currentTarget) setDropCell(null);
                  },
                  onDrop: (e: React.DragEvent<HTMLElement>) => {
                    e.preventDefault();
                    setDropCell(null);
                    const d = dragChip;
                    if (!d) return;
                    // Preserve original time-of-day; only date + doctor change
                    onReschedule({
                      apptId: d.id,
                      apptCode: d.code,
                      date: dateKey,
                      startTime: d.startTime,
                      endTime: d.endTime,
                      doctorId: doc.doctor.id,
                    });
                    setDragChip(null);
                  },
                } : {};

                if (appts.length === 0) {
                  return (
                    <button
                      key={dateKey}
                      onClick={() => onSlotClick?.(dateKey, doc.doctor.id)}
                      {...cellDndProps}
                      className={cn(
                        "py-2 px-1.5 border-r border-stone-50 last:border-r-0 min-h-[64px] flex items-center justify-center text-[10px] text-stone-300 hover:text-teal-500 hover:bg-teal-50/30 transition-colors cursor-pointer w-full",
                        isToday && "bg-teal-50/20",
                        isDropTarget && "ring-2 ring-teal-400 ring-inset bg-teal-50"
                      )}
                      title={dragChip ? "Drop here to reschedule" : "Click to book on this day"}
                    >
                      {dragChip ? "Drop here" : "—"}
                    </button>
                  );
                }

                return (
                  <div
                    key={dateKey}
                    {...cellDndProps}
                    className={cn(
                      "py-1 px-1 border-r border-stone-50 last:border-r-0 space-y-0.5",
                      isToday && "bg-teal-50/20",
                      isDropTarget && "ring-2 ring-teal-400 ring-inset bg-teal-50"
                    )}
                  >
                    {visible.map((entry, idx) => {
                      const appt = entry.appt;
                      const typeAccent = TYPE_ACCENT[String(appt.type)];
                      const statusColors = STATUS_COLORS[entry.status] || STATUS_COLORS.booked;
                      const apptId = String(appt.id);
                      const isBeingDragged = dragChip?.id === apptId;
                      return (
                        <div
                          key={idx}
                          draggable={!!onReschedule}
                          onDragStart={(e) => {
                            e.stopPropagation();
                            e.dataTransfer.effectAllowed = "move";
                            e.dataTransfer.setData("text/appt-id", apptId);
                            setDragChip({ id: apptId, code: appt.appointmentCode ? String(appt.appointmentCode) : undefined, startTime: entry.time, endTime: entry.endTime });
                          }}
                          onDragEnd={() => { setDragChip(null); setDropCell(null); }}
                          onClick={() => onAppointmentClick?.(appt)}
                          className={cn(
                            "w-full text-left rounded px-1.5 py-0.5 text-[10px] leading-tight flex items-center gap-1 hover:shadow-sm transition-all",
                            statusColors.bg,
                            typeAccent ? `border-l-2 ${typeAccent.border}` : "border-l-2 " + statusColors.border,
                            onReschedule && "cursor-grab active:cursor-grabbing",
                            isBeingDragged && "opacity-30"
                          )}
                          title={`${entry.time} · ${String(appt.patientName)} · ${String(appt.type).replace(/_/g, " ")} · ${String(appt.status).replace(/_/g, " ")}${onReschedule ? " (drag to reschedule)" : ""}`}
                        >
                          <span className="font-mono text-stone-500 shrink-0">{entry.time}</span>
                          <span className={cn("truncate font-medium", statusColors.text)}>{String(appt.patientName)}</span>
                        </div>
                      );
                    })}
                    {overflow > 0 && (
                      <button
                        onClick={() => onSlotClick?.(dateKey, doc.doctor.id)}
                        className="w-full text-center text-[10px] text-teal-600 hover:text-teal-700 py-0.5"
                      >
                        +{overflow} more
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          ))}

          {allDoctors.length === 0 && (
            <div className="py-12 text-center text-sm text-stone-400">No doctors to show for this week</div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---- Quick Book Panel ----

function QuickBookPanel({ slot, onClose, doctors, prefilledPatientId }: {
  slot: { time: string; endTime: string; doctorId: string; doctorName: string; date: string } | null;
  onClose: () => void;
  doctors: { id: string; name: string }[];
  prefilledPatientId?: string;
}) {
  const { user } = useAuth();
  const emit = useModuleEmit("MOD-APPOINTMENT");
  const createAppointment = useCreateAppointment();

  // Patient search via API
  const [patientSearch, setPatientSearch] = useState("");
  const pSearchParams = patientSearch.length >= 2 ? { search: patientSearch } : undefined;
  const { data: patientsRes } = usePatients(pSearchParams);
  const searchResults = ((patientsRes?.data || []) as Patient[]);
  // Seed with the prefilled patient id (from ?patientId= on the URL, set by
  // the LiveCallPanel's "Book appt" CTA). Subsequent live calls pass a new
  // id and the effect below picks it up.
  const [patientId, setPatientId] = useState(prefilledPatientId || "");
  useEffect(() => {
    if (prefilledPatientId) setPatientId(prefilledPatientId);
  }, [prefilledPatientId]);
  const { data: singlePatientRes } = usePatient(patientId);
  const singlePatient = (singlePatientRes?.data || null) as Patient | null;
  const selectedPatient = searchResults.find((p) => p.id === patientId) || singlePatient;

  // Recent contact activity for THIS agent — feeds the "Recent callers"
  // widget. Backed by /api/calls/activity (in-memory per-agent ring
  // buffer in /api/calls/incoming) so phone calls AND WhatsApp messages
  // both show up regardless of match state. The older /api/calls/recent
  // (CallLog rows) only surfaces ended/missed phone calls, which made
  // WhatsApp-heavy receptionists see stale entries.
  type RecentCaller = {
    id: string;
    ts: number;
    channel: "phone" | "whatsapp";
    direction: "INBOUND" | "OUTBOUND";
    state: string | null;
    phone: string;
    contactName: string | null;
    patientId: string | null;
    patientFirstName: string | null;
    patientLastName: string | null;
    leadId: string | null;
    leadName: string | null;
  };
  const { data: recentRes } = useQuery({
    queryKey: ["calls-activity-quickbook", user?.id],
    queryFn: () =>
      fetch(`/api/calls/activity?agentId=${user?.id}&limit=20`, { credentials: "include" })
        .then((r) => r.json()),
    enabled: !!user?.id,
    refetchInterval: 5_000,
  });
  const recentCallers = useMemo(() => {
    const items = ((recentRes?.data || []) as RecentCaller[]);
    const seen = new Set<string>();
    const out: RecentCaller[] = [];
    for (const c of items) {
      const key = c.patientId || c.leadId || c.phone || c.contactName || c.id;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(c);
      if (out.length >= 6) break;
    }
    return out;
  }, [recentRes]);

  // Tap an unmatched recent caller → open the New Patient panel with their
  // phone + saved contact name pre-filled, then drop the freshly-created
  // patient into the booking flow.
  const [addPrefill, setAddPrefill] = useState<{ firstName?: string; lastName?: string; phone?: string } | null>(null);

  function handleRecentCallerClick(c: RecentCaller) {
    if (c.patientId) {
      setPatientId(c.patientId);
      return;
    }
    // Unmatched: split the device contactName by first space → first/last.
    const fullName = (c.contactName || c.leadName || "").trim();
    const sp = fullName.indexOf(" ");
    const firstName = sp > 0 ? fullName.slice(0, sp) : fullName;
    const lastName = sp > 0 ? fullName.slice(sp + 1) : "";
    setAddPrefill({
      firstName,
      lastName,
      phone: c.phone || "",
    });
  }

  // Selections
  const [doctorId, setDoctorId] = useState(slot?.doctorId || "");
  const [type, setType] = useState("CONSULTATION");
  const [duration, setDuration] = useState("30");
  const [selectedTime, setSelectedTime] = useState(slot?.time || "");
  const [treatmentId, setTreatmentId] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  // Treatments
  const { data: treatmentsRes } = useTreatments();
  const treatments = ((treatmentsRes?.data || []) as { id: string; name: string; category: string; duration: number }[]);

  // Patient history
  const { data: patientApptsRes } = usePatientAppointments(patientId);
  const patientAppts = ((patientApptsRes?.data || []) as { status: string }[]);
  const hasVisitHistory = patientAppts.some((a) => a.status === "COMPLETED" || a.status === "IN_PROGRESS");

  const appointmentTypes = [
    { v: "CONSULTATION", l: "Consultation", d: "30", always: true },
    { v: "PROCEDURE", l: "Procedure", d: "45", always: true },
    { v: "FOLLOW_UP", l: "Follow-Up", d: "20", always: false },
    { v: "REVIEW", l: "Review", d: "15", always: false },
    { v: "EMERGENCY", l: "Emergency", d: "30", always: true },
  ].filter((t) => t.always || hasVisitHistory);

  // Calendar data for the day — used to compute available time slots per doctor
  const calParams: Record<string, string> = { date: slot?.date || getClinicToday(), view: "day" };
  const { data: calRes } = useCalendar(calParams);
  const dayData = (calRes?.data || {})[slot?.date || ""] as { doctors: DoctorCalendar[] } | undefined;

  // Build set of busy times for selected doctor
  const busyTimes = new Set<string>();
  if (doctorId && dayData?.doctors) {
    const dc = dayData.doctors.find((d) => d.doctor.id === doctorId);
    dc?.slots.forEach((s) => {
      if (s.status === "booked" || s.status === "checked_in" || s.status === "in_progress" || s.status === "blocked") {
        busyTimes.add(s.time);
      }
    });
  }

  // Build set of busy doctors per time slot (for showing availability count)
  const busyDoctorsByTime: Record<string, Set<string>> = {};
  if (dayData?.doctors) {
    dayData.doctors.forEach((dc) => {
      dc.slots.forEach((s) => {
        if (s.status === "booked" || s.status === "checked_in" || s.status === "in_progress") {
          if (!busyDoctorsByTime[s.time]) busyDoctorsByTime[s.time] = new Set();
          busyDoctorsByTime[s.time].add(dc.doctor.id);
        }
      });
    });
  }

  // 30-min time slots 08:00–18:00
  const timeSlots: string[] = [];
  for (let h = 8; h < 18; h++) {
    timeSlots.push(`${h.toString().padStart(2, "0")}:00`);
    timeSlots.push(`${h.toString().padStart(2, "0")}:30`);
  }

  // Available doctors at currently selected time
  const busyAtSelectedTime = busyDoctorsByTime[selectedTime] || new Set();
  const availableDoctorsAtTime = doctors.filter((d) => !busyAtSelectedTime.has(d.id));

  // Sync when slot changes
  const [prevSlot, setPrevSlot] = useState(slot);
  if (slot !== prevSlot) {
    setPrevSlot(slot);
    if (slot) {
      setDoctorId(slot.doctorId);
      setSelectedTime(slot.time || "");
      setPatientId(""); setPatientSearch("");
      setType("CONSULTATION"); setDuration("30");
      setNotes(""); setError(""); setSuccess(false);
    }
  }

  const fmtTime = (time: string) => {
    const [h, m] = time.split(":").map(Number);
    return `${h % 12 || 12}:${m.toString().padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
  };

  const handleBook = async () => {
    if (!patientId) { setError("Select a patient"); return; }
    if (!doctorId) { setError("Select a doctor"); return; }
    if (!selectedTime) { setError("Select a time"); return; }
    setError("");

    const durMins = parseInt(duration) || 30;
    const [h, m] = selectedTime.split(":").map(Number);
    const endH = h + Math.floor((m + durMins) / 60);
    const endM = (m + durMins) % 60;
    const endTime = `${endH.toString().padStart(2, "0")}:${endM.toString().padStart(2, "0")}`;

    try {
      await createAppointment.mutateAsync({
        patientId, doctorId,
        branchId: user?.branchId || undefined,
        date: slot?.date || getClinicToday(),
        startTime: selectedTime, endTime,
        durationMinutes: durMins,
        type, priority: "NORMAL",
        treatmentId: treatmentId || undefined,
        notes: notes.trim() || undefined,
        createdById: user?.id || undefined,
      });
      const doc = doctors.find((d) => d.id === doctorId);
      emit(SystemEvents.APPOINTMENT_BOOKED, {
        patientName: selectedPatient ? `${selectedPatient.firstName} ${selectedPatient.lastName}` : "",
        doctorName: doc?.name || "", date: slot?.date,
      }, { patientId });
      setSuccess(true);
      setTimeout(onClose, 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to book");
    }
  };

  const dateLabel = slot ? new Date(slot.date + "T00:00:00").toLocaleDateString("en-PK", { weekday: "long", month: "long", day: "numeric", timeZone: CLINIC_TZ }) : "";
  const selectedDoc = doctors.find((d) => d.id === doctorId);

  return (
    <SlidePanel isOpen={!!slot} onClose={onClose} title="Book Appointment"
      subtitle={dateLabel} width="md"
      footer={success ? undefined : (
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleBook} disabled={createAppointment.isPending || !patientId || !doctorId || !selectedTime}>
            {createAppointment.isPending ? "Booking..." : "Book Now"}
          </Button>
        </>
      )}>
      {success ? (
        <div className="flex flex-col items-center justify-center py-12 animate-fade-in">
          <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center mb-4">
            <CalendarIcon className="w-8 h-8 text-emerald-500" />
          </div>
          <h3 className="text-lg font-semibold text-stone-900">Booked!</h3>
          <p className="text-sm text-stone-500 mt-1">
            {selectedPatient ? `${selectedPatient.firstName} ${selectedPatient.lastName}` : ""} — {selectedTime ? fmtTime(selectedTime) : ""}
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {error && <div className="bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl px-4 py-2.5 animate-fade-in">{error}</div>}

          {/* Recent callers — agent-scoped, deduped. Hidden once a patient
              is selected so it doesn't compete with the chosen-patient
              card. Lets the receptionist re-pick the caller after
              accidentally dismissing the panel. */}
          {!selectedPatient && recentCallers.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-semibold text-stone-500 uppercase tracking-wider">Recent callers</span>
              </div>
              <div className="space-y-1.5">
                {recentCallers.map((c) => {
                  const name = c.patientId
                    ? `${c.patientFirstName || ""} ${c.patientLastName || ""}`.trim()
                    : c.leadName || c.contactName || "Unknown caller";
                  const phone = c.phone || "";
                  const isInbound = c.direction === "INBOUND";
                  const isPatient = !!c.patientId;
                  const isWhatsApp = c.channel === "whatsapp";
                  // state set on a whatsapp event = ringing call, not a message.
                  const isWACall = isWhatsApp && !!c.state;
                  const icon = isWACall ? "📞" : isWhatsApp ? "💬" : (isInbound ? "↘" : "↗");
                  const iconBg = isWACall
                    ? "bg-emerald-100 text-emerald-700"
                    : isWhatsApp
                      ? "bg-emerald-50 text-emerald-600"
                      : isInbound ? "bg-teal-50 text-teal-600" : "bg-indigo-50 text-indigo-600";
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => handleRecentCallerClick(c)}
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-xl border border-stone-200 bg-white hover:border-teal-300 hover:bg-teal-50 cursor-pointer text-left transition-colors"
                    >
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs shrink-0 ${iconBg}`}>
                        {icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-stone-900 truncate">{name}</p>
                        <p className="text-xs text-stone-500 truncate font-mono">{phone || "—"}</p>
                      </div>
                      {!isPatient && (
                        <span className="text-[10px] text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full shrink-0">+ Add</span>
                      )}
                    </button>
                  );
                })}
              </div>
              <p className="text-[10px] text-stone-400 mt-2">Tap a recent caller to fill the patient. Unknown numbers open New Patient with phone + name pre-filled.</p>
            </div>
          )}

          {/* Step 1: Patient */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-5 h-5 rounded-full bg-blue-100 flex items-center justify-center text-[10px] font-bold text-blue-600">1</div>
              <span className="text-xs font-semibold text-stone-500 uppercase tracking-wider">Patient</span>
            </div>
            {selectedPatient ? (
              <div className="flex items-center justify-between px-3.5 py-3 bg-blue-50 rounded-xl border border-blue-200">
                <div>
                  <p className="text-sm font-semibold text-stone-900">{selectedPatient.firstName} {selectedPatient.lastName}</p>
                  <p className="text-xs text-stone-500">{selectedPatient.patientCode} · {selectedPatient.phone}</p>
                </div>
                <button onClick={() => { setPatientId(""); setPatientSearch(""); }} className="text-xs text-red-500 hover:underline cursor-pointer">Change</button>
              </div>
            ) : (
              <div className="relative">
                <SearchInput placeholder="Search name, phone, or ID..." value={patientSearch} onChange={setPatientSearch} debounceMs={300} />
                {searchResults.length > 0 && patientSearch.length >= 2 && (
                  <div className="absolute top-full left-0 right-0 z-20 mt-1 bg-white rounded-xl border border-stone-200 shadow-lg max-h-48 overflow-y-auto">
                    {searchResults.slice(0, 8).map((p) => (
                      <button key={p.id} onClick={() => { setPatientId(p.id); setPatientSearch(""); }}
                        className="w-full flex items-center gap-3 px-3.5 py-2.5 hover:bg-stone-50 text-left cursor-pointer border-b border-stone-50 last:border-b-0">
                        <div className="w-8 h-8 rounded-full bg-teal-50 flex items-center justify-center text-xs font-bold text-teal-600">{p.firstName?.[0]}{p.lastName?.[0]}</div>
                        <div>
                          <p className="text-sm font-medium text-stone-900">{p.firstName} {p.lastName}</p>
                          <p className="text-xs text-stone-400">{p.patientCode} · {p.phone}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Step 2: Doctor */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-5 h-5 rounded-full bg-violet-100 flex items-center justify-center text-[10px] font-bold text-violet-600">2</div>
              <span className="text-xs font-semibold text-stone-500 uppercase tracking-wider">Doctor</span>
            </div>
            {selectedDoc ? (
              <div className="flex items-center justify-between px-3.5 py-3 bg-violet-50 rounded-xl border border-violet-200">
                <div className="flex items-center gap-2">
                  <Stethoscope className="w-4 h-4 text-violet-500" />
                  <p className="text-sm font-semibold text-stone-900">{selectedDoc.name}</p>
                </div>
                <button onClick={() => { setDoctorId(""); setSelectedTime(""); }} className="text-xs text-red-500 hover:underline cursor-pointer">Change</button>
              </div>
            ) : (
              <Select placeholder="Select doctor" value={doctorId} onChange={(e) => { setDoctorId(e.target.value); setSelectedTime(""); }}
                options={doctors.map((d) => ({ value: d.id, label: d.name }))} />
            )}
          </div>

          {/* Step 3: Type & Treatment */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-5 h-5 rounded-full bg-amber-100 flex items-center justify-center text-[10px] font-bold text-amber-600">3</div>
              <span className="text-xs font-semibold text-stone-500 uppercase tracking-wider">Type</span>
            </div>
            <div className="grid grid-cols-3 gap-1.5 mb-2">
              {appointmentTypes.map((t) => (
                <button key={t.v} onClick={() => { setType(t.v); setDuration(t.d); }}
                  className={cn(
                    "py-2 rounded-xl border-2 text-xs font-medium transition-all cursor-pointer",
                    type === t.v ? "border-amber-300 bg-amber-50 text-amber-700" : "border-stone-200 bg-white text-stone-500 hover:border-stone-300"
                  )}>{t.l}</button>
              ))}
            </div>
            {type === "PROCEDURE" && treatments.length > 0 && (
              <Select placeholder="Select treatment (optional)" value={treatmentId} onChange={(e) => {
                setTreatmentId(e.target.value);
                const t = treatments.find((tr) => tr.id === e.target.value);
                if (t) {
                  setDuration(String(t.duration || 30));
                  // Only seed notes if the user hasn't typed anything yet —
                  // previously this clobbered any note they'd already typed.
                  setNotes((prev) => (prev.trim() ? prev : t.name));
                }
              }} options={treatments.map((t) => ({ value: t.id, label: `${t.name} (${t.duration || 30}min)` }))} />
            )}
            <div className="flex gap-1.5 mt-2">
              {["15", "20", "30", "45", "60"].map((d) => (
                <button key={d} onClick={() => setDuration(d)}
                  className={cn(
                    "flex-1 py-1.5 rounded-lg border text-[11px] font-medium cursor-pointer",
                    duration === d ? "border-amber-300 bg-amber-50 text-amber-700" : "border-stone-200 text-stone-400"
                  )}>{d}m</button>
              ))}
            </div>
          </div>

          {/* Step 4: Time — dynamic based on doctor availability */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-5 h-5 rounded-full bg-teal-100 flex items-center justify-center text-[10px] font-bold text-teal-600">4</div>
              <span className="text-xs font-semibold text-stone-500 uppercase tracking-wider">
                Time {doctorId && busyTimes.size > 0 && <span className="text-stone-300 normal-case font-normal">({busyTimes.size} slots busy)</span>}
              </span>
            </div>
            {!doctorId ? (
              <p className="text-xs text-stone-400 text-center py-3 bg-stone-50 rounded-xl">Select a doctor first to see available times</p>
            ) : (
              <div className="grid grid-cols-4 gap-1.5 max-h-[160px] overflow-y-auto pr-1">
                {timeSlots.map((t) => {
                  const isBusy = busyTimes.has(t);
                  return (
                    <button key={t} onClick={() => !isBusy && setSelectedTime(t)} disabled={isBusy}
                      className={cn(
                        "py-2 rounded-lg text-xs font-medium transition-all",
                        isBusy ? "bg-red-50 text-red-300 line-through cursor-not-allowed" :
                        selectedTime === t ? "bg-teal-600 text-white shadow-sm cursor-pointer" :
                        "bg-stone-50 text-stone-600 hover:bg-teal-50 hover:text-teal-700 cursor-pointer"
                      )}>{fmtTime(t)}</button>
                  );
                })}
              </div>
            )}
          </div>

          <Input placeholder="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      )}
      <AddPatientModal
        isOpen={!!addPrefill}
        onClose={() => setAddPrefill(null)}
        prefill={addPrefill || undefined}
        onCreated={(newId) => {
          setPatientId(newId);
          setAddPrefill(null);
        }}
      />
    </SlidePanel>
  );
}

// ---- Availability Panel ----

function AvailabilityPanel({ onBook }: {
  onBook: (slot: { date: string; time: string; endTime: string; doctorId: string; doctorName: string }) => void;
}) {
  const [searchType, setSearchType] = useState("CONSULTATION");
  const { data: res, isLoading } = useAvailableSlots({ type: searchType, limit: "6" });
  const slots = ((res?.data || []) as { date: string; time: string; endTime: string; doctorId: string; doctorName: string; speciality: string }[]);

  const fmtTime = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return `${h % 12 || 12}:${m.toString().padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
  };

  return (
    <Card className="border-teal-200 bg-teal-50/30">
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-teal-600" />
            <span className="text-sm font-semibold text-stone-900">Next Available Slots</span>
          </div>
          <div className="flex gap-1">
            {["CONSULTATION", "PROCEDURE", "FOLLOW_UP"].map((t) => (
              <button key={t} onClick={() => setSearchType(t)}
                className={cn("px-2 py-1 rounded-lg text-[10px] font-medium cursor-pointer transition-all",
                  searchType === t ? "bg-teal-500 text-white" : "bg-white text-stone-500 border border-stone-200"
                )}>{t.replace("_", " ")}</button>
            ))}
          </div>
        </div>
        {isLoading ? (
          <p className="text-xs text-stone-400 py-4 text-center">Searching...</p>
        ) : slots.length === 0 ? (
          <p className="text-xs text-stone-400 py-4 text-center">No available slots found in the next 14 days</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {slots.map((s, i) => (
              <button key={i} onClick={() => onBook(s)}
                className="bg-white rounded-xl border border-stone-200 p-3 text-left hover:border-teal-300 hover:shadow-sm transition-all cursor-pointer group">
                <p className="text-sm font-bold text-stone-900 group-hover:text-teal-700">{fmtTime(s.time)}</p>
                <p className="text-[10px] text-stone-400 mt-0.5">
                  {new Date(s.date + "T00:00:00").toLocaleDateString("en-PK", { weekday: "short", month: "short", day: "numeric", timeZone: CLINIC_TZ })}
                </p>
                <p className="text-[11px] text-teal-600 font-medium mt-1 truncate">{s.doctorName}</p>
              </button>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}

// ---- Mobile Agenda View ----

function AgendaView({ data, date, onAppointmentClick }: {
  data?: { doctors: DoctorCalendar[]; rooms: RoomCalendar[] };
  date: string;
  onAppointmentClick?: (appointment: Record<string, unknown>) => void;
}) {
  if (!data) return <div className="text-center text-stone-400 py-8">No appointments for this date</div>;

  // Collect all appointments across doctors, grouped by hour
  const appointmentsByHour: Record<string, { time: string; endTime: string; patientName: string; doctorName: string; type: string; status: string; room?: string; raw: Record<string, unknown> }[]> = {};

  for (const doc of data.doctors) {
    for (const slot of doc.slots) {
      if (!slot.appointment) continue;
      const appt = slot.appointment;
      const hour = slot.time.split(":")[0];
      const hourKey = `${hour}:00`;
      if (!appointmentsByHour[hourKey]) appointmentsByHour[hourKey] = [];
      appointmentsByHour[hourKey].push({
        time: slot.time,
        endTime: slot.endTime,
        patientName: String(appt.patientName || "Unknown"),
        doctorName: doc.doctor.name,
        type: String(appt.type || ""),
        status: String(appt.status || ""),
        room: appt.roomName ? String(appt.roomName) : undefined,
        raw: appt,
      });
    }
  }

  const sortedHours = Object.keys(appointmentsByHour).sort();

  const fmtTime = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return `${h % 12 || 12}:${m.toString().padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
  };

  const fmtHour = (t: string) => {
    const h = parseInt(t.split(":")[0], 10);
    return `${h % 12 || 12} ${h < 12 ? "AM" : "PM"}`;
  };

  const statusBadgeVariant = (status: string): "default" | "info" | "warning" | "success" | "danger" => {
    switch (status) {
      case "booked": return "info";
      case "checked_in": return "warning";
      case "in_progress": return "success";
      case "completed": return "default";
      case "no_show": case "cancelled": return "danger";
      default: return "default";
    }
  };

  if (sortedHours.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-8 text-center">
        <CalendarIcon className="w-8 h-8 text-stone-300 mx-auto mb-2" />
        <p className="text-sm text-stone-400">No appointments for {formatDateLabel(date)}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {sortedHours.map((hour) => (
        <div key={hour}>
          <div className="flex items-center gap-2 mb-2">
            <Clock className="w-3.5 h-3.5 text-stone-400" />
            <span className="text-xs font-semibold text-stone-500 uppercase tracking-wider">{fmtHour(hour)}</span>
            <div className="flex-1 border-t border-stone-100" />
          </div>
          <div className="space-y-2">
            {appointmentsByHour[hour].map((appt, i) => {
              const colors = STATUS_COLORS[appt.status] || STATUS_COLORS.booked;
              const typeAccent = TYPE_ACCENT[appt.type];
              return (
                <button
                  key={`${hour}-${i}`}
                  onClick={() => onAppointmentClick?.(appt.raw)}
                  className={cn(
                    "w-full text-left bg-white rounded-xl border p-3 transition-all active:scale-[0.98] cursor-pointer",
                    typeAccent ? `border-l-4 ${typeAccent.border}` : colors.border
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-stone-900 truncate">{appt.patientName}</p>
                      <div className="flex items-center gap-1.5 mt-1 text-xs text-stone-500">
                        <Clock className="w-3 h-3 shrink-0" />
                        <span>{fmtTime(appt.time)} – {fmtTime(appt.endTime)}</span>
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5 text-xs text-stone-500">
                        <Stethoscope className="w-3 h-3 shrink-0" />
                        <span className="truncate">{appt.doctorName}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        <span className="text-[10px] text-stone-400 font-medium">{appt.type.replace("_", " ")}</span>
                        {appt.room && (
                          <span className="flex items-center gap-0.5 text-[10px] text-stone-400">
                            <DoorOpen className="w-2.5 h-2.5" /> {appt.room}
                          </span>
                        )}
                      </div>
                    </div>
                    <Badge variant={statusBadgeVariant(appt.status)} className="text-[10px] shrink-0">
                      {appt.status.replace("_", " ")}
                    </Badge>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Block Slot Panel — was an inline Card; promoted to a slide-over so
// it matches the rest of the admin UI and gets a real DatePicker /
// time validation. The DB has CHECK endTime > startTime since v12, so
// we mirror that on the client to fail fast instead of round-tripping.
// ─────────────────────────────────────────────────────────────────

function BlockSlotPanel({ open, doctors, onClose, selectedDate }: {
  open: boolean;
  doctors: { id: string; name: string }[];
  onClose: () => void;
  selectedDate: string;
}) {
  const blockSlot = useBlockSlot();

  const [seenKey, setSeenKey] = useState("");
  const key = `${open}::${selectedDate}`;

  const [doctorId, setDoctorId] = useState("");
  const [date, setDate] = useState(selectedDate);
  const [startTime, setStartTime] = useState("13:00");
  const [endTime, setEndTime] = useState("14:00");
  const [blockType, setBlockType] = useState("BREAK");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Reset whenever the panel re-opens — derived-from-prop pattern.
  if (key !== seenKey) {
    setSeenKey(key);
    if (open) {
      setDoctorId(""); setDate(selectedDate);
      setStartTime("13:00"); setEndTime("14:00");
      setBlockType("BREAK"); setReason("");
      setError(null);
      blockSlot.reset();
    }
  }

  const TIME_RE = /^[0-2][0-9]:[0-5][0-9]$/;

  const handleBlock = async () => {
    setError(null);
    if (!TIME_RE.test(startTime) || !TIME_RE.test(endTime)) {
      setError("Times must be in HH:MM (24-hour) format.");
      return;
    }
    // Mirror the v12 DB CHECK so we fail fast instead of 500'ing.
    if (endTime <= startTime) {
      setError("End time must be after start time.");
      return;
    }
    try {
      await blockSlot.mutateAsync({
        doctorId: doctorId || undefined,
        date, startTime, endTime,
        type: blockType,
        reason: reason.trim() || undefined,
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to block slot.");
    }
  };

  return (
    <SlidePanel
      isOpen={open}
      onClose={onClose}
      title="Block time slot"
      subtitle="Mark a window as unavailable for booking — break, prayer, meeting, leave, etc."
      width="md"
      footer={
        <div className="flex justify-end gap-2 w-full">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={handleBlock} disabled={blockSlot.isPending} iconLeft={<Ban className="w-4 h-4" />}>
            {blockSlot.isPending ? "Blocking..." : "Block slot"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4 pt-1">
        {error && (
          <div className="p-3 rounded-xl bg-red-50 border border-red-100 text-sm text-red-700">
            {error}
          </div>
        )}

        <Select
          label="Scope"
          value={doctorId}
          onChange={(e) => setDoctorId(e.target.value)}
          options={[
            { value: "", label: "Clinic-wide (all doctors)" },
            ...doctors.map((d) => ({ value: d.id, label: d.name })),
          ]}
        />

        <DatePicker
          label="Date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />

        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Start time"
            placeholder="13:00"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            helperText="HH:MM (24-hour)"
          />
          <Input
            label="End time"
            placeholder="14:00"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            helperText="Must be after start"
          />
        </div>

        <Select
          label="Type"
          value={blockType}
          onChange={(e) => setBlockType(e.target.value)}
          options={[
            { value: "BREAK", label: "Break" },
            { value: "LUNCH", label: "Lunch" },
            { value: "PRAYER", label: "Prayer" },
            { value: "MEETING", label: "Meeting" },
            { value: "MAINTENANCE", label: "Maintenance" },
            { value: "LEAVE", label: "Leave" },
            { value: "EMERGENCY_HOLD", label: "Emergency Hold" },
            { value: "MANUAL", label: "Manual Block" },
          ]}
        />

        <Input
          label="Reason (optional)"
          placeholder="e.g. Quarterly all-hands"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </div>
    </SlidePanel>
  );
}
