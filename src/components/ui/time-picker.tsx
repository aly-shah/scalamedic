"use client";

import { useState } from "react";
import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";

interface TimePickerProps {
  label?: string;
  value?: string;
  onChange?: (e: { target: { value: string } }) => void;
  required?: boolean;
  placeholder?: string;
  startHour?: number;
  endHour?: number;
  interval?: number; // minutes
  className?: string;
}

export function TimePicker({
  label, value, onChange, required, placeholder = "Select time",
  startHour = 8, endHour = 18, interval = 30, className,
}: TimePickerProps) {
  const [open, setOpen] = useState(false);

  // Generate time slots
  const slots: { value: string; label: string; period: string }[] = [];
  for (let h = startHour; h < endHour; h++) {
    for (let m = 0; m < 60; m += interval) {
      const timeVal = `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
      const hour12 = h % 12 || 12;
      const ampm = h < 12 ? "AM" : "PM";
      slots.push({
        value: timeVal,
        label: `${hour12}:${m.toString().padStart(2, "0")}`,
        period: ampm,
      });
    }
  }

  const selectedSlot = slots.find((s) => s.value === value);
  const displayValue = selectedSlot ? `${selectedSlot.label} ${selectedSlot.period}` : "";

  // Group by AM/PM
  const amSlots = slots.filter((s) => s.period === "AM");
  const pmSlots = slots.filter((s) => s.period === "PM");

  const handleSelect = (timeVal: string) => {
    onChange?.({ target: { value: timeVal } });
    setOpen(false);
  };

  return (
    <div className="flex flex-col gap-1.5 relative">
      {label && (
        <label className="text-sm font-medium text-stone-700">
          {label}
          {required && <span className="text-red-400 ml-0.5">*</span>}
        </label>
      )}

      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          "w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm bg-white border border-stone-200 rounded-xl transition-all cursor-pointer text-left",
          "hover:border-stone-300 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500",
          open && "ring-2 ring-teal-500/20 border-teal-500",
          className
        )}
      >
        <Clock className="w-4 h-4 text-stone-400 shrink-0" />
        <span className={displayValue ? "text-stone-900" : "text-stone-400"}>
          {displayValue || placeholder}
        </span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 z-40 mt-1.5 bg-white rounded-2xl border border-stone-200 shadow-xl w-[240px] animate-fade-in overflow-hidden">
            <div className="max-h-[280px] overflow-y-auto p-2">
              {/* AM slots */}
              {amSlots.length > 0 && (
                <div className="mb-2">
                  <p className="text-[10px] font-semibold text-stone-400 uppercase tracking-wider px-2 py-1">Morning</p>
                  <div className="grid grid-cols-3 gap-1">
                    {amSlots.map((s) => (
                      <button
                        key={s.value}
                        type="button"
                        onClick={() => handleSelect(s.value)}
                        className={cn(
                          "py-2 rounded-lg text-xs font-medium transition-all cursor-pointer",
                          value === s.value
                            ? "bg-teal-500 text-white shadow-sm"
                            : "text-stone-700 hover:bg-stone-100"
                        )}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* PM slots */}
              {pmSlots.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold text-stone-400 uppercase tracking-wider px-2 py-1">Afternoon</p>
                  <div className="grid grid-cols-3 gap-1">
                    {pmSlots.map((s) => (
                      <button
                        key={s.value}
                        type="button"
                        onClick={() => handleSelect(s.value)}
                        className={cn(
                          "py-2 rounded-lg text-xs font-medium transition-all cursor-pointer",
                          value === s.value
                            ? "bg-teal-500 text-white shadow-sm"
                            : "text-stone-700 hover:bg-stone-100"
                        )}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
