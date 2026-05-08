"use client";

import { useState, useMemo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppointments, useStaff } from "@/hooks/use-queries";
import { UserRole } from "@/types";
import { appointmentTypeLabels } from "@/lib/constants";
import type { Appointment, User } from "@/types";

import { getClinicToday, toClinicDay } from "@/lib/utils";

// Defensive — the /api/appointments endpoint returns nested
// patient: { firstName, lastName } and doctor: { name }; legacy callers
// (mock data) used flat patientName/doctorName strings. Take whichever
// is present, same as the list view's normalization.
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
// Prisma serializes @db.Date as a full ISO timestamp, e.g.
// "2026-05-02T00:00:00.000Z". Compare on YYYY-MM-DD only.
function aptDateKey(a: Appointment): string {
  return (a.date || "").slice(0, 10);
}
interface CalendarViewProps {
  onSelectAppointment: (appt: Appointment) => void;
}

const TYPE_COLORS: Record<string, string> = {
  CONSULTATION: "#4318FF",
  PROCEDURE: "#05CD99",
  FOLLOW_UP: "#FFB547",
  REVIEW: "#3B82F6",
  EMERGENCY: "#EE5D50",
};

const TYPE_BG: Record<string, string> = {
  CONSULTATION: "rgba(67,24,255,0.10)",
  PROCEDURE: "rgba(5,205,153,0.10)",
  FOLLOW_UP: "rgba(255,181,71,0.10)",
  REVIEW: "rgba(59,130,246,0.10)",
  EMERGENCY: "rgba(238,93,80,0.10)",
};

const HOURS = Array.from({ length: 21 }, (_, i) => {
  const hour = 8 + Math.floor(i / 2);
  const min = i % 2 === 0 ? "00" : "30";
  return { hour, min, label: `${hour % 12 || 12}:${min} ${hour < 12 ? "AM" : "PM"}`, time: `${hour.toString().padStart(2, "0")}:${min}` };
});

function getWeekDates(date: Date): Date[] {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d.setDate(diff));
  return Array.from({ length: 7 }, (_, i) => {
    const dd = new Date(monday);
    dd.setDate(monday.getDate() + i);
    return dd;
  });
}

function formatDateKey(d: Date): string {
  return toClinicDay(d);
}

function timeToSlot(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return (h - 8) * 2 + (m >= 30 ? 1 : 0);
}

function slotSpan(start: string, end: string): number {
  return Math.max(1, timeToSlot(end) - timeToSlot(start));
}

export function CalendarView({ onSelectAppointment }: CalendarViewProps) {
  const [weekOffset, setWeekOffset] = useState(0);
  const [doctorFilter, setDoctorFilter] = useState("all");

  const { data: appointmentsResponse } = useAppointments();
  const allAppointments = (appointmentsResponse?.data || []) as Appointment[];
  const { data: staffResponse } = useStaff();
  const allUsers = (staffResponse?.data || []) as User[];

  const baseDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + weekOffset * 7);
    return d;
  }, [weekOffset]);

  const weekDates = useMemo(() => getWeekDates(baseDate), [baseDate]);
  // Calendar filter pulls every staff role that can own an appointment
  // (doctor, aesthetician, operator). Role chips in the appointment-
  // create modal and this filter both honor the same set.
  const practitioners = allUsers.filter(
    (u) =>
      u.role === UserRole.DOCTOR ||
      u.role === UserRole.AESTHETICIAN ||
      u.role === UserRole.OPERATOR,
  );

  const dateKeys = weekDates.map(formatDateKey);
  const appointments = allAppointments.filter((a) => {
    if (!dateKeys.includes(aptDateKey(a))) return false;
    if (doctorFilter !== "all" && a.doctorId !== doctorFilter) return false;
    return true;
  });

  const dayMap = useMemo(() => {
    const map: Record<string, Appointment[]> = {};
    for (const a of appointments) {
      const k = aptDateKey(a);
      if (!map[k]) map[k] = [];
      map[k].push(a);
    }
    return map;
  }, [appointments]);

  const isToday = (d: Date) => formatDateKey(d) === getClinicToday();

  return (
    <div data-id="APPT-CALENDAR" className="flex flex-col gap-4">
      {/* Navigation */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            iconLeft={<ChevronLeft className="w-4 h-4" />}
            onClick={() => setWeekOffset((o) => o - 1)}
          >
            Prev
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setWeekOffset(0)}
          >
            Today
          </Button>
          <Button
            variant="outline"
            size="sm"
            iconRight={<ChevronRight className="w-4 h-4" />}
            onClick={() => setWeekOffset((o) => o + 1)}
          >
            Next
          </Button>
          <span className="ml-2 text-sm font-semibold text-stone-900">
            {weekDates[0].toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            {" - "}
            {weekDates[6].toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
          </span>
        </div>

        {/* Doctor Tabs */}
        <div className="flex items-center gap-1 overflow-x-auto scrollbar-none">
          <button
            onClick={() => setDoctorFilter("all")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer whitespace-nowrap ${
              doctorFilter === "all"
                ? "bg-teal-600 text-white"
                : "bg-stone-50 text-stone-500 hover:text-stone-900"
            }`}
          >
            All Staff
          </button>
          {practitioners.map((d) => (
            <button
              key={d.id}
              onClick={() => setDoctorFilter(d.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer whitespace-nowrap ${
                doctorFilter === d.id
                  ? "bg-teal-600 text-white"
                  : "bg-stone-50 text-stone-500 hover:text-stone-900"
              }`}
              title={d.role === UserRole.AESTHETICIAN ? "Aesthetician" : d.role === UserRole.OPERATOR ? "Operator" : "Doctor"}
            >
              {d.name}
            </button>
          ))}
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="bg-white rounded-xl border border-stone-200 shadow-sm overflow-hidden">
        <div className="grid grid-cols-[72px_repeat(7,1fr)] border-b border-stone-200">
          {/* Corner */}
          <div className="p-2 border-r border-stone-200" />
          {weekDates.map((d) => (
            <div
              key={d.toISOString()}
              className={`p-3 text-center border-r border-stone-200 last:border-r-0 ${
                isToday(d) ? "bg-stone-50" : ""
              }`}
            >
              <p className="text-[10px] uppercase font-semibold text-stone-500">
                {d.toLocaleDateString("en-US", { weekday: "short" })}
              </p>
              <p
                className={`text-lg font-bold mt-0.5 ${
                  isToday(d) ? "text-teal-600" : "text-stone-900"
                }`}
              >
                {d.getDate()}
              </p>
            </div>
          ))}
        </div>

        {/* Time rows */}
        <div className="grid grid-cols-[72px_repeat(7,1fr)] relative" style={{ minHeight: "840px" }}>
          {/* Time labels */}
          <div className="border-r border-stone-200">
            {HOURS.map((slot) => (
              <div
                key={slot.time}
                className="h-10 flex items-start justify-end pr-2 -mt-2"
              >
                {slot.min === "00" && (
                  <span className="text-[10px] text-stone-500 font-medium">
                    {slot.label}
                  </span>
                )}
              </div>
            ))}
          </div>

          {/* Day columns */}
          {weekDates.map((d) => {
            const key = formatDateKey(d);
            const dayAppts = dayMap[key] || [];
            return (
              <div
                key={key}
                className={`relative border-r border-stone-200 last:border-r-0 ${
                  isToday(d) ? "bg-[#FAFBFF]" : ""
                }`}
              >
                {/* Grid lines */}
                {HOURS.map((slot) => (
                  <div
                    key={slot.time}
                    className="h-10 border-b border-stone-100"
                  />
                ))}

                {/* Appointment blocks */}
                {dayAppts.map((appt) => {
                  const top = timeToSlot(appt.startTime) * 40;
                  const height = slotSpan(appt.startTime, appt.endTime) * 40 - 2;
                  const color = TYPE_COLORS[appt.type] || "#A3AED0";
                  const bg = TYPE_BG[appt.type] || "rgba(163,174,208,0.10)";
                  return (
                    <button
                      key={appt.id}
                      onClick={() => onSelectAppointment(appt)}
                      className="absolute left-1 right-1 rounded-lg px-2 py-1 overflow-hidden text-left transition-all hover:opacity-90 cursor-pointer"
                      style={{
                        top: `${top}px`,
                        height: `${height}px`,
                        backgroundColor: bg,
                        borderLeft: `3px solid ${color}`,
                      }}
                    >
                      <p
                        className="text-[10px] font-bold truncate"
                        style={{ color }}
                      >
                        {aptName(appt)}
                      </p>
                      <p className="text-[9px] text-stone-500 truncate">
                        {appt.startTime} - {appt.endTime}
                      </p>
                      {height >= 58 && (
                        <p className="text-[9px] text-stone-500 truncate">
                          {aptDoctor(appt)}
                        </p>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 flex-wrap">
        {Object.entries(TYPE_COLORS).map(([type, color]) => (
          <div key={type} className="flex items-center gap-1.5">
            <span
              className="w-3 h-3 rounded-sm"
              style={{ backgroundColor: color }}
            />
            <span className="text-xs text-stone-500">
              {appointmentTypeLabels[type] || type}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
