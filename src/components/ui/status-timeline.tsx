"use client";

import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

interface TimelineItem {
  id: string;
  title: string;
  description?: string;
  time: string;
  icon?: ReactNode;
  status?: "completed" | "current" | "pending";
}

interface StatusTimelineProps {
  items: TimelineItem[];
  className?: string;
}

export function StatusTimeline({ items, className }: StatusTimelineProps) {
  return (
    <div className={cn("space-y-0", className)}>
      {items.map((item, index) => (
        <div key={item.id} className="flex gap-3">
          <div className="flex flex-col items-center">
            <div className={cn(
              "w-3 h-3 rounded-full mt-1.5 ring-4",
              item.status === "completed" && "bg-emerald-500 ring-emerald-50",
              item.status === "current" && "bg-teal-500 ring-teal-50",
              (!item.status || item.status === "pending") && "bg-stone-200 ring-stone-50"
            )} />
            {index < items.length - 1 && <div className="w-px flex-1 bg-stone-200 min-h-[32px]" />}
          </div>
          <div className="pb-4">
            <p className="text-sm font-medium text-stone-800">{item.title}</p>
            {item.description && <p className="text-xs text-stone-500 mt-0.5">{item.description}</p>}
            <p className="text-xs text-stone-400 mt-0.5">{item.time}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
