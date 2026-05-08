"use client";

import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface SlidePanelProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  width?: "sm" | "md" | "lg" | "xl";
  "data-id"?: string;
}

const widthStyles = {
  sm: "w-full sm:w-[380px]",
  md: "w-full sm:w-[440px] lg:w-[480px]",
  lg: "w-full sm:w-[520px] lg:w-[560px]",
  xl: "w-full sm:w-[600px] lg:w-[640px]",
};

export function SlidePanel({ isOpen, onClose, title, subtitle, children, footer, width = "lg", ...props }: SlidePanelProps) {
  useEffect(() => {
    if (isOpen) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => { document.body.style.overflow = ""; };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-40 bg-stone-900/25 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className={cn(
          "fixed inset-y-0 right-0 z-50 bg-white shadow-2xl flex flex-col",
          "animate-in slide-in-from-right duration-300 ease-out",
          widthStyles[width]
        )}
        {...props}
      >
        {/* Header */}
        {title && (
          <div className="flex items-start justify-between px-5 sm:px-6 py-4 sm:py-5 border-b border-stone-100 shrink-0">
            <div className="min-w-0 pr-4">
              <h2 className="text-lg font-semibold text-stone-900">{title}</h2>
              {subtitle && <p className="text-sm text-stone-500 mt-0.5">{subtitle}</p>}
            </div>
            <button
              onClick={onClose}
              className="w-9 h-9 rounded-xl bg-stone-100 hover:bg-stone-200 flex items-center justify-center text-stone-500 transition-colors cursor-pointer shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-4 sm:py-5">
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="px-5 sm:px-6 py-4 border-t border-stone-100 flex items-center justify-end gap-3 bg-stone-50/50 shrink-0">
            {footer}
          </div>
        )}
      </div>
    </>
  );
}
