"use client";

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "success" | "outline" | "soft";
  size?: "sm" | "md" | "lg";
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
  loading?: boolean;
  "data-id"?: string;
}

const variantStyles = {
  primary: "bg-teal-600 text-white hover:bg-teal-700 shadow-sm active:scale-[0.98]",
  secondary: "bg-stone-100 text-stone-700 hover:bg-stone-200 active:scale-[0.98]",
  ghost: "bg-transparent text-stone-600 hover:bg-stone-100",
  danger: "bg-red-50 text-red-600 hover:bg-red-100 active:scale-[0.98]",
  success: "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 active:scale-[0.98]",
  outline: "bg-white text-stone-700 border border-stone-200 hover:bg-stone-50 hover:border-stone-300",
  soft: "bg-teal-50 text-teal-700 hover:bg-teal-100 active:scale-[0.98]",
};

const sizeStyles = {
  sm: "px-3 py-1.5 text-xs gap-1.5 rounded-lg",
  md: "px-4 py-2.5 text-sm gap-2 rounded-xl",
  lg: "px-6 py-3 text-base gap-2 rounded-xl",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", iconLeft, iconRight, loading, children, disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none cursor-pointer select-none",
          variantStyles[variant],
          sizeStyles[size],
          className
        )}
        disabled={disabled || loading}
        {...props}
      >
        {loading && (
          <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
        )}
        {!loading && iconLeft}
        {children}
        {!loading && iconRight}
      </button>
    );
  }
);

Button.displayName = "Button";
