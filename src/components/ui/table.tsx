"use client";

import { cn } from "@/lib/utils";

export function Table({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className="table-responsive rounded-xl border border-stone-100">
      <table className={cn("w-full text-sm min-w-[600px]", className)}>{children}</table>
    </div>
  );
}

export function TableHeader({ children, className }: { children: React.ReactNode; className?: string }) {
  return <thead className={cn("", className)}>{children}</thead>;
}

export function TableBody({ children, className }: { children: React.ReactNode; className?: string }) {
  return <tbody className={cn("divide-y divide-stone-100", className)}>{children}</tbody>;
}

export function TableRow({ children, className, onClick }: { children: React.ReactNode; className?: string; onClick?: () => void }) {
  return (
    <tr className={cn("hover:bg-stone-50/50 transition-colors", onClick && "cursor-pointer", className)} onClick={onClick}>
      {children}
    </tr>
  );
}

export function TableHead({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th className={cn("px-3 sm:px-4 py-3 text-left text-xs font-medium text-stone-500 uppercase tracking-wider bg-stone-50/50 first:rounded-tl-xl last:rounded-tr-xl whitespace-nowrap", className)}>
      {children}
    </th>
  );
}

export function TableCell({ children, className, colSpan }: { children: React.ReactNode; className?: string; colSpan?: number }) {
  return <td colSpan={colSpan} className={cn("px-3 sm:px-4 py-3 text-sm text-stone-700", className)}>{children}</td>;
}
