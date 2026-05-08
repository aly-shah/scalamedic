"use client";

/**
 * Appointments list
 * ─────────────────
 * The previous version was already in decent shape (real data shape,
 * defensive nested→flat mapping, working create modal + detail
 * slide-over). This is a targeted modernization to match the recent
 * admin-page template — gradient hero, clickable stat cards, DatePicker,
 * search box, and chip-based filters in place of plain Selects.
 */

import { useMemo, useState } from "react";
import {
  Calendar,
  Plus,
  List,
  CalendarDays,
  Hourglass,
  CheckCircle,
  MapPin,
  Stethoscope,
  ChevronLeft,
  ChevronRight,
  UserCheck,
  X,
  Search as SearchIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { StatCard } from "@/components/ui/stat-card";
import { Avatar } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { SearchInput } from "@/components/ui/search-input";
import { DatePicker } from "@/components/ui/date-picker";
import {
  AppointmentStatus,
  UserRole,
} from "@/types";
import { useAppointments, useStaff } from "@/hooks/use-queries";
import { LoadingSpinner } from "@/components/ui/loading";
import {
  appointmentStatusColors,
  appointmentTypeLabels,
} from "@/lib/constants";
import { CalendarView } from "@/components/appointments/calendar-view";
import { CreateAppointmentModal } from "@/components/appointments/create-appointment-modal";
import { AppointmentDetail } from "@/components/appointments/appointment-detail";
import { useModuleAccess } from "@/modules/core/hooks";
import { CLINIC_TZ, getClinicToday, shiftDay } from "@/lib/utils";
import type { Appointment } from "@/types";

const TYPE_BADGE: Record<
  string,
  { variant: "primary" | "success" | "warning" | "info" | "danger" | "default"; label: string }
> = {
  CONSULTATION: { variant: "primary", label: "Consultation" },
  PROCEDURE: { variant: "success", label: "Procedure" },
  FOLLOW_UP: { variant: "warning", label: "Follow-Up" },
  REVIEW: { variant: "info", label: "Review" },
  EMERGENCY: { variant: "danger", label: "Emergency" },
};

// ═══════════════════════════════════════════════════════════════════════
// Page
// ═══════════════════════════════════════════════════════════════════════

export default function AppointmentsPage() {
  const access = useModuleAccess("MOD-APPOINTMENT");
  const [view, setView] = useState<"list" | "calendar">("list");
  const [doctorFilter, setDoctorFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState<"" | string>("");
  const [statusFilter, setStatusFilter] = useState<"" | string>("");
  const [search, setSearch] = useState("");
  const [selectedDate, setSelectedDate] = useState(getClinicToday());
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);

  const { data: appointmentsResponse, isLoading: isLoadingAppointments } = useAppointments({ date: selectedDate });
  const rawAppointments = (appointmentsResponse?.data || []) as Array<Record<string, unknown>>;

  // Defensive nested→flat normalization. The /api/appointments endpoint
  // returns nested `patient` / `doctor` / `room`, but some legacy callers
  // (e.g. cached payloads) still ship flat names. Take whichever is set.
  const allAppointments = useMemo<Appointment[]>(() => {
    return rawAppointments.map((a) => {
      const patient = a.patient as { firstName?: string; lastName?: string; patientCode?: string; phone?: string } | undefined;
      const doctor = a.doctor as { name?: string } | undefined;
      const room = a.room as { name?: string; number?: string } | undefined;
      return {
        ...a,
        patientName:
          (a.patientName as string) ||
          [patient?.firstName, patient?.lastName].filter(Boolean).join(" ") ||
          "Unknown patient",
        patientCode: (a.patientCode as string) || patient?.patientCode || "",
        patientPhone: (a.patientPhone as string) || patient?.phone || "",
        doctorName: (a.doctorName as string) || doctor?.name || "Unassigned",
        roomName: (a.roomName as string) || room?.name || room?.number || "",
      } as unknown as Appointment;
    });
  }, [rawAppointments]);

  // Don't block render on staff — the doctor filter is a nice-to-have. Used
  // to live in the loading guard below; receptionists got 401 from
  // /api/admin/users (now /api/users) and the page spun for ~30s of React
  // Query retries before settling.
  const { data: staffResponse } = useStaff();
  const staffUsers = (staffResponse?.data || []) as Array<{ id: string; name: string; role: string }>;
  const doctors = staffUsers.filter((u) => u.role === UserRole.DOCTOR);

  const stats = useMemo(() => {
    const total = allAppointments.length;
    const checkedIn = allAppointments.filter((a) => a.status === AppointmentStatus.CHECKED_IN).length;
    const waiting = allAppointments.filter((a) => a.status === AppointmentStatus.WAITING).length;
    const completed = allAppointments.filter((a) => a.status === AppointmentStatus.COMPLETED).length;
    return { total, checkedIn, waiting, completed };
  }, [allAppointments]);

  const filteredAppointments = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allAppointments.filter((a) => {
      if (doctorFilter && a.doctorId !== doctorFilter) return false;
      if (typeFilter && a.type !== typeFilter) return false;
      if (statusFilter && a.status !== statusFilter) return false;
      if (q) {
        const hay = [
          (a as unknown as { patientName?: string }).patientName,
          (a as unknown as { patientCode?: string }).patientCode,
          (a as unknown as { patientPhone?: string }).patientPhone,
          (a as unknown as { doctorName?: string }).doctorName,
          a.appointmentCode,
        ].filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [allAppointments, doctorFilter, typeFilter, statusFilter, search]);

  const statusBadgeVariant = (status: string) =>
    (appointmentStatusColors[status] || "default") as
      | "success"
      | "warning"
      | "danger"
      | "info"
      | "default"
      | "primary";

  const sorted = [...filteredAppointments].sort((a, b) =>
    (a.startTime || "").localeCompare(b.startTime || "")
  );

  const todayFormatted = new Date(`${selectedDate}T12:00:00+05:00`).toLocaleDateString("en-PK", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: CLINIC_TZ,
  });

  const isToday = selectedDate === getClinicToday();

  const cycleStatusFilter = (target: string) =>
    setStatusFilter(statusFilter === target ? "" : target);

  if (isLoadingAppointments) {
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
    <div data-id="APPT-LIST" className="animate-fade-in space-y-5 sm:space-y-6">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl border border-stone-100 bg-gradient-to-br from-indigo-600 via-blue-600 to-cyan-600 px-5 py-5 sm:px-7 sm:py-6 text-white">
        <div className="absolute inset-0 opacity-25 [background:radial-gradient(circle_at_30%_30%,#fff_0,transparent_45%)]" />
        <div className="relative flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <Calendar className="w-4 h-4" />
              <span className="text-[11px] uppercase tracking-wider font-semibold opacity-90">Appointments</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-semibold leading-tight">
              {isToday ? "Today's schedule." : "Schedule for the day."}
            </h1>
            <p className="text-sm opacity-90 mt-1 max-w-xl">{todayFormatted}</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* View toggle inside hero */}
            <div className="flex items-center bg-white/15 rounded-2xl p-1 border border-white/20">
              <button
                onClick={() => setView("list")}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-medium transition-all cursor-pointer ${
                  view === "list" ? "bg-white text-indigo-700 shadow-sm" : "text-white/90 hover:text-white"
                }`}
              >
                <List className="w-3.5 h-3.5" />
                List
              </button>
              <button
                onClick={() => setView("calendar")}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-medium transition-all cursor-pointer ${
                  view === "calendar" ? "bg-white text-indigo-700 shadow-sm" : "text-white/90 hover:text-white"
                }`}
              >
                <CalendarDays className="w-3.5 h-3.5" />
                Calendar
              </button>
            </div>
            {access.canCreate && (
              <Button
                iconLeft={<Plus className="w-4 h-4" />}
                onClick={() => setShowCreateModal(true)}
                className="!bg-white !text-indigo-700 hover:!bg-stone-50"
              >
                New appointment
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Stats — clickable status filters */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatFilterTile
          label="Total today"
          value={stats.total}
          icon={<Calendar className="w-5 h-5" />}
          color="primary"
          active={statusFilter === ""}
          onClick={() => setStatusFilter("")}
        />
        <StatFilterTile
          label="Checked in"
          value={stats.checkedIn}
          icon={<UserCheck className="w-5 h-5" />}
          color="info"
          active={statusFilter === AppointmentStatus.CHECKED_IN}
          onClick={() => cycleStatusFilter(AppointmentStatus.CHECKED_IN)}
        />
        <StatFilterTile
          label="Waiting"
          value={stats.waiting}
          icon={<Hourglass className="w-5 h-5" />}
          color="warning"
          active={statusFilter === AppointmentStatus.WAITING}
          onClick={() => cycleStatusFilter(AppointmentStatus.WAITING)}
        />
        <StatFilterTile
          label="Completed"
          value={stats.completed}
          icon={<CheckCircle className="w-5 h-5" />}
          color="success"
          active={statusFilter === AppointmentStatus.COMPLETED}
          onClick={() => cycleStatusFilter(AppointmentStatus.COMPLETED)}
        />
      </div>

      {/* Search + date nav + doctor */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-3 flex-wrap">
          <SearchInput
            placeholder="Search patient name, code, phone, doctor, APT code..."
            value={search}
            onChange={setSearch}
            className="w-full sm:max-w-md"
          />
          {/* Date nav */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              aria-label="Previous day"
              onClick={() => setSelectedDate(shiftDay(selectedDate, -1))}
              className="p-2.5 bg-white border border-stone-200 rounded-xl text-stone-600 hover:bg-stone-50 hover:text-stone-900 transition-all cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="min-w-[180px]">
              <DatePicker
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
              />
            </div>
            <button
              type="button"
              aria-label="Next day"
              onClick={() => setSelectedDate(shiftDay(selectedDate, 1))}
              className="p-2.5 bg-white border border-stone-200 rounded-xl text-stone-600 hover:bg-stone-50 hover:text-stone-900 transition-all cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            {!isToday && (
              <button
                type="button"
                onClick={() => setSelectedDate(getClinicToday())}
                className="px-3 py-2.5 text-sm font-medium bg-white border border-stone-200 rounded-xl text-teal-600 hover:bg-teal-50 hover:border-teal-200 transition-all cursor-pointer"
              >
                Today
              </button>
            )}
          </div>
          {/* Doctor select stays Select — usually 5–20 doctors, not chip-friendly */}
          {doctors.length > 0 && (
            <div className="min-w-[200px]">
              <Select
                placeholder="All doctors"
                value={doctorFilter}
                onChange={(e) => setDoctorFilter(e.target.value)}
                options={[
                  { value: "", label: "All doctors" },
                  ...doctors.map((d) => ({ value: d.id, label: d.name })),
                ]}
              />
            </div>
          )}
        </div>

        {/* Type chips */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] uppercase tracking-wider text-stone-400 font-semibold mr-1">Type</span>
          <button
            onClick={() => setTypeFilter("")}
            className={`text-[11px] px-2.5 py-1 rounded-full transition-all cursor-pointer ${
              typeFilter === "" ? "bg-indigo-600 text-white" : "bg-stone-100 text-stone-600 hover:bg-stone-200"
            }`}
          >
            All
          </button>
          {Object.entries(appointmentTypeLabels).map(([v, l]) => (
            <button
              key={v}
              onClick={() => setTypeFilter(typeFilter === v ? "" : v)}
              className={`text-[11px] px-2.5 py-1 rounded-full transition-all cursor-pointer ${
                typeFilter === v ? "bg-indigo-600 text-white" : "bg-stone-100 text-stone-600 hover:bg-stone-200"
              }`}
            >
              {l}
            </button>
          ))}
          {(doctorFilter || typeFilter || statusFilter || search) && (
            <button
              onClick={() => { setDoctorFilter(""); setTypeFilter(""); setStatusFilter(""); setSearch(""); }}
              className="text-[11px] px-2.5 py-1 rounded-full text-stone-500 hover:text-stone-700 cursor-pointer flex items-center gap-1"
            >
              <X className="w-3 h-3" /> Clear all
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      {view === "list" ? (
        <div className="flex flex-col gap-3">
          {sorted.length === 0 && (
            <EmptyState onCreate={() => setShowCreateModal(true)} canCreate={!!access.canCreate} hasFilters={!!(doctorFilter || typeFilter || statusFilter || search)} />
          )}

          {sorted.map((appt) => {
            const typeConfig = TYPE_BADGE[appt.type] || { variant: "default" as const, label: appt.type };
            return (
              <Card
                key={appt.id}
                hover
                onClick={() => setSelectedAppointment(appt)}
                className="group transition-all duration-200 hover:shadow-md hover:border-teal-200/60"
              >
                <div className="flex items-center gap-3 sm:gap-5 p-4 sm:p-5 flex-wrap sm:flex-nowrap">
                  {/* Time block */}
                  <div className="flex-shrink-0 w-16 sm:w-20 text-center">
                    <div className="bg-teal-50 rounded-2xl px-3 py-2.5 border border-teal-100/60">
                      <p className="text-lg font-bold text-teal-700 leading-tight tracking-tight">
                        {appt.startTime}
                      </p>
                      <p className="text-[10px] text-teal-500 font-medium mt-0.5">
                        {appt.endTime}
                      </p>
                    </div>
                  </div>

                  <div className="hidden sm:block w-px h-14 bg-stone-200/70 flex-shrink-0" />

                  {/* Patient + doctor */}
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <Avatar name={appt.patientName} size="lg" />
                    <div className="min-w-0">
                      <p className="font-semibold text-stone-900 truncate">{appt.patientName}</p>
                      <div className="flex items-center gap-1.5 mt-1 text-xs text-stone-500">
                        <Stethoscope className="w-3 h-3 text-stone-400 flex-shrink-0" />
                        <span className="truncate">{appt.doctorName}</span>
                      </div>
                    </div>
                  </div>

                  {/* Type & room */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Badge variant={typeConfig.variant}>{typeConfig.label}</Badge>
                    {appt.roomName && (
                      <Badge variant="default">
                        <MapPin className="w-2.5 h-2.5 mr-0.5" />
                        {appt.roomName}
                      </Badge>
                    )}
                  </div>

                  {/* Status */}
                  <div className="flex-shrink-0">
                    <Badge variant={statusBadgeVariant(appt.status)} dot>
                      {appt.status.replace(/_/g, " ")}
                    </Badge>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      ) : (
        <CalendarView onSelectAppointment={setSelectedAppointment} />
      )}

      {/* Create Modal */}
      <CreateAppointmentModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
      />

      {/* Detail Slideover */}
      {selectedAppointment && (
        <AppointmentDetail
          appointment={selectedAppointment}
          onClose={() => setSelectedAppointment(null)}
        />
      )}
    </div>
  );
}

// ─── Pieces ────────────────────────────────────────────────────────

function StatFilterTile({
  label, value, icon, color, active, onClick,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  color: "primary" | "info" | "warning" | "success";
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`text-left w-full transition-all rounded-2xl ${
        active ? "ring-2 ring-stone-900 ring-offset-2 ring-offset-white" : "hover:scale-[1.01]"
      }`}
    >
      <StatCard label={label} value={value} icon={icon} color={color} />
    </button>
  );
}

function EmptyState({
  onCreate, canCreate, hasFilters,
}: {
  onCreate: () => void;
  canCreate: boolean;
  hasFilters: boolean;
}) {
  return (
    <div className="rounded-2xl border-2 border-dashed border-stone-200 py-16 px-6 text-center">
      <div className="w-14 h-14 mx-auto rounded-full bg-indigo-50 flex items-center justify-center mb-3">
        {hasFilters ? <SearchIcon className="w-7 h-7 text-indigo-400" /> : <Calendar className="w-7 h-7 text-indigo-400" />}
      </div>
      <p className="text-sm text-stone-700 font-medium mb-1">
        {hasFilters ? "No appointments match your filters." : "No appointments scheduled for this day."}
      </p>
      <p className="text-xs text-stone-400 mb-4">
        {hasFilters ? "Adjust your search or filters to see more results." : canCreate ? "Book one to fill the schedule." : ""}
      </p>
      {!hasFilters && canCreate && (
        <Button onClick={onCreate} iconLeft={<Plus className="w-4 h-4" />}>New appointment</Button>
      )}
    </div>
  );
}
