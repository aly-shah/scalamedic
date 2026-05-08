/**
 * Clinic-wide working hours / days, sourced from the SystemSetting
 * key/value store written by /admin/settings → Appointments.
 *
 * The calendar (and anything else that needs "is the clinic open at
 * time T?") should call getClinicHours() rather than baking 8:00-18:00
 * + Mon-Sat into the code. Falls back to those defaults if the rows
 * aren't set yet (fresh install).
 */
import { prisma } from "@/lib/prisma";

const DEFAULTS = {
  opensAt: "08:00",
  closesAt: "18:00",
  // Sunday off matches what most Pakistani skin clinics actually do —
  // and matches the WorkingDaysSetting default in /admin/settings.
  workingDays: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
};

const SHORT_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export type ClinicHours = {
  opensAt: string;        // "HH:MM"
  closesAt: string;       // "HH:MM"
  opensAtMin: number;     // minutes since midnight
  closesAtMin: number;
  workingDays: string[];  // ["Mon", "Tue", …]
  isWorkingDay: (date: Date) => boolean;
};

function timeToMin(time: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!m) return Number.NaN;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

export async function getClinicHours(): Promise<ClinicHours> {
  const rows = await prisma.systemSetting.findMany({
    where: { key: { in: ["opens_at", "closes_at", "working_days"] } },
    select: { key: true, value: true },
  });
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));

  // Time-of-day fallback: if the stored value is malformed, drop it and
  // use the default — calendar should still render.
  const opensAt = (() => {
    const v = map.opens_at;
    if (!v) return DEFAULTS.opensAt;
    return Number.isFinite(timeToMin(v)) ? v : DEFAULTS.opensAt;
  })();
  const closesAt = (() => {
    const v = map.closes_at;
    if (!v) return DEFAULTS.closesAt;
    return Number.isFinite(timeToMin(v)) ? v : DEFAULTS.closesAt;
  })();

  const workingDays = (() => {
    const v = map.working_days;
    if (!v) return DEFAULTS.workingDays;
    const list = v.split(",").map((d) => d.trim()).filter(Boolean);
    // Reject obviously bad values rather than render an "always closed"
    // calendar that hides every slot.
    if (list.length === 0) return DEFAULTS.workingDays;
    return list;
  })();

  const opensAtMin = timeToMin(opensAt);
  const closesAtMin = timeToMin(closesAt);

  return {
    opensAt,
    closesAt,
    opensAtMin,
    closesAtMin,
    workingDays,
    isWorkingDay: (date: Date) => workingDays.includes(SHORT_DAYS[date.getDay()]),
  };
}
