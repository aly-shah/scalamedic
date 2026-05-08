"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface TabsContextType { activeTab: string; setActiveTab: (tab: string) => void; }
const TabsContext = createContext<TabsContextType>({ activeTab: "", setActiveTab: () => {} });

export function Tabs({ defaultValue, value, children, className, onChange }: {
  defaultValue?: string; value?: string; children: ReactNode; className?: string; onChange?: (value: string) => void;
}) {
  const [internalTab, setInternalTab] = useState(defaultValue || "");
  // Controlled if `value` is provided, uncontrolled otherwise
  const activeTab = value !== undefined ? value : internalTab;
  const handleChange = (tab: string) => {
    if (value === undefined) setInternalTab(tab);
    onChange?.(tab);
  };
  return (
    <TabsContext.Provider value={{ activeTab, setActiveTab: handleChange }}>
      <div className={cn("flex flex-col", className)}>{children}</div>
    </TabsContext.Provider>
  );
}

export function TabsList({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn(
      "flex items-center gap-1 p-1 bg-stone-100 rounded-xl tabs-scroll",
      "w-full",
      className
    )}>
      {children}
    </div>
  );
}

export function TabsTrigger({ value, children, className, "data-id": dataId }: {
  value: string; children: ReactNode; className?: string; "data-id"?: string;
}) {
  const { activeTab, setActiveTab } = useContext(TabsContext);
  const isActive = activeTab === value;
  return (
    <button data-id={dataId} onClick={() => setActiveTab(value)}
      className={cn(
        "px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium whitespace-nowrap transition-all rounded-lg cursor-pointer shrink-0",
        isActive ? "bg-white text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-700 hover:bg-white/50",
        className
      )}
    >{children}</button>
  );
}

export function TabsContent({ value, children, className }: { value: string; children: ReactNode; className?: string; }) {
  const { activeTab } = useContext(TabsContext);
  if (activeTab !== value) return null;
  return <div className={cn("pt-4 sm:pt-5 animate-fade-in", className)}>{children}</div>;
}
