"use client";

import Link from "next/link";
import { useModuleAccess } from "@/modules/core/hooks";
import { Calendar, Clock, ArrowLeft } from "lucide-react";
import { Card, Badge, Avatar } from "@/components/ui";
import { useStaff } from "@/hooks/use-queries";
import { UserRole } from "@/types";
import type { User } from "@/types";

const weekDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// TODO: Replace with real API data once doctor schedule CRUD endpoints exist.
// Currently hardcoded mock data — no schedule API is available yet.
const scheduleData: Record<string, Record<string, { start: string; end: string } | null>> = {
  "usr-002": {
    Mon: { start: "09:00", end: "17:00" },
    Tue: { start: "09:00", end: "17:00" },
    Wed: { start: "09:00", end: "13:00" },
    Thu: { start: "09:00", end: "17:00" },
    Fri: { start: "09:00", end: "17:00" },
    Sat: null,
  },
  "usr-003": {
    Mon: { start: "08:00", end: "16:00" },
    Tue: { start: "08:00", end: "16:00" },
    Wed: { start: "08:00", end: "16:00" },
    Thu: null,
    Fri: { start: "08:00", end: "16:00" },
    Sat: { start: "09:00", end: "13:00" },
  },
  "usr-004": {
    Mon: { start: "10:00", end: "18:00" },
    Tue: { start: "10:00", end: "18:00" },
    Wed: null,
    Thu: { start: "10:00", end: "18:00" },
    Fri: { start: "10:00", end: "18:00" },
    Sat: null,
  },
  "usr-009": {
    Mon: null,
    Tue: { start: "09:00", end: "17:00" },
    Wed: { start: "09:00", end: "17:00" },
    Thu: { start: "09:00", end: "17:00" },
    Fri: null,
    Sat: { start: "09:00", end: "14:00" },
  },
};

export default function SchedulesPage() {
  const access = useModuleAccess("MOD-STAFF");
  const { data: staffResponse, isLoading } = useStaff();
  const users = (staffResponse?.data || []) as User[];
  const doctors = users.filter((u) => u.role === UserRole.DOCTOR);

  if (!access.canView) {
    return (
      <div className="flex items-center justify-center py-20 text-stone-500">
        You don&apos;t have access to this module.
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-stone-500">
        Loading schedules...
      </div>
    );
  }

  return (
    <div className="space-y-5 sm:space-y-6 animate-fade-in" data-id="ADMIN-SCHEDULES">
      {/* ===== HERO ===== */}
      <div className="relative overflow-hidden rounded-2xl border border-stone-100 bg-gradient-to-br from-amber-500 via-orange-500 to-rose-500 px-5 py-5 sm:px-7 sm:py-6 text-white">
        <div className="absolute inset-0 opacity-25 [background:radial-gradient(circle_at_30%_30%,#fff_0,transparent_45%)]" />
        <div className="relative flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <Link href="/admin" className="inline-flex items-center gap-1 text-[11px] uppercase tracking-wider font-semibold opacity-90 hover:opacity-100">
                <ArrowLeft className="w-3 h-3" /> Admin
              </Link>
              <span className="opacity-60">/</span>
              <span className="text-[11px] uppercase tracking-wider font-semibold opacity-90">Schedules</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-semibold leading-tight">Doctor working hours.</h1>
            <p className="text-sm opacity-90 mt-1 max-w-xl">Weekly availability at a glance — who&apos;s on which day.</p>
          </div>
        </div>
      </div>

      {/* Schedule Grid */}
      <div className="space-y-3 sm:space-y-4">
        {doctors.map((doctor) => {
          const schedule = scheduleData[doctor.id] || {};
          return (
            <Card key={doctor.id} padding="lg" className="animate-fade-in">
              <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                {/* Doctor Info */}
                <div className="flex items-center gap-3 lg:w-56 shrink-0 min-w-0">
                  <Avatar name={doctor.name} src={doctor.avatar ?? undefined} size="md" />
                  <div className="min-w-0">
                    <p className="font-semibold text-stone-800 text-sm truncate">{doctor.name}</p>
                    <p className="text-xs text-stone-400 truncate">{doctor.branchName}</p>
                  </div>
                </div>

                {/* Day Grid */}
                <div className="overflow-x-auto flex-1">
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 min-w-[280px]">
                  {weekDays.map((day) => {
                    const slot = schedule[day];
                    return (
                      <div
                        key={day}
                        className={`rounded-2xl p-3 text-center transition-all ${
                          slot
                            ? "bg-teal-50 border border-teal-100"
                            : "bg-stone-50 border border-stone-100"
                        }`}
                      >
                        <p className={`text-xs font-semibold mb-1 ${slot ? "text-teal-700" : "text-stone-400"}`}>
                          {day}
                        </p>
                        {slot ? (
                          <div className="flex items-center justify-center gap-1 text-xs text-teal-600">
                            <Clock className="w-3 h-3" />
                            <span>{slot.start}-{slot.end}</span>
                          </div>
                        ) : (
                          <p className="text-xs text-stone-400">Off</p>
                        )}
                      </div>
                    );
                  })}
                </div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
