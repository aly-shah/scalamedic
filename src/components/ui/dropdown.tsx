"use client";

import { useState, useRef, useEffect, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface DropdownMenuItem {
  label: string;
  icon?: ReactNode;
  onClick?: () => void;
  danger?: boolean;
  divider?: boolean;
  "data-id"?: string;
}

interface DropdownMenuProps {
  trigger: ReactNode;
  items: DropdownMenuItem[];
  align?: "left" | "right";
  className?: string;
}

export function DropdownMenu({ trigger, items, align = "right", className }: DropdownMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div ref={ref} className={cn("relative inline-block", className)}>
      <div onClick={() => setIsOpen(!isOpen)} className="cursor-pointer">{trigger}</div>
      {isOpen && (
        <div className={cn(
          "absolute z-50 mt-2 min-w-[180px] bg-white rounded-xl shadow-lg border border-stone-100 py-1.5 animate-fade-in",
          align === "right" ? "right-0" : "left-0"
        )}>
          {items.map((item, i) => (
            item.divider ? (
              <div key={i} className="my-1.5 border-t border-stone-100" />
            ) : (
              <button
                key={i}
                data-id={item["data-id"]}
                onClick={() => { item.onClick?.(); setIsOpen(false); }}
                className={cn(
                  "w-full flex items-center gap-2.5 px-3.5 py-2 text-sm transition-colors cursor-pointer rounded-lg mx-1",
                  item.danger ? "text-red-600 hover:bg-red-50" : "text-stone-700 hover:bg-stone-50"
                )}
                style={{ width: "calc(100% - 8px)" }}
              >
                {item.icon}
                {item.label}
              </button>
            )
          ))}
        </div>
      )}
    </div>
  );
}
