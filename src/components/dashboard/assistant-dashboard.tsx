"use client";

import {
  HeartPulse, DoorOpen, Activity, CheckCircle, Thermometer,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { StatCard } from "@/components/ui/stat-card";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useDashboardStats, useAppointments, useRooms } from "@/hooks/use-queries";
import { useModuleStore } from "@/modules/core/store";
import { useAuth } from "@/lib/auth-context";

import { getClinicToday, CLINIC_TZ } from "@/lib/utils";

// Same defensive nested→flat extractors as the other dashboards.
function aptName(apt: Record<string, unknown>): string {
  const flat = apt.patientName as string | undefined;
  if (flat && flat.trim()) return flat;
  const p = apt.patient as Record<string, unknown> | undefined;
  if (p?.firstName) return `${p.firstName} ${p.lastName ?? ""}`.trim();
  return "Unknown";
}
function aptDoctor(apt: Record<string, unknown>): string {
  const flat = apt.doctorName as string | undefined;
  if (flat && flat.trim()) return flat;
  const d = apt.doctor as Record<string, unknown> | undefined;
  if (d?.name) return String(d.name);
  return "—";
}
const roomStatusConfig: Record<string, { dot: string; badge: "success" | "danger" | "warning" | "default" }> = {
  AVAILABLE: { dot: "bg-emerald-500", badge: "success" },
  OCCUPIED: { dot: "bg-red-500", badge: "danger" },
  CLEANING: { dot: "bg-amber-500", badge: "warning" },
  MAINTENANCE: { dot: "bg-stone-400", badge: "default" },
};

export function AssistantDashboard() {
  const router = useRouter();
  const { activities, waitingQueue } = useModuleStore();
  const { user } = useAuth();
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const todayLabel = new Date().toLocaleDateString("en-PK", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: CLINIC_TZ });

  // API data
  const { data: statsData, isLoading: statsLoading, isError: statsError } = useDashboardStats("assistant");
  const stats = (statsData?.data as Record<string, unknown>) || {};
  const pendingVitals = (stats.pendingVitals as number) || 0;
  const roomPrep = (stats.roomPrep as number) || 0;
  const treatments = (stats.treatments as number) || 0;
  const doneToday = (stats.doneToday as number) || 0;

  const today = getClinicToday();
  const { data: aptsData, isLoading: aptsLoading, isError: aptsError } = useAppointments({ date: today, status: "WAITING,CHECKED_IN" });
  const vitalsQueue = (Array.isArray(aptsData?.data) ? aptsData.data : []).slice(0, 5) as Array<Record<string, unknown>>;

  const { data: roomsData, isLoading: roomsLoading, isError: roomsError } = useRooms();
  const branchRooms = (Array.isArray(roomsData?.data) ? roomsData.data : []) as Array<Record<string, unknown>>;

  return (
    <div className="space-y-4 sm:space-y-6 animate-fade-in" data-id="DASH-ASSISTANT">
      {/* Welcome Card */}
      <div className="bg-gradient-to-r from-teal-600 to-teal-500 rounded-2xl p-4 sm:p-6 text-white shadow-sm">
        <p className="text-teal-100 text-sm">Clinical Assistant</p>
        <h1 className="text-lg sm:text-xl font-semibold">{greeting}, {user?.name || "there"}</h1>
        <p className="text-teal-100 mt-1 text-sm">{todayLabel} &mdash; Here are your tasks for today.</p>
      </div>

      {/* Error banner */}
      {(statsError || aptsError || roomsError) && (
        <div className="bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl px-4 py-3">
          Unable to load some dashboard data. Please try refreshing.
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard label="Pending Vitals" value={statsLoading ? 0 : pendingVitals} icon={<HeartPulse className="w-6 h-6" />} color="warning" />
        <StatCard label="Room Prep" value={statsLoading ? 0 : roomPrep} icon={<DoorOpen className="w-6 h-6" />} color="info" />
        <StatCard label="Treatments" value={statsLoading ? 0 : treatments} icon={<Activity className="w-6 h-6" />} color="primary" />
        <StatCard label="Done Today" value={statsLoading ? 0 : doneToday} icon={<CheckCircle className="w-6 h-6" />} color="success" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        {/* Patient Queue */}
        <div className="lg:col-span-2 space-y-4">
          <h2 className="text-base sm:text-lg font-semibold text-stone-900">Patient Queue</h2>
          <div className="space-y-3">
            {aptsLoading ? (
              <div className="text-sm text-stone-400 py-8 text-center">Loading patient queue...</div>
            ) : vitalsQueue.length === 0 ? (
              <div className="text-sm text-stone-400 py-8 text-center">No patients in queue.</div>
            ) : (
              vitalsQueue.map((patient) => {
                const isWaiting = patient.status === "WAITING";

                return (
                  <div
                    key={patient.id as string}
                    className="bg-white rounded-2xl border border-stone-100 shadow-sm p-4 sm:p-5 flex items-center gap-4 hover:shadow-md transition-shadow"
                  >
                    <Avatar name={aptName(patient)} size="sm" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-stone-900 truncate">{aptName(patient)}</p>
                      <p className="text-xs text-stone-500">{aptDoctor(patient)} &middot; {(patient.startTime as string) || "—"}</p>
                    </div>
                    <span className="text-xs text-stone-500 bg-stone-50 px-2.5 py-1 rounded-full">
                      {isWaiting ? "Record Vitals" : "Prep"}
                    </span>
                    {isWaiting ? (
                      <Button
                        size="sm"
                        onClick={() => router.push(`/vitals?patientId=${String(patient.patientId ?? (patient.patient as Record<string, unknown>)?.id ?? "")}`)}
                        className="bg-teal-600 hover:bg-teal-700 text-white rounded-xl px-4 font-medium"
                      >
                        <Thermometer className="w-3.5 h-3.5 mr-1.5" />
                        Start
                      </Button>
                    ) : (
                      <Badge variant="default">Upcoming</Badge>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Sidebar: Queue + Activity + Room Status */}
        <div className="space-y-4">
          {waitingQueue.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-stone-400 uppercase tracking-wider">Live Waiting Queue ({waitingQueue.length})</p>
              {waitingQueue.slice(0, 5).map((entry) => (
                <div key={entry.appointmentId} className="bg-white rounded-xl border border-stone-100 shadow-sm p-3 flex items-center gap-3">
                  <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-stone-900 truncate">{entry.patientName}</p>
                    <p className="text-xs text-stone-500">{entry.doctorName} &middot; {entry.stage.toLowerCase()}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
          {activities.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-stone-400 uppercase tracking-wider">Live Activity</p>
              {activities.slice(0, 5).map((act) => (
                <div key={act.id} className="flex items-start gap-2 text-sm text-stone-600 py-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-teal-400 mt-1.5 shrink-0" />
                  <span>{act.message}</span>
                </div>
              ))}
            </div>
          )}
          <div className="flex items-center justify-between">
            <h2 className="text-base sm:text-lg font-semibold text-stone-900">Room Status</h2>
            <Badge variant="default">{branchRooms.length} rooms</Badge>
          </div>
          <div className="grid grid-cols-1 gap-3">
            {roomsLoading ? (
              <div className="text-sm text-stone-400 py-4 text-center">Loading rooms...</div>
            ) : branchRooms.length === 0 ? (
              <div className="text-sm text-stone-400 py-4 text-center">No rooms found.</div>
            ) : (
              branchRooms.map((room) => {
                const status = (room.status as string) || "MAINTENANCE";
                const config = roomStatusConfig[status] || roomStatusConfig.MAINTENANCE;
                const roomName = (room.name as string) || "Room";
                const roomType = (room.type as string) || "";
                const currentPatientName = room.currentPatientName as string | undefined;
                const currentDoctorName = room.currentDoctorName as string | undefined;

                return (
                  <div
                    key={room.id as string}
                    className="bg-white rounded-2xl border border-stone-100 shadow-sm p-4 hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-stone-900">
                        {roomName.split(" - ")[0]}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <span className={`w-2 h-2 rounded-full ${config.dot}`} />
                        <span className="text-xs text-stone-500">{status.toLowerCase()}</span>
                      </div>
                    </div>
                    <p className="text-xs text-stone-400 mb-2">{roomType.replace("_", " ")}</p>
                    {currentPatientName && (
                      <div className="flex items-center gap-2 mt-2 pt-2 border-t border-stone-50">
                        <Avatar name={currentPatientName} size="sm" />
                        <div>
                          <p className="text-xs font-medium text-stone-700">{currentPatientName}</p>
                          <p className="text-[10px] text-stone-400">with {currentDoctorName || "—"}</p>
                        </div>
                      </div>
                    )}
                    {status === "CLEANING" && (
                      <Button size="sm" variant="outline" className="w-full mt-3 rounded-xl text-xs">
                        Mark Ready
                      </Button>
                    )}
                    {status === "AVAILABLE" && !currentPatientName && (
                      <p className="text-xs text-emerald-600 mt-1 flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        Ready for patients
                      </p>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
