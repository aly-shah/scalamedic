"use client";

import { useState } from "react";
import {
  Phone, PhoneCall, PhoneIncoming, PhoneOutgoing, PhoneMissed,
  Calendar, TrendingUp, UserPlus, Search, MessageSquare,
  User, CalendarClock,
} from "lucide-react";
import { StatCard } from "@/components/ui/stat-card";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { SearchInput } from "@/components/ui/search-input";
import { SlidePanel } from "@/components/ui/slide-panel";
import { useDashboardStats, useLeads, useCreateCallLog } from "@/hooks/use-queries";
import { useModuleStore } from "@/modules/core/store";
import { useAuth } from "@/lib/auth-context";
import { useQuery } from "@tanstack/react-query";
import { AddPatientModal } from "@/components/patients/add-patient-modal";
import { CreateAppointmentModal } from "@/components/appointments/create-appointment-modal";
import { cn, formatDate } from "@/lib/utils";
import Link from "next/link";

export function CallCenterDashboard() {
  const { activities } = useModuleStore();
  const { user } = useAuth();
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  const { data: statsData } = useDashboardStats("callcenter");
  const stats = (statsData?.data as Record<string, unknown>) || {};

  // Live incoming call polling
  const { data: liveCallData } = useQuery({
    queryKey: ["calls", "incoming", user?.id],
    queryFn: () => fetch(`/api/calls/incoming?agentId=${user?.id}`).then((r) => r.json()),
    refetchInterval: 3000, enabled: !!user?.id,
  });
  const liveCall = liveCallData?.data as { phone: string; state: string; matchResult?: Record<string, unknown>; contactName?: string | null; direction?: "INBOUND" | "OUTBOUND" } | null;

  // Recent calls
  const { data: recentCallsData } = useQuery({
    queryKey: ["calls", "recent"],
    queryFn: () => fetch("/api/calls/recent?limit=10").then((r) => r.json()),
    refetchInterval: 15000,
  });
  const recentCalls = (recentCallsData?.data || []) as Record<string, unknown>[];

  // Callbacks
  const { data: leadsData } = useLeads({ status: "FOLLOW_UP" });
  const callbacks = ((leadsData?.data || []) as Record<string, unknown>[]).filter((l) => l.callbackDate);

  // Search
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResult, setSearchResult] = useState<Record<string, unknown> | null>(null);
  const [searching, setSearching] = useState(false);

  // Modals
  const [showAddPatient, setShowAddPatient] = useState(false);
  const [showBookAppt, setShowBookAppt] = useState(false);
  const [showCallNote, setShowCallNote] = useState(false);
  const [callNote, setCallNote] = useState("");
  const [callOutcome, setCallOutcome] = useState("");

  const createCallLog = useCreateCallLog();

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const res = await fetch(`/api/calls/match?phone=${encodeURIComponent(searchQuery.trim())}`);
      const data = await res.json();
      if (data.success) setSearchResult(data.data);
    } catch { /* */ }
    setSearching(false);
  };

  const handleLogCall = () => {
    const m = liveCall?.matchResult || searchResult;
    createCallLog.mutate({
      patientId: (m as Record<string, Record<string, unknown>>)?.patient?.id as string || undefined,
      leadId: (m as Record<string, Record<string, unknown>>)?.lead?.id as string || undefined,
      userId: user?.id, type: "INBOUND", notes: callNote, outcome: callOutcome || "INFO_PROVIDED",
    });
    setCallNote(""); setCallOutcome(""); setShowCallNote(false);
  };

  const match = liveCall?.matchResult || searchResult;
  const matchType = (match as Record<string, unknown>)?.matchType as string || "none";
  const mp = (match as Record<string, Record<string, unknown>>)?.patient;
  const ml = (match as Record<string, Record<string, unknown>>)?.lead;

  return (
    <div className="space-y-4 animate-fade-in" data-id="DASH-CALLCENTER">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-stone-900">{greeting}, {user?.name || "Agent"}</h1>
          <p className="text-sm text-stone-400 mt-0.5">Call center workspace {liveCall ? "· 📞 Live call" : ""}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={liveCall ? "success" : "default"} dot className="text-xs">{liveCall ? "On Call" : "Available"}</Badge>
          <Button size="sm" variant="outline" iconLeft={<UserPlus className="w-3.5 h-3.5" />} onClick={() => setShowAddPatient(true)}>New Patient</Button>
          <Button size="sm" iconLeft={<Calendar className="w-3.5 h-3.5" />} onClick={() => setShowBookAppt(true)}>Book</Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <StatCard label="Calls Today" value={(stats.callsToday as number) || 0} icon={<Phone className="w-5 h-5" />} color="primary" />
        <StatCard label="Booked" value={(stats.booked as number) || 0} icon={<Calendar className="w-5 h-5" />} color="success" />
        <StatCard label="Callbacks" value={callbacks.length} icon={<CalendarClock className="w-5 h-5" />} color="warning" />
        <StatCard label="Conversion" value={(stats.conversion as string) || "0%"} icon={<TrendingUp className="w-5 h-5" />} color="info" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-8 space-y-4">

          {/* Live Call Widget */}
          {liveCall && (() => {
            const isOutbound = liveCall.direction === "OUTBOUND";
            const LiveIcon = isOutbound ? PhoneOutgoing : PhoneIncoming;
            const ringing = liveCall.state === "ringing";
            const labelText = isOutbound
              ? (ringing ? "Calling Out" : "Active Call (outbound)")
              : (ringing ? "Incoming Call" : "Active Call");
            const borderCls = isOutbound
              ? "border-indigo-300 bg-indigo-50/20"
              : ringing ? "border-green-400 bg-green-50/30" : "border-teal-300 bg-teal-50/20";
            const dotCls = isOutbound
              ? (ringing ? "bg-indigo-500 animate-pulse" : "bg-indigo-500")
              : (ringing ? "bg-green-500 animate-pulse" : "bg-teal-500");
            const iconCls = isOutbound ? "bg-indigo-100 text-indigo-600" : "bg-teal-100 text-teal-600";
            return (
            <Card className={cn("border-2 animate-fade-in", borderCls)}>
              <CardContent className="p-5">
                <div className="flex items-center gap-2 mb-3">
                  <div className={cn("w-3 h-3 rounded-full", dotCls)} />
                  <span className="text-sm font-semibold">{labelText}</span>
                  <Badge variant={matchType === "patient" ? "success" : matchType === "lead" ? "info" : "warning"} className="text-[10px]">
                    {matchType === "patient" ? "Patient" : matchType === "lead" ? "Lead" : "New Caller"}
                  </Badge>
                </div>
                <div className="flex items-center gap-4">
                  <div className={cn("w-14 h-14 rounded-2xl flex items-center justify-center", iconCls)}><LiveIcon className="w-7 h-7" /></div>
                  <div className="flex-1">
                    <p className="text-lg font-bold text-stone-900">
                      {mp ? `${mp.firstName} ${mp.lastName}` : ml ? String(ml.name) : liveCall.contactName || liveCall.phone}
                    </p>
                    <p className="text-sm text-stone-500 font-mono">{liveCall.phone}</p>
                    {mp && <p className="text-xs text-stone-400">{String(mp.patientCode)}</p>}
                    {ml && <p className="text-xs text-stone-400">Lead · {String(ml.status)}</p>}
                    {!mp && !ml && liveCall.contactName && (
                      <p className="text-xs text-stone-400">Saved on device · {liveCall.contactName}</p>
                    )}
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Button size="sm" iconLeft={<MessageSquare className="w-3.5 h-3.5" />} onClick={() => setShowCallNote(true)}>Note</Button>
                    <Button size="sm" variant="outline" iconLeft={<Calendar className="w-3.5 h-3.5" />} onClick={() => setShowBookAppt(true)}>Book</Button>
                    {matchType === "none" && <Button size="sm" variant="outline" iconLeft={<UserPlus className="w-3.5 h-3.5" />} onClick={() => setShowAddPatient(true)}>Add</Button>}
                  </div>
                </div>
              </CardContent>
            </Card>
            );
          })()}

          {/* Search */}
          <Card><CardContent className="p-3"><div className="flex gap-2"><div className="flex-1"><SearchInput placeholder="Search by phone, name, or ID..." value={searchQuery} onChange={(v) => { setSearchQuery(v); if (v.length >= 3) handleSearch(); }} debounceMs={300} /></div><Button variant="outline" onClick={handleSearch} disabled={searching}><Search className="w-4 h-4" /></Button></div></CardContent></Card>

          {/* Search Result */}
          {searchResult && !liveCall && (
            <Card className="border-blue-200 bg-blue-50/20">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant={matchType === "patient" ? "success" : matchType === "lead" ? "info" : "warning"} className="text-[10px]">{matchType === "patient" ? "Patient Found" : matchType === "lead" ? "Lead Found" : "No History"}</Badge>
                  <button onClick={() => setSearchResult(null)} className="ml-auto text-xs text-stone-400 cursor-pointer">Clear</button>
                </div>
                {mp && (
                  <div className="flex items-center gap-3">
                    <Avatar name={`${mp.firstName} ${mp.lastName}`} size="md" />
                    <div className="flex-1"><p className="text-sm font-semibold">{String(mp.firstName)} {String(mp.lastName)}</p><p className="text-xs text-stone-400">{String(mp.patientCode)} · {String(mp.phone)}</p></div>
                    <Link href={`/patients/${mp.id}`}><Button size="sm" variant="outline">Profile</Button></Link>
                    <Button size="sm" onClick={() => setShowBookAppt(true)}>Book</Button>
                  </div>
                )}
                {ml && !mp && (
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-indigo-50 flex items-center justify-center"><User className="w-5 h-5 text-indigo-500" /></div>
                    <div className="flex-1"><p className="text-sm font-semibold">{String(ml.name)}</p><p className="text-xs text-stone-400">{String(ml.phone)} · {String(ml.status)}</p></div>
                    <Button size="sm" onClick={() => setShowBookAppt(true)}>Book</Button>
                  </div>
                )}
                {matchType === "none" && (
                  <div className="text-center py-3"><p className="text-sm text-stone-500 mb-2">No history found</p><div className="flex justify-center gap-2"><Button size="sm" variant="outline" onClick={() => setShowAddPatient(true)}>Add Patient</Button><Button size="sm" onClick={() => setShowBookAppt(true)}>Quick Book</Button></div></div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Recent Calls */}
          <Card>
            <CardHeader><div className="flex items-center gap-2"><PhoneCall className="w-4 h-4 text-teal-500" /><span className="text-sm font-semibold">Recent Calls</span></div></CardHeader>
            <CardContent className="p-0">
              {recentCalls.length === 0 ? <div className="py-6 text-center text-sm text-stone-400">No recent calls</div> :
                recentCalls.map((call, i) => {
                  const p = call.patient as Record<string, unknown> | null;
                  const l = call.lead as Record<string, unknown> | null;
                  const name = p
                    ? `${p.firstName} ${p.lastName}`
                    : l
                      ? String(l.name)
                      : (call.contactName as string) || "Unknown";
                  const phone = (call.phone as string) || (p?.phone as string) || (l?.phone as string) || "";
                  const isInbound = call.type === "INBOUND";
                  const missed = call.outcome === "NO_ANSWER";
                  const DirIcon = missed ? PhoneMissed : isInbound ? PhoneIncoming : PhoneOutgoing;
                  return (
                    <div key={String(call.id)} className={cn("flex items-center gap-3 px-4 py-3", i < recentCalls.length - 1 && "border-b border-stone-50")}>
                      <div
                        className={cn(
                          "w-8 h-8 rounded-lg flex items-center justify-center",
                          missed ? "bg-stone-100 text-stone-400"
                            : isInbound ? "bg-teal-50 text-teal-600"
                              : "bg-indigo-50 text-indigo-600"
                        )}
                        title={missed ? "Missed" : isInbound ? "Incoming" : "Outgoing"}
                      >
                        <DirIcon className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{name}</p>
                        <p className="text-xs text-stone-400 truncate">
                          {phone && <span className="font-mono">{phone}</span>}
                          {phone && call.createdAt ? " · " : ""}
                          {call.createdAt ? formatDate(String(call.createdAt)) : ""}
                        </p>
                      </div>
                      <Badge variant={call.outcome === "BOOKED" ? "success" : call.outcome === "NO_ANSWER" ? "default" : "info"} className="text-[9px]">{String(call.outcome || "").replace("_", " ")}</Badge>
                    </div>
                  );
                })}
            </CardContent>
          </Card>
        </div>

        {/* Right — Callbacks + Activity */}
        <div className="lg:col-span-4 space-y-4">
          <Card>
            <CardHeader><div className="flex items-center gap-2"><CalendarClock className="w-4 h-4 text-amber-500" /><span className="text-sm font-semibold">Callbacks ({callbacks.length})</span></div></CardHeader>
            <CardContent className="p-2 pt-0 space-y-1">
              {callbacks.length === 0 ? <div className="py-4 text-center text-xs text-stone-400">No pending callbacks</div> :
                callbacks.slice(0, 6).map((cb) => (
                  <div key={String(cb.id)} className="flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-stone-50">
                    <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center text-amber-500"><Phone className="w-3.5 h-3.5" /></div>
                    <div className="flex-1 min-w-0"><p className="text-xs font-medium truncate">{String(cb.name)}</p><p className="text-[10px] text-stone-400">{String(cb.phone)}</p></div>
                    <Badge variant="warning" className="text-[9px]">Due</Badge>
                  </div>
                ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><div className="flex items-center gap-2"><TrendingUp className="w-4 h-4 text-teal-500" /><span className="text-sm font-semibold">Activity</span></div></CardHeader>
            <CardContent className="p-3 pt-0">
              {activities.length > 0 ? <div className="space-y-2">{activities.slice(0, 6).map((a) => (
                <div key={a.id} className="flex items-start gap-2 text-xs text-stone-500 py-1"><span className="w-1.5 h-1.5 rounded-full bg-teal-400 mt-1.5 shrink-0" /><span>{a.message}</span></div>
              ))}</div> : <div className="py-4 text-center text-xs text-stone-400">No activity</div>}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Call Note Panel */}
      <SlidePanel isOpen={showCallNote} onClose={() => setShowCallNote(false)} title="Call Note" width="md"
        footer={<><Button variant="outline" onClick={() => setShowCallNote(false)}>Cancel</Button><Button onClick={handleLogCall} disabled={createCallLog.isPending}>{createCallLog.isPending ? "Saving..." : "Save"}</Button></>}>
        <div className="space-y-4">
          <Input label="Note" placeholder="What did the caller ask about..." value={callNote} onChange={(e) => setCallNote(e.target.value)} />
          <Select label="Outcome" value={callOutcome} onChange={(e) => setCallOutcome(e.target.value)}
            options={[{ value: "BOOKED", label: "Appointment Booked" }, { value: "CALLBACK", label: "Callback Scheduled" }, { value: "INFO_PROVIDED", label: "Info Provided" }, { value: "NOT_INTERESTED", label: "Not Interested" }, { value: "NO_ANSWER", label: "No Answer" }]} />
        </div>
      </SlidePanel>

      <AddPatientModal isOpen={showAddPatient} onClose={() => setShowAddPatient(false)} />
      <CreateAppointmentModal isOpen={showBookAppt} onClose={() => setShowBookAppt(false)} />
    </div>
  );
}
