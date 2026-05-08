"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { useModuleNavigation } from "@/modules/core/hooks";
import { useModuleContext } from "@/modules/core/provider";
import type { ModuleId } from "@/modules/core/types";
import {
  LayoutDashboard, Users, Calendar, CreditCard, Phone, UserCog,
  Stethoscope, Building2, Package, Brain, Settings,
  LogOut, ChevronLeft, Menu, DoorOpen,
  FlaskConical, HeartPulse, Receipt, PhoneCall, Clock, Activity,
  Sparkles, X, Bell, Camera, FileText, Shield, ShieldCheck, ListX, Pill, Star,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

// Map module icon names to components
const iconMap: Record<string, LucideIcon> = {
  LayoutDashboard, Users, Calendar, CreditCard, Phone, UserCog,
  Stethoscope, Building2, Package, Brain, Settings,
  DoorOpen, FlaskConical, HeartPulse, Receipt, PhoneCall,
  Clock, Activity, Sparkles, Bell, Camera, FileText, Shield, ShieldCheck, ListX, Pill, Star,
  CalendarClock: Clock,
};

// Role-specific label overrides for dashboard
const dashboardLabels: Record<string, string> = {
  DOCTOR: "My Day",
  RECEPTIONIST: "Front Desk",
  BILLING: "Billing",
  CALL_CENTER: "Workspace",
  ASSISTANT: "Tasks",
};

// Group modules into nav sections per role
interface NavSection {
  section?: string;
  moduleIds: ModuleId[];
}

const roleNavLayout: Record<string, NavSection[]> = {
  ADMIN: [
    { moduleIds: ["MOD-DASHBOARD", "MOD-PATIENT", "MOD-APPOINTMENT"] },
    { section: "Clinic", moduleIds: ["MOD-CONSULTATION", "MOD-BILLING", "MOD-ROOMS", "MOD-COMMUNICATION"] },
    { section: "Tools", moduleIds: ["MOD-AI-TRANSCRIPTION", "MOD-FOLLOWUP"] },
    { section: "Settings", moduleIds: ["MOD-STAFF", "MOD-PROCEDURE", "MOD-BRANCH", "MOD-ADMIN"] },
  ],
  SUPER_ADMIN: [
    { moduleIds: ["MOD-DASHBOARD", "MOD-PATIENT", "MOD-APPOINTMENT"] },
    { section: "Clinic", moduleIds: ["MOD-CONSULTATION", "MOD-BILLING", "MOD-ROOMS", "MOD-COMMUNICATION"] },
    { section: "Tools", moduleIds: ["MOD-AI-TRANSCRIPTION", "MOD-FOLLOWUP"] },
    { section: "Settings", moduleIds: ["MOD-STAFF", "MOD-PROCEDURE", "MOD-BRANCH", "MOD-ADMIN"] },
  ],
  DOCTOR: [
    { moduleIds: ["MOD-DASHBOARD", "MOD-PATIENT", "MOD-APPOINTMENT", "MOD-CONSULTATION", "MOD-AI-TRANSCRIPTION", "MOD-FOLLOWUP"] },
  ],
  RECEPTIONIST: [
    { moduleIds: ["MOD-DASHBOARD", "MOD-PATIENT", "MOD-APPOINTMENT", "MOD-ROOMS", "MOD-BILLING"] },
  ],
  BILLING: [
    { moduleIds: ["MOD-DASHBOARD", "MOD-BILLING"] },
  ],
  CALL_CENTER: [
    { moduleIds: ["MOD-DASHBOARD", "MOD-COMMUNICATION", "MOD-APPOINTMENT"] },
  ],
  ASSISTANT: [
    { moduleIds: ["MOD-DASHBOARD", "MOD-PATIENT", "MOD-APPOINTMENT", "MOD-ROOMS"] },
  ],
};

// Extra non-module routes (vitals, check-in, lab-results, packages)
const extraRoutes: Record<string, { label: string; href: string; icon: string; afterModule: ModuleId; roles: string[] }[]> = {
  "/calendar": [{ label: "Calendar", href: "/calendar", icon: "Calendar", afterModule: "MOD-APPOINTMENT", roles: ["ADMIN", "SUPER_ADMIN", "DOCTOR", "RECEPTIONIST", "ASSISTANT"] }],
  "/vitals": [{ label: "Vitals", href: "/vitals", icon: "HeartPulse", afterModule: "MOD-PATIENT", roles: ["ASSISTANT"] }],
  "/appointments/check-in": [{ label: "Check-In", href: "/appointments/check-in", icon: "HeartPulse", afterModule: "MOD-APPOINTMENT", roles: ["RECEPTIONIST"] }],
  "/lab-results": [{ label: "Lab Results", href: "/lab-results", icon: "FlaskConical", afterModule: "MOD-FOLLOWUP", roles: ["ADMIN", "SUPER_ADMIN", "DOCTOR"] }],
  "/admin/packages": [{ label: "Packages", href: "/admin/packages", icon: "Package", afterModule: "MOD-PROCEDURE", roles: ["ADMIN", "SUPER_ADMIN", "BILLING"] }],
  "/pharmacy": [{ label: "Pharmacy", href: "/pharmacy", icon: "Pill", afterModule: "MOD-BILLING", roles: ["ADMIN", "SUPER_ADMIN", "BILLING"] }],
  "/billing/claims": [{ label: "Claims", href: "/billing/claims", icon: "ShieldCheck", afterModule: "MOD-BILLING", roles: ["ADMIN", "SUPER_ADMIN", "BILLING"] }],
  "/admin/payers": [{ label: "Payers", href: "/admin/payers", icon: "ShieldCheck", afterModule: "MOD-BILLING", roles: ["ADMIN", "SUPER_ADMIN"] }],
  "/admin/denial-reasons": [{ label: "Denial codes", href: "/admin/denial-reasons", icon: "ListX", afterModule: "MOD-BILLING", roles: ["ADMIN", "SUPER_ADMIN"] }],
  // Combined inbox: patient reviews (receipt QR) + booking requests
  // and contact messages submitted on the public drnakhodas.com site.
  // Top-level so admins see it alongside the rest of the dashboard
  // rather than buried inside /admin.
  "/admin/updates": [{ label: "Updates", href: "/admin/updates", icon: "Bell", afterModule: "MOD-BILLING", roles: ["ADMIN", "SUPER_ADMIN"] }],
  "/admin/ai-suggestions": [{ label: "AI Audit", href: "/admin/ai-suggestions", icon: "Sparkles", afterModule: "MOD-AI-TRANSCRIPTION", roles: ["ADMIN", "SUPER_ADMIN"] }],
  "/admin/procedure-protocols": [{ label: "Protocols", href: "/admin/procedure-protocols", icon: "FileText", afterModule: "MOD-PROCEDURE", roles: ["ADMIN", "SUPER_ADMIN"] }],
  "/admin/error-log": [{ label: "Error Log", href: "/admin/error-log", icon: "Shield", afterModule: "MOD-ADMIN", roles: ["ADMIN", "SUPER_ADMIN"] }],
  "/admin/doctor-revenue": [{ label: "Doctor Revenue", href: "/admin/doctor-revenue", icon: "Receipt", afterModule: "MOD-BILLING", roles: ["ADMIN", "SUPER_ADMIN"] }],
  "/admin/billing": [{ label: "Plan & Billing", href: "/admin/billing", icon: "CreditCard", afterModule: "MOD-ADMIN", roles: ["ADMIN", "SUPER_ADMIN"] }],
};

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user, tenant, logout } = useAuth();
  const { ready } = useModuleContext();
  const navModules = useModuleNavigation();
  const role = user?.role || "ADMIN";

  // Updates inbox badge — polls /api/admin/updates/unread on a 60s
  // tick. Only fires for ADMIN+ since lower roles don't see the
  // entry. Returns null on the very first render (before the first
  // poll resolves) so we don't flicker an empty pip in.
  const isAdminRole = role === "ADMIN" || role === "SUPER_ADMIN";
  const [updatesUnread, setUpdatesUnread] = useState<number | null>(null);
  useEffect(() => {
    if (!isAdminRole) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const r = await fetch("/api/admin/updates/unread", { credentials: "include", cache: "no-store" });
        const d = await r.json() as { success: boolean; data?: { total: number } };
        if (!cancelled && d.success && d.data) setUpdatesUnread(d.data.total);
      } catch {
        // best-effort badge — silent failure is fine; the page still
        // works without the indicator.
      }
    };
    tick();
    const id = setInterval(tick, 60_000);
    // Refetch when the tab regains focus — staff often leave the app
    // open in a tab and come back to it.
    const onFocus = () => tick();
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, [isAdminRole]);

  // When the user navigates to /admin/updates, optimistically zero
  // the badge — the page itself will POST /seen on mount, but waiting
  // for the next 60s tick to clear the pip would feel laggy.
  useEffect(() => {
    if (pathname === "/admin/updates") setUpdatesUnread(0);
  }, [pathname]);

  // Auto-collapse on resize
  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth < 768) {
        setCollapsed(true);
        setMobileOpen(false);
      } else if (window.innerWidth < 1024) {
        setCollapsed(true);
      } else {
        setCollapsed(false);
      }
    };
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Close mobile nav on route change
  const [prevPathname, setPrevPathname] = useState(pathname);
  if (pathname !== prevPathname) {
    setPrevPathname(pathname);
    setMobileOpen(false);
  }

  const sidebarWidth = collapsed ? "w-[80px]" : "w-[264px]";

  // Build nav items from module registry
  const navLayout = roleNavLayout[role] || roleNavLayout.ADMIN;
  const moduleMap = new Map(navModules.map((m) => [m.id, m]));

  // Collect extra routes for this role
  const roleExtras = Object.values(extraRoutes)
    .flat()
    .filter((r) => r.roles.includes(role));

  const navContent = (
    <>
      {/* Brand — tenant-driven. Logo is read from useAuth().tenant
          when available; falls back to the first letter of the
          tenant's shortName in a gradient tile while the brand
          loads (or for unbranded platform deployments). */}
      <div className={cn("flex items-center gap-3 h-16 border-b border-stone-100 shrink-0", collapsed ? "justify-center px-2" : "px-5")}>
        {tenant?.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={tenant.logoUrl}
            alt={tenant.shortName ?? tenant.name ?? ""}
            className="w-9 h-9 rounded-xl object-contain shrink-0 bg-white"
          />
        ) : (
          <div className="w-9 h-9 rounded-xl gradient-warm flex items-center justify-center shrink-0 shadow-sm">
            <span className="text-base font-bold text-white">
              {(tenant?.shortName ?? tenant?.name ?? "S").charAt(0).toUpperCase()}
            </span>
          </div>
        )}
        {!collapsed && (
          <div className="min-w-0">
            <h1 className="text-base font-bold text-stone-900 leading-tight truncate">
              {tenant?.shortName ?? tenant?.name ?? "ScalaMedic"}
            </h1>
            <p className="text-[10px] text-stone-400 font-medium">Clinic Management</p>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
        {ready && navLayout.map((group, gi) => (
          <div key={gi} className="mb-1">
            {group.section && !collapsed && (
              <p className="px-3 py-2 mt-3 first:mt-0 text-[10px] font-semibold text-stone-400 uppercase tracking-widest">{group.section}</p>
            )}
            {group.section && collapsed && <div className="my-2 mx-2 border-t border-stone-100" />}

            {group.moduleIds.map((modId) => {
              const mod = moduleMap.get(modId);
              if (!mod || !mod.route) return null;

              const Icon = iconMap[mod.icon] || LayoutDashboard;
              const label = modId === "MOD-DASHBOARD"
                ? (dashboardLabels[role] || mod.navLabel || mod.name)
                : (mod.navLabel || mod.name);
              const isActive = pathname === mod.route || (mod.route !== "/dashboard" && pathname.startsWith(mod.route));

              return (
                <div key={modId}>
                  <Link
                    href={mod.route}
                    data-id={modId}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all",
                      isActive ? "bg-teal-50/80 text-teal-700 font-semibold" : "text-stone-500 hover:bg-stone-50 hover:text-stone-700",
                      collapsed && "justify-center px-2"
                    )}
                    title={collapsed ? label : undefined}
                  >
                    <Icon className={cn("w-5 h-5 shrink-0", isActive && "text-teal-600")} />
                    {!collapsed && <span className="truncate">{label}</span>}
                  </Link>

                  {/* Insert extra routes that go after this module */}
                  {roleExtras
                    .filter((r) => r.afterModule === modId)
                    .map((extra) => {
                      const ExIcon = iconMap[extra.icon] || LayoutDashboard;
                      const exActive = pathname === extra.href;
                      // Only the Updates entry gets a polling badge
                      // today; other extras are static.
                      const showUpdatesBadge =
                        extra.href === "/admin/updates" && updatesUnread !== null && updatesUnread > 0;
                      return (
                        <Link
                          key={extra.href}
                          href={extra.href}
                          className={cn(
                            "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all relative",
                            exActive ? "bg-teal-50 text-teal-700" : "text-stone-500 hover:bg-stone-50 hover:text-stone-700",
                            collapsed && "justify-center px-2"
                          )}
                          title={collapsed ? extra.label : undefined}
                        >
                          <span className="relative shrink-0">
                            <ExIcon className={cn("w-5 h-5 shrink-0", exActive && "text-teal-600")} />
                            {showUpdatesBadge && collapsed && (
                              <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-red-500 ring-2 ring-white" />
                            )}
                          </span>
                          {!collapsed && (
                            <>
                              <span className="truncate flex-1">{extra.label}</span>
                              {showUpdatesBadge && (
                                <span className="bg-red-500 text-white text-[10px] font-semibold px-1.5 py-0.5 rounded-full min-w-[20px] text-center">
                                  {updatesUnread! > 99 ? "99+" : updatesUnread}
                                </span>
                              )}
                            </>
                          )}
                        </Link>
                      );
                    })}
                </div>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Bottom */}
      <div className="border-t border-stone-100 px-2 py-2 space-y-0.5 shrink-0">
        <Link href="/settings" className={cn("flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-stone-500 hover:bg-stone-50 hover:text-stone-700 transition-all", collapsed && "justify-center px-2")}>
          <Settings className="w-5 h-5 shrink-0" />{!collapsed && <span>Settings</span>}
        </Link>
        <button onClick={() => { logout(); window.location.href = "/login"; }} className={cn("flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-stone-500 hover:bg-red-50 hover:text-red-600 transition-all w-full cursor-pointer", collapsed && "justify-center px-2")}>
          <LogOut className="w-5 h-5 shrink-0" />{!collapsed && <span>Log Out</span>}
        </button>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile menu button */}
      <button
        onClick={() => setMobileOpen(true)}
        className="fixed top-4 left-4 z-50 md:hidden w-10 h-10 bg-white rounded-xl border border-stone-200 shadow-sm flex items-center justify-center text-stone-600 cursor-pointer"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="sidebar-overlay md:hidden" onClick={() => setMobileOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={cn(
        "fixed top-0 h-screen bg-white border-r border-stone-100 flex flex-col z-40 sidebar-transition",
        "max-md:w-[260px]",
        mobileOpen ? "max-md:left-0" : "max-md:-left-[260px]",
        "md:left-0",
        sidebarWidth
      )}>
        {mobileOpen && (
          <button onClick={() => setMobileOpen(false)} className="absolute top-4 right-3 md:hidden w-8 h-8 rounded-lg hover:bg-stone-100 flex items-center justify-center text-stone-400 cursor-pointer z-10">
            <X className="w-4 h-4" />
          </button>
        )}
        {navContent}
      </aside>

      {/* Desktop collapse toggle */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className={cn(
          "fixed top-20 z-50 w-6 h-6 bg-white rounded-full border border-stone-200 shadow-sm items-center justify-center text-stone-400 hover:text-stone-600 hover:bg-stone-50 transition-all cursor-pointer hidden md:flex",
          collapsed ? "left-[77px]" : "left-[261px]"
        )}
      >
        <ChevronLeft className={cn("w-3.5 h-3.5 transition-transform", collapsed && "rotate-180")} />
      </button>
    </>
  );
}

export function useSidebarWidth() {
  const [width, setWidth] = useState(240);
  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth < 768) setWidth(0);
      else if (window.innerWidth < 1024) setWidth(72);
      else setWidth(240);
    };
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return width;
}
