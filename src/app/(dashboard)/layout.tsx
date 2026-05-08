"use client";

import { useState, useEffect } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { MobileNav } from "@/components/layout/mobile-nav";
import { DemoBanner } from "@/components/layout/demo-banner";
import { ModuleProvider } from "@/modules/core/provider";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [sidebarW, setSidebarW] = useState(264);

  useEffect(() => {
    const onResize = () => {
      const w = window.innerWidth;
      setSidebarW(w < 768 ? 0 : w < 1024 ? 80 : 264);
    };
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return (
    <ModuleProvider>
      <div className="min-h-screen bg-[#FAFAF9]">
        <Sidebar />
        <div className="content-transition" style={{ marginLeft: sidebarW }}>
          <DemoBanner />
          <Topbar />
          <main className="px-4 sm:px-5 lg:px-6 py-5 sm:py-6 pb-20 md:pb-6 max-w-[var(--content-max)] mx-auto">
            {children}
          </main>
          <MobileNav />
        </div>
      </div>
    </ModuleProvider>
  );
}
