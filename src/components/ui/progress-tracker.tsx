"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface Step {
  id: string;
  label: string;
  status: "completed" | "current" | "pending";
}

interface ProgressTrackerProps {
  steps: Step[];
  className?: string;
  "data-id"?: string;
}

export function ProgressTracker({ steps, className, ...props }: ProgressTrackerProps) {
  return (
    <div className={cn("flex items-center w-full", className)} {...props}>
      {steps.map((step, index) => (
        <div key={step.id} className="flex items-center flex-1 last:flex-none">
          <div className="flex flex-col items-center gap-2">
            <div
              data-id={step.id}
              className={cn(
                "w-9 h-9 rounded-full flex items-center justify-center text-xs font-semibold transition-all",
                step.status === "completed" && "bg-emerald-500 text-white shadow-sm shadow-emerald-200",
                step.status === "current" && "bg-teal-500 text-white shadow-md shadow-teal-200 animate-pulse-dot",
                step.status === "pending" && "bg-stone-100 text-stone-400"
              )}
            >
              {step.status === "completed" ? <Check className="w-4 h-4" /> : index + 1}
            </div>
            <span className={cn(
              "text-[11px] font-medium whitespace-nowrap",
              step.status === "completed" && "text-emerald-600",
              step.status === "current" && "text-teal-600",
              step.status === "pending" && "text-stone-400"
            )}>
              {step.label}
            </span>
          </div>
          {index < steps.length - 1 && (
            <div className={cn(
              "flex-1 h-0.5 mx-3 mt-[-20px] rounded-full",
              step.status === "completed" ? "bg-emerald-400" : "bg-stone-200"
            )} />
          )}
        </div>
      ))}
    </div>
  );
}
