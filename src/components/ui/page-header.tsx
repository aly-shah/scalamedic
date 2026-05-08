"use client";

import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";
import type { ReactNode } from "react";

interface Breadcrumb {
  label: string;
  href?: string;
}

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  breadcrumbs?: Breadcrumb[];
  actions?: ReactNode;
  filters?: ReactNode;
  tabs?: ReactNode;
  className?: string;
}

export function PageHeader({ title, subtitle, breadcrumbs, actions, filters, tabs, className }: PageHeaderProps) {
  return (
    <div className={cn("space-y-3", className)}>
      {/* Breadcrumbs */}
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav className="flex items-center gap-1 text-xs text-stone-400">
          {breadcrumbs.map((crumb, i) => (
            <span key={i} className="flex items-center gap-1">
              {i > 0 && <ChevronRight className="w-3 h-3" />}
              {crumb.href ? (
                <Link href={crumb.href} className="hover:text-stone-600 transition-colors">{crumb.label}</Link>
              ) : (
                <span className="text-stone-600">{crumb.label}</span>
              )}
            </span>
          ))}
        </nav>
      )}

      {/* Title + Actions */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-[length:var(--text-page-title)] font-bold text-stone-900 leading-tight">{title}</h1>
          {subtitle && <p className="text-[length:var(--text-helper)] text-stone-400 mt-0.5">{subtitle}</p>}
        </div>
        {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
      </div>

      {/* Filters */}
      {filters && <div>{filters}</div>}

      {/* Tabs */}
      {tabs && <div>{tabs}</div>}
    </div>
  );
}
