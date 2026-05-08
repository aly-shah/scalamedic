"use client";

import { cn } from "@/lib/utils";

export function LoadingSpinner({ size = "md", className }: { size?: "sm" | "md" | "lg"; className?: string }) {
  const sizes = { sm: "w-4 h-4 border-2", md: "w-8 h-8 border-3", lg: "w-12 h-12 border-4" };
  return <div className={cn("border-teal-500 border-t-transparent rounded-full animate-spin", sizes[size], className)} />;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("bg-stone-100 rounded-xl animate-pulse", className)} />;
}
