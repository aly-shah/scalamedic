"use client";

import { cn } from "@/lib/utils";

interface CardProps {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
  padding?: "none" | "sm" | "md" | "lg";
  "data-id"?: string;
  onClick?: () => void;
}

const paddingStyles = {
  none: "",
  sm: "p-4 sm:p-5",
  md: "p-5 sm:p-6",
  lg: "p-6 sm:p-7",
};

export function Card({ children, className, hover, padding = "none", onClick, ...props }: CardProps) {
  return (
    <div
      className={cn(
        "bg-white rounded-2xl border border-stone-100 shadow-sm",
        paddingStyles[padding],
        hover && "card-hover cursor-pointer",
        onClick && "cursor-pointer",
        className
      )}
      onClick={onClick}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({ children, className, ...props }: { children: React.ReactNode; className?: string; "data-id"?: string }) {
  return (
    <div className={cn("px-5 sm:px-6 py-4 border-b border-stone-100", className)} {...props}>
      {children}
    </div>
  );
}

export function CardContent({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("px-5 sm:px-6 py-4 sm:py-5", className)}>{children}</div>;
}

export function CardFooter({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("px-5 sm:px-6 py-4 border-t border-stone-100", className)}>{children}</div>;
}
