"use client";

import { cn } from "@/lib/utils";

export interface BadgeProps {
  variant?: "success" | "warning" | "danger" | "info" | "default" | "primary" | "purple";
  children: React.ReactNode;
  className?: string;
  dot?: boolean;
  "data-id"?: string;
}

const variantStyles = {
  success: "bg-emerald-50 text-emerald-700 ring-emerald-600/10",
  warning: "bg-amber-50 text-amber-700 ring-amber-600/10",
  danger: "bg-red-50 text-red-700 ring-red-600/10",
  info: "bg-sky-50 text-sky-700 ring-sky-600/10",
  default: "bg-stone-100 text-stone-600 ring-stone-500/10",
  primary: "bg-teal-50 text-teal-700 ring-teal-600/10",
  purple: "bg-indigo-50 text-indigo-700 ring-indigo-600/10",
};

const dotColors = {
  success: "bg-emerald-500",
  warning: "bg-amber-500",
  danger: "bg-red-500",
  info: "bg-sky-500",
  default: "bg-stone-400",
  primary: "bg-teal-500",
  purple: "bg-indigo-500",
};

export function Badge({ variant = "default", children, className, dot, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap ring-1 ring-inset",
        variantStyles[variant],
        className
      )}
      {...props}
    >
      {dot && <span className={cn("w-1.5 h-1.5 rounded-full", dotColors[variant])} />}
      {children}
    </span>
  );
}
