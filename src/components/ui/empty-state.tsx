"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center py-16 px-4 text-center", className)}>
      {icon && <div className="w-16 h-16 rounded-2xl bg-stone-100 flex items-center justify-center text-stone-400 mb-4">{icon}</div>}
      <h3 className="text-base font-semibold text-stone-800 mb-1">{title}</h3>
      {description && <p className="text-sm text-stone-500 max-w-sm mb-5">{description}</p>}
      {action}
    </div>
  );
}
