"use client";

import { cn, getInitials } from "@/lib/utils";

interface AvatarProps {
  src?: string;
  name: string;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}

const sizeStyles = {
  sm: "w-8 h-8 text-xs",
  md: "w-10 h-10 text-sm",
  lg: "w-12 h-12 text-base",
  xl: "w-16 h-16 text-lg",
};

const bgColors = [
  "bg-teal-100 text-teal-700",
  "bg-indigo-100 text-indigo-700",
  "bg-amber-100 text-amber-700",
  "bg-rose-100 text-rose-700",
  "bg-sky-100 text-sky-700",
  "bg-emerald-100 text-emerald-700",
  "bg-violet-100 text-violet-700",
];

function getColorFromName(name: string): string {
  const safeName = name || "?";
  let hash = 0;
  for (let i = 0; i < safeName.length; i++) hash = safeName.charCodeAt(i) + ((hash << 5) - hash);
  return bgColors[Math.abs(hash) % bgColors.length];
}

export function Avatar({ src, name = "?", size = "md", className }: AvatarProps) {
  if (src) {
    return <img src={src} alt={name} className={cn("rounded-full object-cover ring-2 ring-white", sizeStyles[size], className)} />;
  }
  return (
    <div className={cn("rounded-full flex items-center justify-center font-semibold ring-2 ring-white", sizeStyles[size], getColorFromName(name), className)}>
      {getInitials(name)}
    </div>
  );
}
