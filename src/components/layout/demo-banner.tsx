"use client";

/**
 * Demo workspace banner. Renders only when tenant.isDemo === true.
 * Sits above the topbar on every authenticated page so a prospect
 * exploring the demo never forgets they're in a sandbox.
 *
 * SUPER_ADMIN sees an extra "Reset demo data" button that calls
 * /api/admin/demo/reset and reloads on success.
 */
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { Sparkles, RefreshCw } from "lucide-react";

export function DemoBanner() {
  const { user } = useAuth();
  const [isDemo, setIsDemo] = useState<boolean | null>(null);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    fetch("/api/tenant/current")
      .then((r) => r.json())
      .then((d) => { if (d?.success && d?.data) setIsDemo(!!d.data.isDemo); })
      .catch(() => setIsDemo(false));
  }, []);

  if (!isDemo) return null;

  const isSuperAdmin = user?.role === "SUPER_ADMIN";

  async function handleReset() {
    if (!confirm("Wipe all demo patients, appointments and invoices, and regenerate fresh sample data?")) return;
    setResetting(true);
    try {
      const res = await fetch("/api/admin/demo/reset", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const d = await res.json();
      if (d?.success) {
        alert("Demo data refreshed. Reloading.");
        window.location.reload();
      } else {
        alert(d?.error || "Reset failed");
      }
    } catch {
      alert("Reset failed");
    } finally {
      setResetting(false);
    }
  }

  return (
    <div className="bg-gradient-to-r from-amber-50 via-amber-100 to-amber-50 border-b border-amber-200 text-amber-900 text-sm flex items-center gap-2 px-4 sm:px-5 lg:px-6 py-2">
      <Sparkles className="w-4 h-4 shrink-0 text-amber-700" />
      <span className="font-medium">Demo workspace</span>
      <span className="text-amber-800/80 hidden sm:inline">— this data is fictional and resets on demand. Anything you change here is throwaway.</span>
      <span className="ml-auto flex items-center gap-2">
        {isSuperAdmin && (
          <button
            onClick={handleReset}
            disabled={resetting}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-200/70 hover:bg-amber-200 text-amber-900 text-xs font-medium disabled:opacity-60 cursor-pointer"
            title="Wipe and regenerate demo data"
          >
            <RefreshCw className={"w-3.5 h-3.5" + (resetting ? " animate-spin" : "")} />
            {resetting ? "Resetting…" : "Reset demo"}
          </button>
        )}
      </span>
    </div>
  );
}
