"use client";

import { useState } from "react";
import {
  Clock, User, Stethoscope, Calendar, CheckCircle, MapPin, Building2,
} from "lucide-react";
import { SlidePanel } from "@/components/ui/slide-panel";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/ui/search-input";
import { DatePicker } from "@/components/ui/date-picker";
import { TimePicker } from "@/components/ui/time-picker";
import { usePatients, usePatient, useStaff, useRooms, useCreateAppointment, useTreatments, usePatientAppointments, useBranches } from "@/hooks/use-queries";
import { UserRole } from "@/types";
import type { Patient, User as UserType, Room, Branch } from "@/types";
import { useModuleEmit } from "@/modules/core/hooks";
import { SystemEvents } from "@/modules/core/events";
import { useAuth } from "@/lib/auth-context";
import { cn, getClinicToday } from "@/lib/utils";

interface CreateAppointmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  preselectedPatientId?: string;
}

// Time slots are handled by TimePicker component

export function CreateAppointmentModal({ isOpen, onClose, preselectedPatientId }: CreateAppointmentModalProps) {
  const emit = useModuleEmit("MOD-APPOINTMENT");
  const { user } = useAuth();
  const createAppointment = useCreateAppointment();

  const { data: patientsResponse } = usePatients();
  const allPatients = (patientsResponse?.data || []) as Patient[];
  const { data: staffResponse } = useStaff();
  const allUsers = (staffResponse?.data || []) as UserType[];
  const { data: roomsResponse } = useRooms();
  const allRooms = (roomsResponse?.data || []) as Room[];
  const { data: branchesResponse } = useBranches();
  const allBranches = ((branchesResponse?.data || []) as Branch[]).filter((b) => b.isActive);

  const [patientSearch, setPatientSearch] = useState("");
  const [patientId, setPatientId] = useState(preselectedPatientId || "");

  // Track what we last applied so we re-apply when either isOpen or preselectedPatientId changes
  const [appliedKey, setAppliedKey] = useState("");
  const currentKey = isOpen ? `open-${preselectedPatientId || "none"}` : "closed";
  if (currentKey !== appliedKey) {
    setAppliedKey(currentKey);
    if (isOpen && preselectedPatientId) {
      setPatientId(preselectedPatientId);
      setPatientSearch("");
    }
  }
  const [type, setType] = useState("CONSULTATION");
  // Selected procedure (only used when type === "PROCEDURE"). Populates
  // appointments.treatmentId so the check-in invoice can pre-fill the
  // line item, and so analytics know which procedure was booked.
  const [treatmentId, setTreatmentId] = useState("");
  const [doctorId, setDoctorId] = useState("");
  // Which staff role is active in the practitioner picker. Default
  // DOCTOR keeps the existing flow unchanged for receptionists who
  // book consultations; switching to AESTHETICIAN / OPERATOR re-filters
  // the dropdown to those roles. The schema column is still
  // `doctorId` — it's a User FK, not a doctor-only column.
  const [practitionerRole, setPractitionerRole] = useState<UserRole>(UserRole.DOCTOR);
  const [date, setDate] = useState(getClinicToday());
  const [time, setTime] = useState("");
  const [duration, setDuration] = useState("30");
  const [roomId, setRoomId] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  // Branch defaults to the user's home branch but can be changed per booking.
  // The selected branch scopes the doctor list, the room list, and is what
  // gets written as appointments.branchId.
  const [branchId, setBranchId] = useState<string>(user?.branchId ?? "");
  // Re-sync default once the auth user resolves (which can be after first
  // mount). useState's initial value runs once, so a small effect-ish
  // guarded set keeps it in sync without triggering loops.
  if (!branchId && user?.branchId) {
    setBranchId(user.branchId);
  }

  // Fetch treatments scoped to the selected branch — uses the branchId
  // filter we added in v24 so the receptionist only sees offerings for
  // the branch they're booking into.
  const { data: treatmentsRes } = useTreatments(branchId ? { branchId } : undefined);
  const treatments = ((treatmentsRes?.data || []) as { id: string; name: string; category: string; duration: number; basePrice: number }[]);

  // Fetch selected patient's appointment history
  const { data: patientApptsRes } = usePatientAppointments(patientId);
  const patientAppointments = ((patientApptsRes?.data || []) as { id: string; status: string; type: string; doctorId: string; doctorName?: string }[]);
  const hasCompletedVisit = patientAppointments.some((a) => a.status === "COMPLETED" || a.status === "IN_PROGRESS");
  const lastDoctor = patientAppointments[0]?.doctorId || "";

  // Fetch individual patient when preselected (list only returns 20)
  const { data: singlePatientRes } = usePatient(patientId);
  const singlePatient = (singlePatientRes?.data || null) as Patient | null;

  // Practitioners are scoped to (a) the active role tab and (b) the
  // selected branch — the receptionist shouldn't be able to assign
  // someone from another branch by accident. The role tab defaults to
  // DOCTOR; switching to AESTHETICIAN / OPERATOR re-filters the list.
  const practitioners = allUsers.filter(
    (u) => u.role === practitionerRole && (!branchId || u.branchId === branchId)
  );
  const availableRooms = allRooms.filter(
    (r) => r.isAvailable && (!branchId || (r as unknown as { branchId?: string }).branchId === branchId)
  );
  const selectedPatient = allPatients.find((p) => p.id === patientId) || singlePatient;

  // Sort: patient's last practitioner first (only when in the same
  // role bucket as the active tab), then assigned doctor, then
  // alphabetical.
  const sortedPractitioners = [...practitioners].sort((a, b) => {
    if (a.id === lastDoctor) return -1;
    if (b.id === lastDoctor) return 1;
    if (selectedPatient?.assignedDoctorId === a.id) return -1;
    if (selectedPatient?.assignedDoctorId === b.id) return 1;
    return a.name.localeCompare(b.name);
  });

  // Drop the picked practitioner if the role tab changes and the
  // current pick isn't in the new bucket. Avoids submitting an
  // invisible-to-the-user selection.
  if (doctorId && !practitioners.some((p) => p.id === doctorId)) {
    setDoctorId("");
  }

  // Dynamic appointment types based on patient history
  const appointmentTypes = [
    { v: "CONSULTATION", l: "Consultation", d: "30", always: true },
    { v: "PROCEDURE", l: "Procedure", d: "45", always: true },
    { v: "FOLLOW_UP", l: "Follow-Up", d: "20", always: false },
    { v: "REVIEW", l: "Review", d: "15", always: false },
    { v: "EMERGENCY", l: "Emergency", d: "30", always: true },
  ].filter((t) => t.always || hasCompletedVisit);
  const filteredPatients = patientSearch.length >= 2
    ? allPatients.filter((p) =>
        `${p.firstName} ${p.lastName}`.toLowerCase().includes(patientSearch.toLowerCase()) ||
        (p.phone || "").includes(patientSearch) ||
        p.patientCode.toLowerCase().includes(patientSearch.toLowerCase())
      ).slice(0, 6)
    : [];

  const handleReset = () => {
    setPatientSearch(""); setPatientId(""); setType("CONSULTATION");
    setTreatmentId("");
    setDoctorId(""); setPractitionerRole(UserRole.DOCTOR);
    setDate(getClinicToday());
    setTime(""); setDuration("30"); setRoomId("");
    setNotes(""); setError(""); setSuccess(false);
    // Branch resets back to user's home branch — keeps multi-branch
    // workflows working without forcing a re-pick on every booking.
    setBranchId(user?.branchId ?? "");
  };

  const handleSubmit = async () => {
    if (!patientId) { setError("Select a patient"); return; }
    if (!branchId) { setError("Select a branch"); return; }
    if (type === "PROCEDURE" && !treatmentId) { setError("Select a procedure"); return; }
    if (!doctorId) { setError("Select a practitioner"); return; }
    if (!date) { setError("Select a date"); return; }
    if (!time) { setError("Select a time"); return; }
    setError("");

    const durMins = parseInt(duration) || 30;
    const [h, m] = time.split(":").map(Number);
    const endH = h + Math.floor((m + durMins) / 60);
    const endM = (m + durMins) % 60;
    const endTime = `${endH.toString().padStart(2, "0")}:${endM.toString().padStart(2, "0")}`;

    try {
      await createAppointment.mutateAsync({
        patientId, doctorId,
        branchId,
        roomId: roomId || undefined,
        date, startTime: time, endTime,
        durationMinutes: durMins,
        type, priority: "NORMAL",
        // Only send treatmentId when type is PROCEDURE — schema is
        // optional but stamping it on a CONSULTATION would mislead
        // downstream check-in invoice pre-fill.
        treatmentId: type === "PROCEDURE" && treatmentId ? treatmentId : undefined,
        notes: notes.trim() || undefined,
        createdById: user?.id || undefined,
      });

      const doc = practitioners.find((d) => d.id === doctorId);
      emit(SystemEvents.APPOINTMENT_BOOKED, {
        patientName: selectedPatient ? `${selectedPatient.firstName} ${selectedPatient.lastName}` : "",
        doctorName: doc?.name ?? "", date,
      }, { patientId, appointmentId: "new" });

      setSuccess(true);
      setTimeout(() => { handleReset(); onClose(); }, 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to book appointment");
    }
  };

  const handleClose = () => { handleReset(); onClose(); };

  const fmtTime = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return `${h % 12 || 12}:${m.toString().padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
  };

  return (
    <SlidePanel
      isOpen={isOpen}
      onClose={handleClose}
      title="Book Appointment"
      subtitle="Schedule a new visit"
      width="md"
      data-id="APPT-CREATE"
      footer={success ? undefined : (
        <>
          <Button variant="outline" onClick={handleClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={createAppointment.isPending || !patientId || !doctorId || !time}>
            {createAppointment.isPending ? "Booking..." : "Book Appointment"}
          </Button>
        </>
      )}
    >
      {success ? (
        <div className="flex flex-col items-center justify-center py-12 animate-fade-in">
          <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center mb-4">
            <CheckCircle className="w-8 h-8 text-emerald-500" />
          </div>
          <h3 className="text-lg font-semibold text-stone-900">Appointment Booked</h3>
          <p className="text-sm text-stone-500 mt-1">
            {selectedPatient ? `${selectedPatient.firstName} ${selectedPatient.lastName}` : ""} {time ? `at ${fmtTime(time)}` : ""}
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {error && <div className="bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl px-4 py-2.5 animate-fade-in">{error}</div>}

          {/* Patient */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <User className="w-4 h-4 text-blue-500" />
              <span className="text-xs font-semibold text-stone-400 uppercase tracking-wider">Patient</span>
            </div>
            {selectedPatient ? (
              <div className="flex items-center justify-between px-3.5 py-3 bg-blue-50 rounded-xl border border-blue-200">
                <div>
                  <p className="text-sm font-semibold text-stone-900">{selectedPatient.firstName} {selectedPatient.lastName}</p>
                  <p className="text-xs text-stone-500">{selectedPatient.patientCode} · {selectedPatient.phone}</p>
                </div>
                <button onClick={() => { setPatientId(""); setPatientSearch(""); }} className="text-xs text-red-500 hover:underline cursor-pointer">Change</button>
              </div>
            ) : (
              <div className="relative">
                <SearchInput placeholder="Search name, phone, or ID..." value={patientSearch} onChange={setPatientSearch} debounceMs={150} />
                {filteredPatients.length > 0 && (
                  <div className="absolute top-full left-0 right-0 z-20 mt-1 bg-white rounded-xl border border-stone-200 shadow-lg max-h-48 overflow-y-auto">
                    {filteredPatients.map((p) => (
                      <button key={p.id} onClick={() => { setPatientId(p.id); setPatientSearch(""); }}
                        className="w-full flex items-center gap-3 px-3.5 py-2.5 hover:bg-stone-50 transition-colors text-left cursor-pointer border-b border-stone-50 last:border-b-0">
                        <div className="w-8 h-8 rounded-full bg-teal-50 flex items-center justify-center text-xs font-bold text-teal-600">
                          {p.firstName[0]}{p.lastName[0]}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-stone-900">{p.firstName} {p.lastName}</p>
                          <p className="text-xs text-stone-400">{p.patientCode} · {p.phone}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Branch — scopes the doctor list, room list, and treatments
              shown below. Defaults to the booking user's home branch. */}
          {allBranches.length > 1 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Building2 className="w-4 h-4 text-slate-500" />
                <span className="text-xs font-semibold text-stone-400 uppercase tracking-wider">Branch</span>
              </div>
              <Select
                placeholder="Select branch"
                value={branchId}
                onChange={(e) => {
                  setBranchId(e.target.value);
                  // Doctor / room may not exist at the new branch — clear them.
                  setDoctorId("");
                  setRoomId("");
                }}
                options={allBranches.map((b) => ({
                  value: b.id,
                  label: b.code ? `${b.name} (${b.code})` : b.name,
                }))}
              />
            </div>
          )}

          {/* Type */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Stethoscope className="w-4 h-4 text-violet-500" />
              <span className="text-xs font-semibold text-stone-400 uppercase tracking-wider">Type</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {appointmentTypes.map((t) => (
                <button key={t.v} onClick={() => {
                  setType(t.v); setDuration(t.d);
                  // Switching off PROCEDURE invalidates the picked
                  // treatment — clear it so a stale selection doesn't
                  // ride along with a non-procedure booking.
                  if (t.v !== "PROCEDURE") setTreatmentId("");
                }}
                  className={cn(
                    "py-2 rounded-xl border-2 text-xs font-medium transition-all cursor-pointer",
                    type === t.v ? "border-violet-400 bg-violet-50 text-violet-700" : "border-stone-200 bg-white text-stone-500 hover:border-stone-300"
                  )}>{t.l}</button>
              ))}
            </div>
            {/* Procedure picker — dropdown of branch-scoped catalog
                treatments. Selecting one stamps the appointment's
                treatmentId (carries forward to the check-in invoice
                line item) and snaps the duration to the catalog
                default. */}
            {type === "PROCEDURE" && (
              <div className="mt-3">
                <Select
                  label="Procedure"
                  required
                  value={treatmentId}
                  onChange={(e) => {
                    const t = treatments.find((x) => x.id === e.target.value);
                    setTreatmentId(e.target.value);
                    if (t) {
                      setDuration(String(t.duration));
                      // Pre-fill notes only if blank — don't clobber
                      // a receptionist's free-text instructions.
                      if (!notes.trim()) setNotes(t.name);
                    }
                  }}
                  placeholder={treatments.length ? "Select a procedure…" : "No procedures configured for this branch"}
                  options={treatments.map((t) => ({
                    value: t.id,
                    label: `${t.name} · ${t.duration}min · PKR ${Number(t.basePrice).toLocaleString()}`,
                  }))}
                  disabled={treatments.length === 0}
                  data-id="APPT-CREATE-TREATMENT"
                />
              </div>
            )}
          </div>

          {/* Doctor */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Stethoscope className="w-4 h-4 text-teal-500" />
              <span className="text-xs font-semibold text-stone-400 uppercase tracking-wider">Practitioner</span>
            </div>
            {/* Role tabs — exclusive selection. Filters the dropdown
                below to staff in the chosen bucket. Active branch is
                still applied; tabs that have zero matches are dimmed
                so the receptionist sees that the branch has no one
                in that role rather than a confusingly empty list. */}
            <div className="flex gap-1.5 mb-2">
              {([
                { v: UserRole.DOCTOR,       label: "Doctors" },
                { v: UserRole.AESTHETICIAN, label: "Aestheticians" },
                { v: UserRole.OPERATOR,     label: "Operators" },
              ] as const).map((opt) => {
                const count = allUsers.filter((u) => u.role === opt.v && (!branchId || u.branchId === branchId)).length;
                const active = practitionerRole === opt.v;
                return (
                  <button
                    key={opt.v}
                    type="button"
                    onClick={() => setPractitionerRole(opt.v)}
                    disabled={count === 0 && !active}
                    className={cn(
                      "px-2.5 py-1 rounded-full text-xs font-medium transition-colors cursor-pointer border",
                      active
                        ? "bg-teal-600 text-white border-teal-600"
                        : count === 0
                          ? "bg-stone-50 text-stone-300 border-stone-100 cursor-not-allowed"
                          : "bg-white text-stone-600 border-stone-200 hover:border-stone-300",
                    )}
                  >
                    {opt.label}
                    <span className={cn("ml-1.5 text-[10px]", active ? "opacity-80" : "opacity-50")}>{count}</span>
                  </button>
                );
              })}
            </div>
            <Select
              placeholder={`Select ${practitionerRole === UserRole.DOCTOR ? "doctor" : practitionerRole === UserRole.AESTHETICIAN ? "aesthetician" : "operator"}`}
              value={doctorId}
              onChange={(e) => setDoctorId(e.target.value)}
              options={sortedPractitioners.map((d) => ({
                value: d.id,
                label: d.name + (d.id === lastDoctor ? " (last seen)" : d.id === selectedPatient?.assignedDoctorId ? " (assigned)" : ""),
              }))}
            />
            {patientId && !doctorId && lastDoctor && practitioners.some((p) => p.id === lastDoctor) && (
              <p className="text-xs text-teal-600 mt-1">
                Patient last seen by {sortedPractitioners.find((d) => d.id === lastDoctor)?.name || "this practitioner"}
              </p>
            )}
          </div>

          {/* Date + Time */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Calendar className="w-4 h-4 text-amber-500" />
              <span className="text-xs font-semibold text-stone-400 uppercase tracking-wider">Date & Time</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <DatePicker value={date} onChange={(e) => setDate(e.target.value)} />
              <TimePicker value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
          </div>

          {/* Duration */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Clock className="w-4 h-4 text-amber-500" />
              <span className="text-xs font-semibold text-stone-400 uppercase tracking-wider">Duration</span>
            </div>
            <div className="flex gap-1.5">
              {["15", "20", "30", "45", "60"].map((d) => (
                <button key={d} onClick={() => setDuration(d)}
                  className={cn(
                    "flex-1 py-2 rounded-xl border text-xs font-medium transition-all cursor-pointer",
                    duration === d ? "border-amber-300 bg-amber-50 text-amber-700" : "border-stone-200 bg-white text-stone-500 hover:border-stone-300"
                  )}>{d} min</button>
              ))}
            </div>
          </div>

          {/* Room (optional) */}
          {availableRooms.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <MapPin className="w-4 h-4 text-emerald-500" />
                <span className="text-xs font-semibold text-stone-400 uppercase tracking-wider">Room (optional)</span>
              </div>
              <Select placeholder="Auto-assign" value={roomId} onChange={(e) => setRoomId(e.target.value)}
                options={[{ value: "", label: "Auto-assign" }, ...availableRooms.map((r) => ({ value: r.id, label: r.name }))]} />
            </div>
          )}

          {/* Notes */}
          <Input placeholder="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      )}
    </SlidePanel>
  );
}
