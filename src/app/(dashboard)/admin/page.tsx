"use client";

import Link from "next/link";
import { useModuleAccess } from "@/modules/core/hooks";
import {
  Users,
  Building2,
  CalendarClock,
  Stethoscope,
  Package,
  FileBarChart,
  ShieldCheck,
  Settings,
  History,
  Gauge,
} from "lucide-react";
import { Card, StatCard } from "@/components/ui";
import { useStaff, useBranches, usePatients } from "@/hooks/use-queries";

type Tile = {
  title: string;
  description: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
};

const tiles: Tile[] = [
  {
    title: "Team",
    description: "Add doctors, receptionists, call-center agents · reset passwords",
    href: "/admin/users",
    icon: Users,
    color: "bg-teal-50 text-teal-600",
  },
  {
    title: "Branches",
    description: "Clinic locations and their settings",
    href: "/admin/branches",
    icon: Building2,
    color: "bg-indigo-50 text-indigo-600",
  },
  {
    title: "Schedules",
    description: "Doctor working hours and availability",
    href: "/admin/schedules",
    icon: CalendarClock,
    color: "bg-amber-50 text-amber-600",
  },
  {
    title: "Treatments",
    description: "Service catalog, durations, default prices",
    href: "/admin/treatments",
    icon: Stethoscope,
    color: "bg-rose-50 text-rose-600",
  },
  {
    title: "Packages",
    description: "Bundled treatments and discounted offers",
    href: "/admin/packages",
    icon: Package,
    color: "bg-purple-50 text-purple-600",
  },
  {
    title: "Reports",
    description: "Revenue, appointments, conversions",
    href: "/admin/reports",
    icon: FileBarChart,
    color: "bg-emerald-50 text-emerald-600",
  },
  {
    title: "Roles & Permissions",
    description: "Module access matrix per role",
    href: "/admin/roles",
    icon: ShieldCheck,
    color: "bg-stone-100 text-stone-600",
  },
  {
    title: "System Settings",
    description: "Tax rate, defaults, integrations",
    href: "/admin/settings",
    icon: Settings,
    color: "bg-blue-50 text-blue-600",
  },
  {
    title: "Audit Log",
    description: "Every privileged action, who did it and when",
    href: "/admin/audit",
    icon: History,
    color: "bg-orange-50 text-orange-600",
  },
];

export default function AdminHomePage() {
  const access = useModuleAccess("MOD-ADMIN");

  // Lightweight stats for the hero strip — same hooks the other pages
  // already use so React Query's cache is warm when the user clicks
  // through to /admin/users, /admin/branches, /patients.
  const { data: staffRes } = useStaff();
  const staff = (staffRes?.data || []) as Array<{ isActive?: boolean }>;
  const { data: branchesRes } = useBranches();
  const branches = (branchesRes?.data || []) as Array<{ isActive?: boolean }>;
  const { data: patientsRes } = usePatients();
  const patients = (patientsRes?.data || []) as Array<{ isActive?: boolean }>;

  if (!access.canView) {
    return (
      <div className="flex items-center justify-center py-20 text-stone-500">
        You don&apos;t have access to this module.
      </div>
    );
  }

  const activeStaff = staff.filter((s) => s.isActive !== false).length;
  const activeBranches = branches.filter((b) => b.isActive !== false).length;
  const activePatients = patients.filter((p) => p.isActive !== false).length;

  return (
    <div className="space-y-5 sm:space-y-6 animate-fade-in" data-id="ADMIN-HOME">
      {/* ===== HERO ===== */}
      <div className="relative overflow-hidden rounded-2xl border border-stone-100 bg-gradient-to-br from-slate-700 via-slate-800 to-stone-900 px-5 py-5 sm:px-7 sm:py-6 text-white">
        <div className="absolute inset-0 opacity-25 [background:radial-gradient(circle_at_30%_30%,#fff_0,transparent_45%)]" />
        <div className="relative flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <Gauge className="w-4 h-4" />
              <span className="text-[11px] uppercase tracking-wider font-semibold opacity-90">Administration</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-semibold leading-tight">Run the clinic.</h1>
            <p className="text-sm opacity-90 mt-1 max-w-xl">
              Staff, branches, schedules, catalog, billing settings, audit trail — all in one place.
            </p>
          </div>
        </div>
      </div>

      {/* ===== KPI STRIP ===== */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        <StatCard label="Active staff" value={activeStaff} icon={<Users className="w-5 h-5" />} color="primary" />
        <StatCard label="Active branches" value={activeBranches} icon={<Building2 className="w-5 h-5" />} color="info" />
        <StatCard label="Active patients" value={activePatients} icon={<Users className="w-5 h-5" />} color="success" />
      </div>

      {/* ===== TILES ===== */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        {tiles.map((t) => {
          const Icon = t.icon;
          return (
            <Link key={t.href} href={t.href} className="block group">
              <Card hover padding="lg" className="h-full transition-all group-hover:border-teal-200">
                <div className="flex items-start gap-3">
                  <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${t.color}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-stone-800 group-hover:text-teal-700">{t.title}</p>
                    <p className="text-xs text-stone-500 mt-1">{t.description}</p>
                  </div>
                </div>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
