"use client";

import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

interface CheckboxProps {
  checked?: boolean;
  onChange?: (checked: boolean) => void;
  label?: string;
  className?: string;
  disabled?: boolean;
}

export function Checkbox({ checked, onChange, label, className, disabled }: CheckboxProps) {
  return (
    <label className={cn("flex items-center gap-2.5 cursor-pointer select-none", disabled && "opacity-40 cursor-not-allowed", className)}>
      <div
        onClick={() => !disabled && onChange?.(!checked)}
        className={cn(
          "w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all",
          checked ? "bg-teal-500 border-teal-500" : "border-stone-300 hover:border-teal-400"
        )}
      >
        {checked && <Check className="w-3.5 h-3.5 text-white" />}
      </div>
      {label && <span className="text-sm text-stone-700">{label}</span>}
    </label>
  );
}
