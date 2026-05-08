"use client";

import { useState, forwardRef, type InputHTMLAttributes } from "react";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import { cn, getClinicToday, CLINIC_TZ } from "@/lib/utils";

interface DatePickerProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "onChange"> {
  label?: string;
  error?: string;
  onChange?: (e: { target: { value: string } }) => void;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}

export const DatePicker = forwardRef<HTMLInputElement, DatePickerProps>(
  ({ label, error, className, value, onChange, ...props }, ref) => {
    const [open, setOpen] = useState(false);

    const selectedDate = value ? new Date(value + "T00:00:00") : null;
    const todayStr = getClinicToday();

    const [viewYear, setViewYear] = useState(selectedDate?.getFullYear() || new Date().getFullYear());
    const [viewMonth, setViewMonth] = useState(selectedDate?.getMonth() ?? new Date().getMonth());

    const daysInMonth = getDaysInMonth(viewYear, viewMonth);
    const firstDay = getFirstDayOfMonth(viewYear, viewMonth);

    const handleSelect = (day: number) => {
      const m = (viewMonth + 1).toString().padStart(2, "0");
      const d = day.toString().padStart(2, "0");
      const dateStr = `${viewYear}-${m}-${d}`;
      onChange?.({ target: { value: dateStr } });
      setOpen(false);
    };

    const navigate = (delta: number) => {
      let newMonth = viewMonth + delta;
      let newYear = viewYear;
      if (newMonth < 0) { newMonth = 11; newYear--; }
      if (newMonth > 11) { newMonth = 0; newYear++; }
      setViewMonth(newMonth);
      setViewYear(newYear);
    };

    const goToday = () => {
      const now = new Date();
      setViewYear(now.getFullYear());
      setViewMonth(now.getMonth());
      handleSelect(now.getDate());
    };

    const displayValue = selectedDate
      ? selectedDate.toLocaleDateString("en-PK", { month: "short", day: "numeric", year: "numeric", timeZone: CLINIC_TZ })
      : "";

    return (
      <div className="flex flex-col gap-1.5 relative">
        {label && (
          <label className="text-sm font-medium text-stone-700">
            {label}
            {props.required && <span className="text-red-400 ml-0.5">*</span>}
          </label>
        )}

        {/* Hidden native input for form compatibility */}
        <input ref={ref} type="hidden" value={(value as string) || ""} {...props} />

        {/* Display button */}
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className={cn(
            "w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm bg-white border border-stone-200 rounded-xl transition-all cursor-pointer text-left",
            "hover:border-stone-300 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500",
            open && "ring-2 ring-teal-500/20 border-teal-500",
            error && "border-red-300",
            !displayValue && "text-stone-400",
            className
          )}
        >
          <Calendar className="w-4 h-4 text-stone-400 shrink-0" />
          <span className={displayValue ? "text-stone-900" : "text-stone-400"}>
            {displayValue || "Select date"}
          </span>
        </button>

        {/* Calendar dropdown */}
        {open && (
          <>
            <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
            <div className="absolute top-full left-0 z-40 mt-1.5 bg-white rounded-2xl border border-stone-200 shadow-xl p-3 w-[280px] animate-fade-in">
              {/* Month/Year header */}
              <div className="flex items-center justify-between mb-2">
                <button type="button" onClick={() => navigate(-1)} className="p-1.5 rounded-lg hover:bg-stone-100 cursor-pointer">
                  <ChevronLeft className="w-4 h-4 text-stone-500" />
                </button>
                <span className="text-sm font-semibold text-stone-900">
                  {MONTHS[viewMonth]} {viewYear}
                </span>
                <button type="button" onClick={() => navigate(1)} className="p-1.5 rounded-lg hover:bg-stone-100 cursor-pointer">
                  <ChevronRight className="w-4 h-4 text-stone-500" />
                </button>
              </div>

              {/* Day headers */}
              <div className="grid grid-cols-7 mb-1">
                {DAYS.map((d) => (
                  <div key={d} className="text-center text-[10px] font-semibold text-stone-400 uppercase py-1">
                    {d}
                  </div>
                ))}
              </div>

              {/* Day grid */}
              <div className="grid grid-cols-7 gap-0.5">
                {/* Empty cells for days before first */}
                {Array.from({ length: firstDay }, (_, i) => (
                  <div key={`empty-${i}`} className="h-8" />
                ))}
                {/* Day buttons */}
                {Array.from({ length: daysInMonth }, (_, i) => {
                  const day = i + 1;
                  const m = (viewMonth + 1).toString().padStart(2, "0");
                  const d = day.toString().padStart(2, "0");
                  const dateStr = `${viewYear}-${m}-${d}`;
                  const isSelected = (value as string) === dateStr;
                  const isToday = dateStr === todayStr;

                  return (
                    <button
                      key={day}
                      type="button"
                      onClick={() => handleSelect(day)}
                      className={cn(
                        "h-8 w-full rounded-lg text-xs font-medium transition-all cursor-pointer",
                        isSelected
                          ? "bg-teal-500 text-white shadow-sm"
                          : isToday
                            ? "bg-teal-50 text-teal-700 font-bold ring-1 ring-teal-200"
                            : "text-stone-700 hover:bg-stone-100"
                      )}
                    >
                      {day}
                    </button>
                  );
                })}
              </div>

              {/* Today shortcut */}
              <div className="mt-2 pt-2 border-t border-stone-100 flex justify-center">
                <button type="button" onClick={goToday} className="text-xs text-teal-600 font-medium hover:text-teal-700 cursor-pointer">
                  Today
                </button>
              </div>
            </div>
          </>
        )}

        {error && <p className="text-xs text-red-500">{error}</p>}
      </div>
    );
  }
);
DatePicker.displayName = "DatePicker";
