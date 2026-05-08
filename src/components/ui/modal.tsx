"use client";

import { useEffect, useRef, useCallback, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  "data-id"?: string;
}

const sizeStyles = {
  sm: "max-w-[min(28rem,calc(100vw-2rem))]",
  md: "max-w-[min(32rem,calc(100vw-2rem))]",
  lg: "max-w-[min(42rem,calc(100vw-2rem))]",
  xl: "max-w-[min(56rem,calc(100vw-2rem))]",
};

const FOCUSABLE = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Modal({ isOpen, onClose, title, subtitle, children, footer, size = "md", ...props }: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const trapFocus = useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape") { onClose(); return; }
    if (e.key !== "Tab") return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const focusable = dialog.querySelectorAll<HTMLElement>(FOCUSABLE);
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey) {
      if (document.activeElement === first) { e.preventDefault(); last.focus(); }
    } else {
      if (document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }, [onClose]);

  useEffect(() => {
    if (isOpen) {
      previousFocusRef.current = document.activeElement as HTMLElement;
      document.body.style.overflow = "hidden";
      document.addEventListener("keydown", trapFocus);
      // Focus the dialog after render
      requestAnimationFrame(() => {
        const dialog = dialogRef.current;
        if (dialog) {
          const firstFocusable = dialog.querySelector<HTMLElement>(FOCUSABLE);
          (firstFocusable || dialog).focus();
        }
      });
    } else {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", trapFocus);
      previousFocusRef.current?.focus();
    }
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", trapFocus);
    };
  }, [isOpen, trapFocus]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="fixed inset-0 modal-overlay" onClick={onClose} aria-hidden="true" />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title || "Dialog"}
        tabIndex={-1}
        className={cn(
          "relative w-full bg-white z-10 animate-slide-up flex flex-col",
          "rounded-t-2xl sm:rounded-2xl",
          "max-h-[90vh] sm:max-h-[85vh]",
          "shadow-xl outline-none",
          sizeStyles[size]
        )}
        {...props}
      >
        {title && (
          <div className="flex items-start justify-between px-5 sm:px-6 py-4 sm:py-5 border-b border-stone-100 shrink-0">
            <div className="min-w-0 pr-4">
              <h2 id="modal-title" className="text-lg font-semibold text-stone-900 truncate">{title}</h2>
              {subtitle && <p className="text-sm text-stone-500 mt-0.5">{subtitle}</p>}
            </div>
            <button
              onClick={onClose}
              aria-label="Close dialog"
              className="p-1.5 rounded-lg hover:bg-stone-100 text-stone-400 hover:text-stone-600 transition-colors cursor-pointer shrink-0 -mt-0.5"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        )}
        <div className="px-5 sm:px-6 py-4 sm:py-5 overflow-y-auto flex-1">{children}</div>
        {footer && (
          <div className="px-5 sm:px-6 py-3 sm:py-4 border-t border-stone-100 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2 sm:gap-3 bg-stone-50/50 rounded-b-2xl shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
