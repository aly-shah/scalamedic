"use client";

import { useState, useEffect } from "react";
import { Bell, Search, ChevronDown, Sun, CheckCheck, Users, Calendar, Stethoscope, X } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu } from "@/components/ui/dropdown";
import { useAuth } from "@/lib/auth-context";
import { api } from "@/lib/api";
import { useMarkNotificationsRead, usePatients } from "@/hooks/use-queries";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import type { Patient } from "@/types";

export function Topbar() {
  const router = useRouter();
  const [showNotifications, setShowNotifications] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [notifications, setNotifications] = useState<{ id: string; title: string; message: string; isRead: boolean }[]>([]);
  const { user, logout } = useAuth();
  const markRead = useMarkNotificationsRead();

  // Global search
  const { data: searchRes } = usePatients(searchQuery.length >= 2 ? { search: searchQuery, limit: "6" } : undefined);
  const searchResults = searchQuery.length >= 2 ? ((searchRes?.data || []) as Patient[]).slice(0, 6) : [];

  // Keyboard shortcut: press "/" to open search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "/" && !e.ctrlKey && !e.metaKey && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") {
        e.preventDefault();
        setShowSearch(true);
      }
      if (e.key === "Escape") setShowSearch(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
  const unreadCount = notifications.filter((n) => !n.isRead).length;
  const displayName = user?.name?.split(" ")[1] || user?.name?.split(" ")[0] || "there";
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  useEffect(() => {
    api.notifications.list().then((res) => {
      const data = res.data as Record<string, unknown>;
      if (res.success && Array.isArray(data)) setNotifications(data as typeof notifications);
      else if (res.success && Array.isArray((data)?.notifications)) setNotifications((data).notifications as typeof notifications);
    }).catch(() => {});
  }, []);

  return (
    <header className="h-16 bg-white/90 backdrop-blur-md border-b border-stone-100/80 flex items-center justify-between px-4 sm:px-5 lg:px-6 sticky top-0 z-30">
      {/* Left — Greeting (hidden on mobile to save space) */}
      <div className="hidden sm:flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center shrink-0">
          <Sun className="w-4 h-4 text-amber-500" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-stone-800 truncate">{greeting}, <span className="text-teal-700">{displayName}</span></p>
          <p className="text-xs text-stone-400 hidden lg:block">Here&apos;s your clinic overview today</p>
        </div>
      </div>
      {/* Mobile: just brand */}
      <p className="sm:hidden text-sm font-semibold text-stone-800 pl-12">MediCore</p>

      {/* Right */}
      <div className="flex items-center gap-1.5 sm:gap-2">
        {/* Search */}
        <button onClick={() => setShowSearch(true)} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-stone-50 hover:bg-stone-100 text-stone-400 text-sm transition-colors cursor-pointer border border-stone-100">
          <Search className="w-4 h-4" />
          <span className="hidden md:inline">Search...</span>
          <kbd className="hidden lg:inline-flex h-5 items-center gap-1 rounded border border-stone-200 bg-white px-1.5 text-[10px] font-medium text-stone-400">/</kbd>
        </button>

        {/* Notifications */}
        <div className="relative">
          <button onClick={() => setShowNotifications(!showNotifications)}
            className="w-10 h-10 rounded-xl bg-stone-50 hover:bg-stone-100 flex items-center justify-center text-stone-500 transition-colors relative cursor-pointer border border-stone-100"
            data-id="APP-NOTIFICATIONS"
          >
            <Bell className="w-[18px] h-[18px]" />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center ring-2 ring-white">{unreadCount}</span>
            )}
          </button>
          {showNotifications && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowNotifications(false)} />
              <div className="absolute right-0 top-12 w-[min(320px,calc(100vw-32px))] bg-white rounded-2xl shadow-lg border border-stone-100 z-50 max-h-[70vh] overflow-hidden animate-fade-in">
                <div className="px-4 py-3 border-b border-stone-100 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-stone-800">Notifications</h3>
                  <div className="flex items-center gap-2">
                    {unreadCount > 0 && (
                      <button
                        className="flex items-center gap-1 text-xs text-teal-600 hover:text-teal-700 cursor-pointer font-medium"
                        onClick={() => {
                          const unreadIds = notifications.filter((n) => !n.isRead).map((n) => n.id);
                          markRead.mutate(unreadIds, {
                            onSuccess: () => setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true }))),
                          });
                        }}
                      >
                        <CheckCheck className="w-3.5 h-3.5" />
                        Mark All Read
                      </button>
                    )}
                    <Badge variant="danger">{unreadCount} new</Badge>
                  </div>
                </div>
                <div className="overflow-y-auto max-h-[calc(70vh-52px)]">
                  {notifications.slice(0, 6).map((notif) => (
                    <div
                      key={notif.id}
                      className={`px-4 py-3 border-b border-stone-50 hover:bg-stone-50 cursor-pointer transition-colors ${!notif.isRead ? "bg-teal-50/30" : ""}`}
                      onClick={() => {
                        if (!notif.isRead) {
                          markRead.mutate([notif.id], {
                            onSuccess: () => setNotifications((prev) => prev.map((n) => n.id === notif.id ? { ...n, isRead: true } : n)),
                          });
                        }
                      }}
                    >
                      <div className="flex items-start gap-2.5">
                        {!notif.isRead && <span className="w-2 h-2 rounded-full bg-teal-500 mt-1.5 shrink-0" />}
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-stone-800 truncate">{notif.title}</p>
                          <p className="text-xs text-stone-500 mt-0.5 line-clamp-2">{notif.message}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        {/* User */}
        <DropdownMenu
          trigger={
            <div className="flex items-center gap-2 pl-1 sm:pl-2 cursor-pointer">
              <Avatar name={user?.name || "User"} size="md" />
              <div className="hidden lg:block text-left min-w-0">
                <p className="text-sm font-medium text-stone-800 truncate">{user?.name || "User"}</p>
                <p className="text-xs text-stone-400">{user?.role || ""}</p>
              </div>
              <ChevronDown className="w-4 h-4 text-stone-400 hidden lg:block" />
            </div>
          }
          items={[
            { label: "My Profile", onClick: () => {} },
            { label: "Preferences", onClick: () => {} },
            { divider: true, label: "" },
            { label: "Log Out", danger: true, onClick: () => { logout(); window.location.href = "/login"; } },
          ]}
        />
      </div>

      {/* Global Search Modal */}
      {showSearch && (
        <>
          <div className="fixed inset-0 z-50 bg-stone-900/30 backdrop-blur-sm" onClick={() => setShowSearch(false)} />
          <div className="fixed top-[15vh] left-1/2 -translate-x-1/2 z-50 w-[min(520px,calc(100vw-2rem))] bg-white rounded-2xl shadow-2xl border border-stone-200 overflow-hidden animate-fade-in">
            {/* Search Input */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-stone-100">
              <Search className="w-5 h-5 text-stone-400 shrink-0" />
              <input
                autoFocus
                type="text"
                placeholder="Search patients, pages..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1 text-sm text-stone-900 bg-transparent outline-none placeholder:text-stone-400"
              />
              <button onClick={() => setShowSearch(false)} className="p-1 rounded-lg hover:bg-stone-100 text-stone-400 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Results */}
            <div className="max-h-[50vh] overflow-y-auto">
              {/* Patient results */}
              {searchResults.length > 0 && (
                <div className="p-2">
                  <p className="text-[10px] font-semibold text-stone-400 uppercase tracking-wider px-2 py-1">Patients</p>
                  {searchResults.map((p) => (
                    <button key={p.id} onClick={() => { router.push(`/patients/${p.id}`); setShowSearch(false); setSearchQuery(""); }}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-stone-50 transition-colors text-left cursor-pointer">
                      <Avatar name={`${p.firstName} ${p.lastName}`} size="sm" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-stone-900">{p.firstName} {p.lastName}</p>
                        <p className="text-xs text-stone-400">{p.patientCode} &middot; {p.phone}</p>
                      </div>
                      <ChevronDown className="w-3.5 h-3.5 text-stone-300 -rotate-90" />
                    </button>
                  ))}
                </div>
              )}

              {/* Quick navigation */}
              {searchQuery.length < 2 && (
                <div className="p-2">
                  <p className="text-[10px] font-semibold text-stone-400 uppercase tracking-wider px-2 py-1">Quick Navigation</p>
                  {[
                    { label: "Patients", href: "/patients", icon: <Users className="w-4 h-4 text-teal-500" /> },
                    { label: "Appointments", href: "/appointments", icon: <Calendar className="w-4 h-4 text-blue-500" /> },
                    { label: "Calendar", href: "/calendar", icon: <Calendar className="w-4 h-4 text-violet-500" /> },
                    { label: "Consultation", href: "/consultation", icon: <Stethoscope className="w-4 h-4 text-emerald-500" /> },
                  ].map((nav) => (
                    <button key={nav.href} onClick={() => { router.push(nav.href); setShowSearch(false); }}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-stone-50 transition-colors text-left cursor-pointer">
                      {nav.icon}
                      <span className="text-sm text-stone-700">{nav.label}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* No results */}
              {searchQuery.length >= 2 && searchResults.length === 0 && (
                <div className="py-8 text-center text-sm text-stone-400">No patients found</div>
              )}
            </div>

            {/* Footer hint */}
            <div className="px-4 py-2 border-t border-stone-100 flex items-center justify-between text-[10px] text-stone-400">
              <span>Press <kbd className="px-1 py-0.5 rounded border border-stone-200 bg-stone-50 font-mono">ESC</kbd> to close</span>
              <span>Press <kbd className="px-1 py-0.5 rounded border border-stone-200 bg-stone-50 font-mono">/</kbd> to search</span>
            </div>
          </div>
        </>
      )}
    </header>
  );
}
