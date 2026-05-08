"use client";

import { cn } from "@/lib/utils";
import { LoadingSpinner } from "@/components/ui/loading";
import type { ReactNode } from "react";

interface SectionCardProps {
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
  badge?: ReactNode;
  children: ReactNode;
  loading?: boolean;
  empty?: boolean;
  emptyMessage?: string;
  emptyAction?: ReactNode;
  dense?: boolean;
  className?: string;
  "data-id"?: string;
}

export function SectionCard({
  title, subtitle, actions, badge, children,
  loading, empty, emptyMessage, emptyAction,
  dense, className, ...props
}: SectionCardProps) {
  return (
    <div
      className={cn(
        "bg-white border border-stone-100 animate-fade-in",
        "rounded-[var(--radius-card)] shadow-[var(--shadow-surface-1)]",
        className
      )}
      {...props}
    >
      {/* Header */}
      {(title || actions) && (
        <div className={cn(
          "flex items-center justify-between",
          dense ? "px-4 py-3" : "px-5 py-4",
          "border-b border-stone-50"
        )}>
          <div className="flex items-center gap-2 min-w-0">
            {title && <h3 className="text-[length:var(--text-card-title)] font-semibold text-stone-900">{title}</h3>}
            {badge}
            {subtitle && <span className="text-[length:var(--text-helper)] text-stone-400 hidden sm:inline">{subtitle}</span>}
          </div>
          {actions && <div className="flex items-center gap-1.5 shrink-0">{actions}</div>}
        </div>
      )}

      {/* Body */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <LoadingSpinner size="md" />
        </div>
      ) : empty ? (
        <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
          <p className="text-sm text-stone-400">{emptyMessage || "No data found"}</p>
          {emptyAction && <div className="mt-3">{emptyAction}</div>}
        </div>
      ) : (
        <div className={cn(dense ? "p-4" : "p-5")}>
          {children}
        </div>
      )}
    </div>
  );
}
