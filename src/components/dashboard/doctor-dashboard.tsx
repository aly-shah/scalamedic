"use client";

import { useState } from "react";
import {
  Calendar, Clock, Users, Stethoscope, Brain, Play, Eye, Search,
  UserPlus, CalendarPlus, Mic, MicOff, FileText, ChevronRight,
  CheckCircle, AlertCircle, Timer, Activity, Pill, FlaskConical,
  CalendarClock, Phone, Sparkles,
} from "lucide-react";
import { StatCard } from "@/components/ui/stat-card";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchInput } from "@/components/ui/search-input";
import { useAuth } from "@/lib/auth-context";
import { SlidePanel } from "@/components/ui/slide-panel";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { useDashboardStats, useAppointments, usePatients, useCreatePatientNote, useCreatePatientPrescription, useUpdateAppointment } from "@/hooks/use-queries";
import { useModuleEmit } from "@/modules/core/hooks";
import { SystemEvents } from "@/modules/core/events";
import { useModuleStore } from "@/modules/core/store";
import { AddPatientModal } from "@/components/patients/add-patient-modal";
import { CreateAppointmentModal } from "@/components/appointments/create-appointment-modal";
import { cn, getClinicToday, CLINIC_TZ } from "@/lib/utils";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Appointment, Patient } from "@/types";

function getPatientName(appt: Appointment): string {
  if (appt.patientName) return appt.patientName;
  const p = (appt as unknown as Record<string, unknown>).patient as Record<string, unknown> | undefined;
  if (p?.firstName) return `${p.firstName} ${p.lastName || ""}`.trim();
  return "Unknown";
}

function getDoctorName(appt: Appointment): string {
  if (appt.doctorName) return appt.doctorName;
  const d = (appt as unknown as Record<string, unknown>).doctor as Record<string, unknown> | undefined;
  if (d?.name) return String(d.name);
  return "Doctor";
}

export function DoctorDashboard() {
  const router = useRouter();
  const { activities, waitingQueue } = useModuleStore();
  const { user } = useAuth();
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const today = getClinicToday();

  // Data
  const { data: statsData } = useDashboardStats("doctor");
  const stats = (statsData?.data as Record<string, unknown>) || {};
  const { data: aptsData } = useAppointments({ date: today });
  const allAppointments = ((aptsData?.data || []) as Appointment[]);

  // My appointments vs other doctors' appointments
  const myAppointments = allAppointments
    .filter((a) => !user?.id || a.doctorId === user.id)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));

  // Appointments for other doctors (potential coverage needed)
  const otherDoctorAppts = allAppointments
    .filter((a) => user?.id && a.doctorId !== user.id)
    .filter((a) => a.status === "SCHEDULED" || a.status === "CONFIRMED" || a.status === "CHECKED_IN" || a.status === "WAITING")
    .sort((a, b) => a.startTime.localeCompare(b.startTime));

  // Detect if there are unattended appointments from other doctors (doctor may be off)
  const coverageNeeded = otherDoctorAppts.filter((a) => {
    // Appointments past their start time that haven't been started — doctor might be absent
    const [h, m] = a.startTime.split(":").map(Number);
    const apptMins = h * 60 + m;
    const nowMins = new Date().getHours() * 60 + new Date().getMinutes();
    return apptMins < nowMins - 15 && (a.status === "SCHEDULED" || a.status === "CONFIRMED");
  });

  const waiting = myAppointments.filter((a) => a.status === "WAITING" || a.status === "CHECKED_IN");
  const inProgress = myAppointments.find((a) => a.status === "IN_PROGRESS");
  const upcoming = myAppointments.filter((a) => a.status === "SCHEDULED" || a.status === "CONFIRMED");
  const completed = myAppointments.filter((a) => a.status === "COMPLETED");

  // Patient search
  const [patientSearch, setPatientSearch] = useState("");
  const { data: patientsRes } = usePatients(patientSearch.length >= 2 ? { search: patientSearch } : undefined);
  const searchResults = patientSearch.length >= 2 ? ((patientsRes?.data || []) as Patient[]).slice(0, 5) : [];

  // Modals
  const [showAddPatient, setShowAddPatient] = useState(false);
  const [showBookAppointment, setShowBookAppointment] = useState(false);
  const [showOutcome, setShowOutcome] = useState<Appointment | null>(null);

  // Doctor status
  const [doctorStatus, setDoctorStatus] = useState<"available" | "in_consultation" | "on_break" | "unavailable">(
    inProgress ? "in_consultation" : "available"
  );

  // Voice note (mock state)
  const [isRecording, setIsRecording] = useState(false);

  const fmtTime = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return `${h % 12 || 12}:${m.toString().padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
  };

  const statusColor = (s: string) => {
    const map: Record<string, "success" | "warning" | "info" | "danger" | "default"> = {
      SCHEDULED: "default", CONFIRMED: "info", CHECKED_IN: "warning",
      WAITING: "warning", IN_PROGRESS: "success", COMPLETED: "default",
      NO_SHOW: "danger", CANCELLED: "danger",
    };
    return map[s] || "default";
  };

  return (
    <div className="space-y-4 sm:space-y-5 animate-fade-in" data-id="DASH-DOCTOR">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          <Avatar name={user?.name || "Doctor"} size="lg" className="ring-2 ring-teal-200 hidden sm:flex" />
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-stone-900">{greeting}, {user?.name || "Doctor"}</h1>
            <p className="text-sm text-stone-400 mt-0.5">
              {new Date().toLocaleDateString("en-PK", { weekday: "long", month: "long", day: "numeric", timeZone: CLINIC_TZ })}
              {myAppointments.length > 0 && <span> &middot; {myAppointments.length} appointments</span>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Status Toggle */}
          <div className="flex items-center gap-1 bg-stone-100 rounded-xl p-0.5">
            {([
              { v: "available" as const, l: "Available", color: "bg-emerald-500" },
              { v: "in_consultation" as const, l: "In Consult", color: "bg-teal-500" },
              { v: "on_break" as const, l: "Break", color: "bg-amber-500" },
            ]).map((s) => (
              <button key={s.v} onClick={() => setDoctorStatus(s.v)}
                className={cn(
                  "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-all",
                  doctorStatus === s.v ? "bg-white text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-700"
                )}>
                <span className={cn("w-2 h-2 rounded-full", doctorStatus === s.v ? s.color : "bg-stone-300")} />
                <span className="hidden sm:inline">{s.l}</span>
              </button>
            ))}
          </div>
          <Button variant="outline" size="sm" iconLeft={<UserPlus className="w-3.5 h-3.5" />} onClick={() => setShowAddPatient(true)}>
            <span className="hidden sm:inline">New Patient</span>
            <span className="sm:hidden">Add</span>
          </Button>
          <Button size="sm" iconLeft={<CalendarPlus className="w-3.5 h-3.5" />} onClick={() => setShowBookAppointment(true)}>
            Book
          </Button>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <StatCard label="Today" value={myAppointments.length} icon={<Calendar className="w-5 h-5" />} color="primary" />
        <StatCard label="Waiting" value={waiting.length} icon={<Timer className="w-5 h-5" />} color="warning" />
        <StatCard label="Completed" value={completed.length} icon={<CheckCircle className="w-5 h-5" />} color="success" />
        <StatCard label="Follow-Ups" value={(stats.myFollowUps as number) || 0} icon={<CalendarClock className="w-5 h-5" />} color="info" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5">
        {/* LEFT — Main Workspace */}
        <div className="lg:col-span-8 space-y-4">

          {/* Patient Search */}
          <Card>
            <CardContent className="p-3">
              <div className="relative">
                <SearchInput
                  placeholder="Search patient by name, phone, or ID..."
                  value={patientSearch}
                  onChange={setPatientSearch}
                  debounceMs={200}
                />
                {searchResults.length > 0 && (
                  <div className="absolute top-full left-0 right-0 z-20 mt-1 bg-white rounded-xl border border-stone-200 shadow-lg max-h-64 overflow-y-auto">
                    {searchResults.map((p) => (
                      <button key={p.id} onClick={() => { router.push(`/patients/${p.id}`); setPatientSearch(""); }}
                        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-stone-50 transition-colors text-left cursor-pointer border-b border-stone-50 last:border-b-0">
                        <Avatar name={`${p.firstName} ${p.lastName}`} size="sm" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-stone-900">{p.firstName} {p.lastName}</p>
                          <p className="text-xs text-stone-400">{p.patientCode} &middot; {p.phone}</p>
                        </div>
                        <ChevronRight className="w-4 h-4 text-stone-300" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Currently In Progress */}
          {inProgress && (
            <Card className="border-l-4 border-l-teal-500 bg-teal-50/20">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-teal-100 flex items-center justify-center animate-pulse">
                      <Stethoscope className="w-5 h-5 text-teal-600" />
                    </div>
                    <div>
                      <p className="text-xs text-teal-600 font-semibold uppercase tracking-wider">In Progress</p>
                      <p className="text-base font-bold text-stone-900 mt-0.5">{inProgress.patientName}</p>
                      <p className="text-xs text-stone-500">{fmtTime(inProgress.startTime)} &middot; {inProgress.type.replace("_", " ")}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" iconLeft={<Mic className="w-3.5 h-3.5" />}
                      onClick={() => setIsRecording(!isRecording)}
                      className={isRecording ? "border-red-300 text-red-600 bg-red-50" : ""}>
                      {isRecording ? "Stop" : "Voice Note"}
                    </Button>
                    <Link href="/consultation">
                      <Button size="sm" iconLeft={<FileText className="w-3.5 h-3.5" />}>
                        Notes
                      </Button>
                    </Link>
                  </div>
                </div>
                {isRecording && (
                  <div className="mt-3 flex items-center gap-3 bg-red-50 rounded-xl p-3 border border-red-100 animate-fade-in">
                    <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
                    <span className="text-sm text-red-700 font-medium">Recording...</span>
                    <span className="text-xs text-red-400">Tap &quot;Stop&quot; to transcribe</span>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Waiting Queue */}
          {waiting.length > 0 && (
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Timer className="w-4 h-4 text-amber-500" />
                  <span className="text-sm font-semibold text-stone-900">Waiting ({waiting.length})</span>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {waiting.map((appt, i) => (
                  <div key={appt.id} className={cn(
                    "flex items-center justify-between px-4 py-3 hover:bg-stone-50 transition-colors",
                    i < waiting.length - 1 && "border-b border-stone-50"
                  )}>
                    <div className="flex items-center gap-3">
                      <div className="w-7 h-7 rounded-full bg-amber-50 flex items-center justify-center text-xs font-bold text-amber-600">
                        {i + 1}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-stone-900">{getPatientName(appt)}</p>
                        <p className="text-xs text-stone-400">{fmtTime(appt.startTime)} &middot; {appt.type.replace("_", " ")}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Button size="sm" variant="outline" onClick={() => setShowOutcome(appt)} title="Quick Outcome">
                        <FileText className="w-3 h-3" />
                      </Button>
                      <Button size="sm" iconLeft={<Play className="w-3 h-3" />}
                        onClick={() => router.push(`/consultation?patientId=${appt.patientId}&appointmentId=${appt.id}`)}>
                        Engage
                      </Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Coverage Alert */}
          {coverageNeeded.length > 0 && (
            <Card className="border-l-4 border-l-amber-400 bg-amber-50/30">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <AlertCircle className="w-4 h-4 text-amber-600" />
                  <span className="text-sm font-semibold text-amber-800">Coverage Needed</span>
                  <Badge variant="warning" className="text-[10px]">{coverageNeeded.length}</Badge>
                </div>
                <p className="text-xs text-amber-700 mb-2.5">These appointments from other doctors are overdue and may need your attention:</p>
                {coverageNeeded.slice(0, 3).map((appt) => (
                  <div key={appt.id} className="flex items-center gap-2.5 bg-white rounded-lg p-2.5 mb-1.5 last:mb-0 border border-amber-100">
                    <Avatar name={getPatientName(appt)} size="sm" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-stone-900 truncate">{getPatientName(appt)}</p>
                      <p className="text-[10px] text-stone-400">{fmtTime(appt.startTime)} &middot; {appt.type.replace("_", " ")} &middot; <span className="text-amber-600 font-medium">{getDoctorName(appt)}</span></p>
                    </div>
                    <Badge variant="warning" className="text-[9px] shrink-0">Overdue</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* My Schedule */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between w-full">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-blue-500" />
                  <span className="text-sm font-semibold text-stone-900">My Schedule</span>
                  <Badge variant="primary" className="text-[9px]">{myAppointments.length}</Badge>
                </div>
                <Link href="/calendar" className="text-xs text-teal-600 font-medium hover:text-teal-700">
                  Calendar
                </Link>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {myAppointments.length === 0 ? (
                <div className="py-8 text-center text-sm text-stone-400">No appointments today</div>
              ) : (
                myAppointments.map((appt, i) => (
                  <div key={appt.id} className={cn(
                    "flex items-center gap-3 px-4 py-3 hover:bg-stone-50 transition-colors",
                    i < myAppointments.length - 1 && "border-b border-stone-50",
                    appt.status === "IN_PROGRESS" && "bg-teal-50/30"
                  )}>
                    <div className="w-12 text-center shrink-0">
                      <p className="text-sm font-semibold text-stone-900">{fmtTime(appt.startTime)}</p>
                    </div>
                    <div className="w-px h-8 bg-stone-100" />
                    <Avatar name={getPatientName(appt)} size="sm" />
                    <button onClick={() => router.push(`/patients/${appt.patientId}`)} className="flex-1 min-w-0 text-left cursor-pointer">
                      <p className="text-sm font-medium text-stone-900 truncate">{getPatientName(appt)}</p>
                      <p className="text-xs text-stone-400">{appt.type.replace("_", " ")}{appt.roomName ? ` · ${appt.roomName}` : ""}</p>
                    </button>
                    <Badge variant={statusColor(appt.status)} className="shrink-0 text-[9px]">
                      {appt.status.replace("_", " ")}
                    </Badge>
                    {appt.status !== "COMPLETED" && appt.status !== "CANCELLED" && appt.status !== "NO_SHOW" && (
                      <Button size="sm" variant={appt.status === "IN_PROGRESS" ? "primary" : "outline"}
                        iconLeft={<Play className="w-3 h-3" />}
                        onClick={() => router.push(`/consultation?patientId=${appt.patientId}&appointmentId=${appt.id}`)}
                        className="shrink-0">
                        {appt.status === "IN_PROGRESS" ? "Continue" : "Engage"}
                      </Button>
                    )}
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        {/* RIGHT — Sidebar */}
        <div className="lg:col-span-4 space-y-4">

          {/* Quick Actions */}
          <Card>
            <CardHeader>
              <span className="text-sm font-semibold text-stone-900">Quick Actions</span>
            </CardHeader>
            <CardContent className="p-3 pt-0 space-y-1.5">
              {[
                { label: "Consultation", icon: <Stethoscope className="w-4 h-4" />, href: "/consultation", color: "text-teal-600", bg: "bg-teal-50" },
                { label: "AI Transcribe", icon: <Brain className="w-4 h-4" />, href: "/ai", color: "text-indigo-600", bg: "bg-indigo-50" },
                { label: "Follow-Ups", icon: <CalendarClock className="w-4 h-4" />, href: "/follow-ups", color: "text-amber-600", bg: "bg-amber-50" },
                { label: "Lab Results", icon: <FlaskConical className="w-4 h-4" />, href: "/lab-results", color: "text-emerald-600", bg: "bg-emerald-50" },
                { label: "Calendar", icon: <Calendar className="w-4 h-4" />, href: "/calendar", color: "text-violet-600", bg: "bg-violet-50" },
              ].map((action) => (
                <Link key={action.label} href={action.href}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-stone-50 transition-colors">
                  <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center", action.bg, action.color)}>
                    {action.icon}
                  </div>
                  <span className="text-sm font-medium text-stone-700">{action.label}</span>
                  <ChevronRight className="w-3.5 h-3.5 text-stone-300 ml-auto" />
                </Link>
              ))}
            </CardContent>
          </Card>

          {/* Live Activity */}
          {activities.length > 0 && (
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-teal-500" />
                  <span className="text-sm font-semibold text-stone-900">Live Activity</span>
                </div>
              </CardHeader>
              <CardContent className="p-3 pt-0">
                <div className="space-y-2">
                  {activities.slice(0, 5).map((act) => (
                    <div key={act.id} className="flex items-start gap-2 text-xs text-stone-500 py-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-teal-400 mt-1.5 shrink-0" />
                      <span>{act.message}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Today Summary */}
          <Card className="bg-gradient-to-br from-stone-50 to-teal-50/30">
            <CardContent className="p-4">
              <p className="text-xs font-semibold text-stone-400 uppercase tracking-wider mb-3">Today&apos;s Summary</p>
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-stone-600">Consultations</span>
                  <span className="text-sm font-bold text-stone-900">
                    {myAppointments.filter((a) => a.type === "CONSULTATION").length}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-stone-600">Procedures</span>
                  <span className="text-sm font-bold text-stone-900">
                    {myAppointments.filter((a) => a.type === "PROCEDURE").length}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-stone-600">Follow-Ups</span>
                  <span className="text-sm font-bold text-stone-900">
                    {myAppointments.filter((a) => a.type === "FOLLOW_UP").length}
                  </span>
                </div>
                <div className="border-t border-stone-200 pt-2 flex items-center justify-between">
                  <span className="text-sm font-medium text-stone-700">Completion</span>
                  <span className="text-sm font-bold text-teal-600">
                    {myAppointments.length > 0 ? Math.round((completed.length / myAppointments.length) * 100) : 0}%
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Modals */}
      <AddPatientModal isOpen={showAddPatient} onClose={() => setShowAddPatient(false)} />
      <CreateAppointmentModal isOpen={showBookAppointment} onClose={() => setShowBookAppointment(false)} />

      {/* Quick Outcome Panel */}
      {showOutcome && (
        <QuickOutcomePanel appointment={showOutcome} onClose={() => setShowOutcome(null)} />
      )}
    </div>
  );
}

// ---- Quick Outcome Panel ----

const OUTCOME_TYPES = [
  { value: "consultation_completed", label: "Consultation Completed", icon: "checkmark" },
  { value: "treatment_advised", label: "Treatment Advised", icon: "plan" },
  { value: "treatment_performed", label: "Treatment Performed", icon: "done" },
  { value: "prescription_given", label: "Prescription Given", icon: "rx" },
  { value: "followup_required", label: "Follow-Up Required", icon: "calendar" },
  { value: "lab_test_advised", label: "Lab Test Advised", icon: "lab" },
  { value: "referred_onward", label: "Referred Onward", icon: "ref" },
  { value: "no_treatment_needed", label: "No Treatment Needed", icon: "none" },
];

// Templates by appointment type
const NOTE_TEMPLATES: Record<string, { label: string; fields: string[] }> = {
  CONSULTATION: {
    label: "Consultation",
    fields: ["Chief Complaint", "Symptoms", "Examination", "Diagnosis", "Treatment Plan", "Advice", "Follow-Up"],
  },
  PROCEDURE: {
    label: "Procedure",
    fields: ["Area Treated", "Device / Machine", "Settings", "Skin Response", "Post-Care Advice", "Next Session"],
  },
  FOLLOW_UP: {
    label: "Follow-Up Review",
    fields: ["Improvement Status", "Patient Feedback", "Ongoing Symptoms", "Next Recommendation"],
  },
  REVIEW: {
    label: "Review",
    fields: ["Progress Since Last Visit", "Current Condition", "Adjustments Made", "Next Steps"],
  },
  EMERGENCY: {
    label: "Emergency",
    fields: ["Presenting Complaint", "Immediate Findings", "Intervention", "Outcome", "Follow-Up Plan"],
  },
};

function QuickOutcomePanel({ appointment, onClose }: { appointment: Appointment; onClose: () => void }) {
  const { user } = useAuth();
  const emit = useModuleEmit("MOD-CONSULTATION");
  const createNote = useCreatePatientNote(appointment.patientId);
  const updateAppt = useUpdateAppointment();

  const [outcome, setOutcome] = useState("");
  const [noteFields, setNoteFields] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const template = NOTE_TEMPLATES[appointment.type] || NOTE_TEMPLATES.CONSULTATION;

  const updateField = (field: string, value: string) =>
    setNoteFields((prev) => ({ ...prev, [field]: value }));

  const handleSave = async () => {
    setSaving(true);
    try {
      // Build structured note from template fields
      const diagnosis = noteFields["Diagnosis"] || noteFields["Immediate Findings"] || noteFields["Current Condition"] || "";
      const chiefComplaint = noteFields["Chief Complaint"] || noteFields["Presenting Complaint"] || noteFields["Area Treated"] || "";
      const treatmentPlan = noteFields["Treatment Plan"] || noteFields["Post-Care Advice"] || noteFields["Next Recommendation"] || noteFields["Next Steps"] || "";
      const examination = noteFields["Examination"] || noteFields["Skin Response"] || noteFields["Improvement Status"] || noteFields["Progress Since Last Visit"] || "";

      // Save consultation note
      await createNote.mutateAsync({
        appointmentId: appointment.id,
        doctorId: user?.id,
        chiefComplaint: chiefComplaint || undefined,
        examination: examination || undefined,
        diagnosis: diagnosis || outcome || undefined,
        treatmentPlan: treatmentPlan || undefined,
        advice: noteFields["Advice"] || noteFields["Follow-Up"] || noteFields["Follow-Up Plan"] || undefined,
      });

      // Update appointment status to completed
      await updateAppt.mutateAsync({
        id: appointment.id,
        data: { status: "COMPLETED", workflowStage: "BILLING" },
      });

      emit(SystemEvents.CONSULTATION_COMPLETED, {
        patientName: appointment.patientName,
        diagnosis: diagnosis || outcome,
      }, { patientId: appointment.patientId, appointmentId: appointment.id });

      setSaved(true);
      setTimeout(onClose, 1200);
    } catch {
      setSaving(false);
    }
  };

  return (
    <SlidePanel isOpen={true} onClose={onClose}
      title="Quick Outcome"
      subtitle={`${appointment.patientName} — ${appointment.type.replace("_", " ")}`}
      width="lg"
      footer={saved ? undefined : (
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !outcome}>
            {saving ? "Saving..." : "Save & Complete"}
          </Button>
        </>
      )}>
      {saved ? (
        <div className="flex flex-col items-center justify-center py-12 animate-fade-in">
          <CheckCircle className="w-16 h-16 text-emerald-500 mb-4" />
          <h3 className="text-lg font-semibold text-stone-900">Visit Completed</h3>
          <p className="text-sm text-stone-500 mt-1">Outcome saved and sent to billing</p>
        </div>
      ) : (
        <div className="space-y-5">
          {/* Outcome Type */}
          <div>
            <p className="text-xs font-semibold text-stone-400 uppercase tracking-wider mb-2">Outcome</p>
            <div className="grid grid-cols-2 gap-2">
              {OUTCOME_TYPES.map((o) => (
                <button key={o.value} onClick={() => setOutcome(o.value)}
                  className={cn(
                    "py-2.5 px-3 rounded-xl border-2 text-xs font-medium text-left cursor-pointer transition-all",
                    outcome === o.value
                      ? "border-teal-400 bg-teal-50 text-teal-700"
                      : "border-stone-200 bg-white text-stone-600 hover:border-stone-300"
                  )}>{o.label}</button>
              ))}
            </div>
          </div>

          {/* Template-Based Note Fields */}
          <div>
            <p className="text-xs font-semibold text-stone-400 uppercase tracking-wider mb-2">
              {template.label} Notes
            </p>
            <div className="space-y-3">
              {template.fields.map((field) => (
                <Textarea key={field} label={field} rows={2}
                  placeholder={`Enter ${field.toLowerCase()}...`}
                  value={noteFields[field] || ""}
                  onChange={(e) => updateField(field, e.target.value)} />
              ))}
            </div>
          </div>
        </div>
      )}
    </SlidePanel>
  );
}
