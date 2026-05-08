"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  LayoutDashboard, Users, Calendar, Stethoscope, Receipt,
  Phone, HeartPulse, DoorOpen,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";

const roleNavItems: Record<string, { label: string; href: string; icon: React.ReactNode }[]> = {
  ADMIN: [
    { label: "Home", href: "/dashboard", icon: <LayoutDashboard className="w-5 h-5" /> },
    { label: "Patients", href: "/patients", icon: <Users className="w-5 h-5" /> },
    { label: "Calendar", href: "/calendar", icon: <Calendar className="w-5 h-5" /> },
    { label: "Billing", href: "/billing", icon: <Receipt className="w-5 h-5" /> },
  ],
  SUPER_ADMIN: [
    { label: "Home", href: "/dashboard", icon: <LayoutDashboard className="w-5 h-5" /> },
    { label: "Patients", href: "/patients", icon: <Users className="w-5 h-5" /> },
    { label: "Calendar", href: "/calendar", icon: <Calendar className="w-5 h-5" /> },
    { label: "Billing", href: "/billing", icon: <Receipt className="w-5 h-5" /> },
  ],
  DOCTOR: [
    { label: "My Day", href: "/dashboard", icon: <LayoutDashboard className="w-5 h-5" /> },
    { label: "Consult", href: "/consultation", icon: <Stethoscope className="w-5 h-5" /> },
    { label: "Calendar", href: "/calendar", icon: <Calendar className="w-5 h-5" /> },
    { label: "Patients", href: "/patients", icon: <Users className="w-5 h-5" /> },
  ],
  RECEPTIONIST: [
    { label: "Home", href: "/dashboard", icon: <LayoutDashboard className="w-5 h-5" /> },
    { label: "Patients", href: "/patients", icon: <Users className="w-5 h-5" /> },
    { label: "Check-In", href: "/appointments/check-in", icon: <HeartPulse className="w-5 h-5" /> },
    { label: "Rooms", href: "/rooms", icon: <DoorOpen className="w-5 h-5" /> },
  ],
  BILLING: [
    { label: "Home", href: "/dashboard", icon: <LayoutDashboard className="w-5 h-5" /> },
    { label: "Billing", href: "/billing", icon: <Receipt className="w-5 h-5" /> },
  ],
  CALL_CENTER: [
    { label: "Home", href: "/dashboard", icon: <LayoutDashboard className="w-5 h-5" /> },
    { label: "Leads", href: "/call-center", icon: <Phone className="w-5 h-5" /> },
    { label: "Calendar", href: "/calendar", icon: <Calendar className="w-5 h-5" /> },
  ],
  ASSISTANT: [
    { label: "Home", href: "/dashboard", icon: <LayoutDashboard className="w-5 h-5" /> },
    { label: "Patients", href: "/patients", icon: <Users className="w-5 h-5" /> },
    { label: "Vitals", href: "/vitals", icon: <HeartPulse className="w-5 h-5" /> },
    { label: "Rooms", href: "/rooms", icon: <DoorOpen className="w-5 h-5" /> },
  ],
};

export function MobileNav() {
  const pathname = usePathname();
  const { user } = useAuth();
  const role = user?.role || "ADMIN";
  const items = roleNavItems[role] || roleNavItems.ADMIN;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 md:hidden bg-white/95 backdrop-blur-md border-t border-stone-200/80 safe-area-bottom">
      <div className="flex items-center justify-around px-2 py-1.5">
        {items.map((item) => {
          const isActive = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));
          return (
            <Link key={item.href} href={item.href}
              className={cn(
                "flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl min-w-[56px] transition-all",
                isActive ? "text-teal-600" : "text-stone-400"
              )}>
              {item.icon}
              <span className="text-[10px] font-medium">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
