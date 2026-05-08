"use client";

import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown } from "lucide-react";
import type { ReactNode } from "react";

interface StatCardProps {
  label: string;
  value: string | number;
  icon: ReactNode;
  trend?: number;
  trendLabel?: string;
  color?: "primary" | "success" | "warning" | "danger" | "info" | "purple";
  className?: string;
  "data-id"?: string;
}

const iconBgColors = {
  primary: "bg-teal-50 text-teal-600",
  success: "bg-emerald-50 text-emerald-600",
  warning: "bg-amber-50 text-amber-600",
  danger: "bg-red-50 text-red-600",
  info: "bg-sky-50 text-sky-600",
  purple: "bg-indigo-50 text-indigo-600",
};

export function StatCard({ label, value, icon, trend, trendLabel, color = "primary", className, ...props }: StatCardProps) {
  return (
    <div className={cn(
      "bg-white rounded-2xl border border-stone-100 shadow-sm animate-fade-in",
      "p-5 sm:p-6",
      className
    )} {...props}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1 min-w-0">
          <p className="text-xs sm:text-sm text-stone-500 truncate">{label}</p>
          <p className="text-xl sm:text-2xl font-semibold text-stone-900 tracking-tight">{value}</p>
          {trend !== undefined && (
            <div className="flex items-center gap-1 mt-0.5 flex-wrap">
              {trend >= 0 ? <TrendingUp className="w-3.5 h-3.5 text-emerald-500 shrink-0" /> : <TrendingDown className="w-3.5 h-3.5 text-red-500 shrink-0" />}
              <span className={cn("text-xs font-medium", trend >= 0 ? "text-emerald-600" : "text-red-600")}>{trend > 0 ? "+" : ""}{trend}%</span>
              {trendLabel && <span className="text-xs text-stone-400 hidden sm:inline">{trendLabel}</span>}
            </div>
          )}
        </div>
        <div className={cn("w-10 h-10 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center shrink-0", iconBgColors[color])}>{icon}</div>
      </div>
    </div>
  );
}
