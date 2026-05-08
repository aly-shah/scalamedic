"use client";

import { useState, useCallback, useRef } from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface SearchInputProps {
  placeholder?: string;
  value?: string;
  onChange?: (value: string) => void;
  className?: string;
  debounceMs?: number;
  "data-id"?: string;
}

export function SearchInput({ placeholder = "Search...", value: controlledValue, onChange, className, debounceMs = 300, ...props }: SearchInputProps) {
  const [value, setValue] = useState(controlledValue || "");
  const [prevControlled, setPrevControlled] = useState(controlledValue);
  if (controlledValue !== prevControlled) {
    setPrevControlled(controlledValue);
    if (controlledValue !== undefined) setValue(controlledValue);
  }

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const debouncedOnChange = useCallback(
    (val: string) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => onChange?.(val), debounceMs);
    },
    [onChange, debounceMs]
  );

  const handleChange = (val: string) => {
    setValue(val);
    debouncedOnChange(val);
  };

  return (
    <div className={cn("relative", className)} {...props}>
      <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
      <input
        type="text"
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        placeholder={placeholder}
        className="w-full pl-10 pr-9 py-2.5 text-sm bg-white border border-stone-200 rounded-xl text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all"
      />
      {value && (
        <button onClick={() => handleChange("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 cursor-pointer">
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
