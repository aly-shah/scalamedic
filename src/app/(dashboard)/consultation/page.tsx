"use client";

import { useState } from "react";
import {
  AlertTriangle, Pill, Plus, Trash2, Stethoscope,
  FlaskConical, CalendarClock, CheckCircle, Phone, MessageSquare,
  FileText, Printer, Activity,
  Droplets, Sparkles, Clock, ChevronDown, ChevronUp, Sparkle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { LoadingSpinner } from "@/components/ui/loading";
import { SearchInput } from "@/components/ui/search-input";
import { DatePicker } from "@/components/ui/date-picker";
import {
  usePatients, usePatient, useAppointments, usePatientTriage, usePatientNotes,
  usePatientPrescriptions, useTreatments,
  useCreatePatientNote, useCreatePatientPrescription, useCreatePatientLabTest,
  useCreatePatientFollowUp, useUpdateAppointment,
} from "@/hooks/use-queries";
import { useRouter } from "next/navigation";
import { useModuleAccess, useModuleEmit } from "@/modules/core/hooks";
import { SystemEvents } from "@/modules/core/events";
import { useAuth } from "@/lib/auth-context";
import { cn, getClinicToday, toClinicDay, CLINIC_TZ, computeAge } from "@/lib/utils";
import type { Patient, Appointment, Triage, PatientAllergy } from "@/types";

interface RxRow { id: string; medicineName: string; dosage: string; frequency: string; duration: string; instructions: string; }

// ─── Helpers — defensive, handle both nested API shape and legacy flat ───
function patientAge(p: Patient): number | null {
  if (typeof p.age === "number") return p.age;
  return computeAge(p.dateOfBirth);
}
function patientDoctorName(p: Patient): string {
  return p.assignedDoctor?.name ?? p.assignedDoctorName ?? "—";
}
function patientAllergyList(p: Patient): { allergen: string; severity?: string }[] {
  const raw = p.allergies ?? [];
  return raw.map((a) =>
    typeof a === "string"
      ? { allergen: a }
      : { allergen: (a as PatientAllergy).allergen, severity: (a as PatientAllergy).severity }
  );
}

export default function ConsultationPage() {
  const router = useRouter();
  const access = useModuleAccess("MOD-CONSULTATION");
  const emit = useModuleEmit("MOD-CONSULTATION");
  const { user } = useAuth();

  // Data
  const { data: patientsRes, isLoading: pLoading } = usePatients();
  const patients = (patientsRes?.data || []) as Patient[];
  const today = getClinicToday();
  const { data: apptsRes } = useAppointments({ date: today });
  const todayAppts = (apptsRes?.data || []) as Appointment[];

  // Selection — read URL params on mount (full page navigation from patient profile)
  const [patientId, setPatientId] = useState(
    () => typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("patientId") || "" : ""
  );
  const [appointmentId, setAppointmentId] = useState(
    () => typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("appointmentId") || "" : ""
  );
  const [patientSearch, setPatientSearch] = useState("");
  // The general /api/patients list is paginated/filtered by branch, so a
  // patient navigated to from the doctor's "Continue" button may not be
  // in `patients`. Fetch them by id explicitly as a fallback so the
  // consultation actually opens to the right person.
  const { data: singlePatientRes } = usePatient(patientId);
  const singlePatient = (singlePatientRes?.data || null) as Patient | null;
  const selected = patients.find((p) => p.id === patientId) || singlePatient;
  const patientAppts = todayAppts.filter((a) => a.patientId === patientId);
  const linkedAppt = todayAppts.find((a) => a.id === appointmentId);

  // Triage
  const { data: triageRes } = usePatientTriage(patientId);
  const vitals = ((triageRes?.data || []) as Triage[])[0];

  // Patient history for autopopulation
  const { data: notesRes } = usePatientNotes(patientId);
  const pastNotes = ((notesRes?.data || []) as Record<string, unknown>[]);
  const lastNote = pastNotes[0];

  const { data: pastRxRes } = usePatientPrescriptions(patientId);
  const pastRx = ((pastRxRes?.data || []) as Record<string, unknown>[]);
  const lastRx = pastRx[0];
  const lastRxItems = (lastRx?.items as RxRow[]) || [];

  // Treatment catalog for suggestions
  const { data: treatmentsRes } = useTreatments();
  const treatments = ((treatmentsRes?.data || []) as { id: string; name: string; category: string; duration: number; basePrice: number }[]);

  // Diagnosis-to-suggestion mapping
  const DIAGNOSIS_SUGGESTIONS: Record<string, { treatments: string[]; rx: { medicineName: string; dosage: string; frequency: string; duration: string }[]; followUp: string; aftercare: string }> = {
    acne: { treatments: ["Chemical Peel", "LED Therapy", "Extraction"], rx: [{ medicineName: "Tretinoin Cream 0.025%", dosage: "Apply thin layer", frequency: "HS", duration: "8 weeks" }, { medicineName: "Clindamycin Gel 1%", dosage: "Apply to affected area", frequency: "BD", duration: "6 weeks" }], followUp: "2 weeks", aftercare: "Avoid sun exposure, use SPF 50+, gentle cleanser only" },
    melasma: { treatments: ["Chemical Peel", "Laser Toning"], rx: [{ medicineName: "Hydroquinone 4% Cream", dosage: "Apply to patches", frequency: "HS", duration: "12 weeks" }, { medicineName: "Sunscreen SPF 50+", dosage: "Apply generously", frequency: "TDS", duration: "Ongoing" }], followUp: "4 weeks", aftercare: "Strict sun protection, avoid heat exposure" },
    pigmentation: { treatments: ["Laser Toning", "Chemical Peel", "Microneedling"], rx: [{ medicineName: "Vitamin C Serum 20%", dosage: "Apply to face", frequency: "OD", duration: "Ongoing" }, { medicineName: "Kojic Acid Cream", dosage: "Apply at night", frequency: "HS", duration: "8 weeks" }], followUp: "4 weeks", aftercare: "SPF 50+ mandatory, avoid picking skin" },
    rosacea: { treatments: ["LED Therapy", "Gentle Facial"], rx: [{ medicineName: "Metronidazole Gel 0.75%", dosage: "Apply thin layer", frequency: "BD", duration: "8 weeks" }, { medicineName: "Azelaic Acid 15%", dosage: "Apply to affected area", frequency: "BD", duration: "12 weeks" }], followUp: "3 weeks", aftercare: "Avoid triggers: alcohol, spicy food, heat, harsh products" },
    "hair loss": { treatments: ["PRP Therapy", "Mesotherapy"], rx: [{ medicineName: "Minoxidil 5% Solution", dosage: "1ml to scalp", frequency: "BD", duration: "6 months" }, { medicineName: "Biotin 5000mcg", dosage: "1 tablet", frequency: "OD", duration: "3 months" }], followUp: "4 weeks", aftercare: "Gentle shampoo, avoid heat styling, massage scalp daily" },
    eczema: { treatments: ["Phototherapy"], rx: [{ medicineName: "Mometasone Cream 0.1%", dosage: "Apply thin layer", frequency: "BD", duration: "2 weeks" }, { medicineName: "Cetaphil Moisturizer", dosage: "Apply liberally", frequency: "TDS", duration: "Ongoing" }], followUp: "2 weeks", aftercare: "Moisturize frequently, avoid irritants, cotton clothing" },
  };

  // Visit status
  const [visitStatus, setVisitStatus] = useState<"not_started" | "in_progress" | "completed">("not_started");

  // Snapshot collapsed on mobile
  const [showSnapshot, setShowSnapshot] = useState(false);

  // Section tracking for progress
  const [activeSection, setActiveSection] = useState("complaint");

  // Clinical note
  const [complaint, setComplaint] = useState("");
  const [findings, setFindings] = useState("");
  const [diagnosis, setDiagnosis] = useState("");
  const [plan, setPlan] = useState("");
  const [advice, setAdvice] = useState("");
  const [internalNotes, setInternalNotes] = useState("");

  // Prescriptions
  const [rxRows, setRxRows] = useState<RxRow[]>([]);
  const addRx = () => setRxRows((prev) => [...prev, { id: crypto.randomUUID(), medicineName: "", dosage: "", frequency: "", duration: "", instructions: "" }]);
  const updateRx = (id: string, field: keyof RxRow, value: string) => setRxRows((prev) => prev.map((r) => r.id === id ? { ...r, [field]: value } : r));
  const removeRx = (id: string) => setRxRows((prev) => prev.filter((r) => r.id !== id));

  // Procedures
  const [procedures, setProcedures] = useState<{ id: string; name: string; area: string; notes: string }[]>([]);
  const addProcedure = () => setProcedures((prev) => [...prev, { id: crypto.randomUUID(), name: "", area: "", notes: "" }]);

  // Lab
  const [labTest, setLabTest] = useState("");

  // Follow-up
  const [followUpDate, setFollowUpDate] = useState("");
  const [followUpNotes, setFollowUpNotes] = useState("");

  // Saving
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  // Match diagnosis to suggestions
  const diagnosisKey = diagnosis.toLowerCase().trim();
  const suggestions = Object.entries(DIAGNOSIS_SUGGESTIONS).find(([key]) => diagnosisKey.includes(key))?.[1] || null;

  // Mutations
  const createNote = useCreatePatientNote(patientId);
  const createRx = useCreatePatientPrescription(patientId);
  const createLab = useCreatePatientLabTest(patientId);
  const createFollowUp = useCreatePatientFollowUp(patientId);
  const updateAppt = useUpdateAppointment();

  const handleComplete = async () => {
    if (!patientId) { setError("Select a patient"); return; }
    if (!complaint.trim() && !diagnosis.trim()) { setError("Add at least a complaint or diagnosis"); return; }
    setError(""); setSaving(true);

    try {
      // Save note
      await createNote.mutateAsync({
        appointmentId: appointmentId || undefined, doctorId: user?.id,
        chiefComplaint: complaint.trim() || undefined, examination: findings.trim() || undefined,
        diagnosis: diagnosis.trim() || undefined, treatmentPlan: plan.trim() || undefined,
        advice: advice.trim() || undefined, internalNotes: internalNotes.trim() || undefined,
      });

      // Save prescriptions
      const validRx = rxRows.filter((r) => r.medicineName.trim());
      if (validRx.length > 0) {
        await createRx.mutateAsync({
          doctorId: user?.id, appointmentId: appointmentId || undefined,
          items: validRx.map((r) => ({ medicineName: r.medicineName.trim(), dosage: r.dosage.trim() || undefined, frequency: r.frequency || undefined, duration: r.duration.trim() || undefined, instructions: r.instructions.trim() || undefined })),
        });
      }

      // Lab test
      if (labTest.trim()) {
        await createLab.mutateAsync({ doctorId: user?.id, appointmentId: appointmentId || undefined, testName: labTest.trim() });
      }

      // Follow-up
      if (followUpDate) {
        await createFollowUp.mutateAsync({ doctorId: user?.id, appointmentId: appointmentId || undefined, dueDate: followUpDate, reason: diagnosis.trim() || "Follow-up" });
      }

      // Update appointment
      if (appointmentId) {
        await updateAppt.mutateAsync({ id: appointmentId, data: { status: "COMPLETED", workflowStage: "BILLING" } });
      }

      emit(SystemEvents.CONSULTATION_COMPLETED, {
        patientName: selected ? `${selected.firstName} ${selected.lastName}` : "", diagnosis: diagnosis.trim(),
      }, { patientId, appointmentId: appointmentId || undefined });

      setVisitStatus("completed"); setSaved(true);
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to save"); }
    finally { setSaving(false); }
  };

  if (!access.canView) return <div className="flex items-center justify-center py-20 text-stone-500">No access.</div>;
  if (pLoading) return <div className="flex items-center justify-center py-20"><LoadingSpinner size="lg" /></div>;

  const genderShort = (g: string) => g === "MALE" ? "M" : g === "FEMALE" ? "F" : "O";

  // Visit summary counts
  const rxCount = rxRows.filter((r) => r.medicineName.trim()).length;
  const procCount = procedures.filter((p) => p.name.trim()).length;

  return (
    <div data-id="FLOW-CONSULT" className="max-w-7xl mx-auto">

      {/* ===== STICKY HEADER ===== */}
      <div className="sticky top-16 z-10 bg-[#FAFAF9] -mx-5 px-5 sm:-mx-8 sm:px-8 lg:-mx-10 lg:px-10 xl:-mx-12 xl:px-12 py-2.5 border-b border-stone-100/80">
        <div className="flex items-center gap-3">
          {/* Patient selector or info */}
          {!selected ? (
            <div className="flex-1 relative">
              <SearchInput
                placeholder="Search patient by name, phone, or ID..."
                value={patientSearch}
                onChange={setPatientSearch}
                debounceMs={150}
              />
              {patientSearch.length >= 2 && (
                <div className="absolute top-full left-0 right-0 z-30 mt-1 bg-white rounded-xl border border-stone-200 shadow-lg max-h-64 overflow-y-auto">
                  {patients.filter((p) =>
                    `${p.firstName} ${p.lastName}`.toLowerCase().includes(patientSearch.toLowerCase()) ||
                    (p.phone || "").includes(patientSearch) ||
                    p.patientCode.toLowerCase().includes(patientSearch.toLowerCase())
                  ).slice(0, 8).map((p) => (
                    <button key={p.id} onClick={() => { setPatientId(p.id); setPatientSearch(""); setVisitStatus("not_started"); setSaved(false); }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-stone-50 transition-colors text-left cursor-pointer border-b border-stone-50 last:border-b-0">
                      <Avatar name={`${p.firstName} ${p.lastName}`} size="sm" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-stone-900">{p.firstName} {p.lastName}</p>
                        <p className="text-xs text-stone-400">{p.patientCode} &middot; {p.phone}</p>
                      </div>
                    </button>
                  ))}
                  {patients.filter((p) =>
                    `${p.firstName} ${p.lastName}`.toLowerCase().includes(patientSearch.toLowerCase()) ||
                    (p.phone || "").includes(patientSearch) ||
                    p.patientCode.toLowerCase().includes(patientSearch.toLowerCase())
                  ).length === 0 && (
                    <div className="py-4 text-center text-sm text-stone-400">No patients found</div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <>
              <Avatar name={`${selected.firstName} ${selected.lastName}`} size="md" className="ring-2 ring-teal-200 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-bold text-stone-900 truncate">{selected.firstName} {selected.lastName}</span>
                  <span className="text-[10px] text-stone-400 font-mono">{selected.patientCode}</span>
                  <span className="text-[10px] text-stone-400">
                    {patientAge(selected) != null ? `${patientAge(selected)}y / ` : ""}{genderShort(selected.gender)}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-[11px] text-stone-400 mt-0.5">
                  {linkedAppt && <><Badge variant="info" className="text-[9px]">{linkedAppt.type.replace("_", " ")}</Badge><span>{linkedAppt.startTime}</span></>}
                  <Badge variant={visitStatus === "completed" ? "success" : visitStatus === "in_progress" ? "warning" : "default"} className="text-[9px]" dot>
                    {visitStatus === "completed" ? "Completed" : visitStatus === "in_progress" ? "In Progress" : "Not Started"}
                  </Badge>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <a href={`tel:${selected.phone || ""}`} className="w-8 h-8 rounded-lg bg-teal-50 text-teal-600 flex items-center justify-center"><Phone className="w-3.5 h-3.5" /></a>
                <a href={`https://wa.me/${(selected.phone || "").replace(/[^0-9]/g, "")}`} target="_blank" rel="noopener noreferrer"
                  className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center"><MessageSquare className="w-3.5 h-3.5" /></a>
                <button onClick={() => { setPatientId(""); setAppointmentId(""); }} className="w-8 h-8 rounded-lg bg-stone-100 text-stone-400 flex items-center justify-center cursor-pointer text-xs font-bold">x</button>
              </div>
            </>
          )}
        </div>
        {/* Appointment selector */}
        {selected && patientAppts.length > 0 && !appointmentId && (
          <div className="mt-2">
            <Select placeholder="Link to today's appointment..." value={appointmentId}
              onChange={(e) => { setAppointmentId(e.target.value); setVisitStatus("in_progress"); }}
              options={patientAppts.map((a) => ({ value: a.id, label: `${a.startTime} — ${a.type.replace("_", " ")} (${a.status.replace("_", " ")})` }))} />
          </div>
        )}
      </div>

      {saved ? (
        <div className="flex flex-col items-center justify-center py-16 animate-fade-in">
          <CheckCircle className="w-16 h-16 text-emerald-500 mb-4" />
          <h2 className="text-xl font-bold text-stone-900">Visit Completed</h2>
          <p className="text-sm text-stone-500 mt-1">Notes, prescriptions, and billing items have been saved</p>
          <div className="flex gap-2 mt-5">
            <Button variant="outline" onClick={() => { setPatientId(""); setSaved(false); setComplaint(""); setFindings(""); setDiagnosis(""); setPlan(""); setAdvice(""); setInternalNotes(""); setRxRows([]); setProcedures([]); setLabTest(""); setFollowUpDate(""); setFollowUpNotes(""); setVisitStatus("not_started"); }}>
              Next Patient
            </Button>
          </div>
        </div>
      ) : !selected ? (
        <div className="flex flex-col items-center justify-center py-20">
          <Stethoscope className="w-12 h-12 text-stone-300 mb-3" />
          <p className="text-sm text-stone-400">Select a patient to start consultation</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 mt-3">

          {/* ===== LEFT — Patient Snapshot ===== */}
          <div className="lg:col-span-3">
            {/* Mobile toggle */}
            <button onClick={() => setShowSnapshot(!showSnapshot)} className="lg:hidden w-full flex items-center justify-between px-3 py-2 bg-white rounded-xl border border-stone-200 text-xs font-medium text-stone-600 mb-2 cursor-pointer">
              Patient Summary {showSnapshot ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>

            <div className={cn("space-y-3", !showSnapshot && "hidden lg:block")}>
              {/* Patient Identity */}
              <Card>
                <CardContent className="p-3">
                  <div className="flex items-center gap-2.5 mb-2">
                    <Avatar name={`${selected.firstName} ${selected.lastName}`} size="md" className="ring-2 ring-teal-100" />
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-stone-900 truncate">{selected.firstName} {selected.lastName}</p>
                      <p className="text-[10px] text-stone-400">
                        {selected.patientCode} &middot;{" "}
                        {patientAge(selected) != null ? `${patientAge(selected)}y / ` : ""}{genderShort(selected.gender)}
                      </p>
                    </div>
                  </div>
                  <div className="space-y-1 text-[11px] text-stone-500">
                    <div className="flex items-center justify-between"><span className="text-stone-400">Doctor</span><span className="font-medium text-stone-700">{patientDoctorName(selected)}</span></div>
                    <div className="flex items-center justify-between"><span className="text-stone-400">Phone</span><span className="text-stone-700">{selected.phone}</span></div>
                    {selected.email && <div className="flex items-center justify-between"><span className="text-stone-400">Email</span><span className="text-stone-700 truncate ml-3">{selected.email}</span></div>}
                  </div>
                </CardContent>
              </Card>

              {/* Alerts — allergies are PatientAllergy objects from the API,
                  but legacy mocks shipped string[]. patientAllergyList()
                  normalises to {allergen, severity?} so the badge always
                  renders the right label. */}
              {(() => {
                const allergies = patientAllergyList(selected);
                const showAlerts = allergies.length > 0 || selected.bloodType || selected.skinType;
                if (!showAlerts) return null;
                return (
                  <div className="bg-red-50 rounded-xl border border-red-100 p-2.5 flex flex-wrap gap-1">
                    {allergies.map((a, i) => (
                      <Badge
                        key={`${a.allergen}-${i}`}
                        variant={a.severity === "SEVERE" ? "danger" : "warning"}
                        className="text-[10px]"
                      >
                        <AlertTriangle className="w-2.5 h-2.5 mr-0.5" />
                        {a.allergen}
                      </Badge>
                    ))}
                    {selected.bloodType && <Badge variant="info" className="text-[10px]"><Droplets className="w-2.5 h-2.5 mr-0.5" />{selected.bloodType}</Badge>}
                    {selected.skinType && <Badge variant="purple" className="text-[10px]"><Sparkles className="w-2.5 h-2.5 mr-0.5" />Fitz {(selected.skinType || "").replace("TYPE_", "")}</Badge>}
                  </div>
                );
              })()}

              {/* Vitals */}
              {vitals && (
                <Card>
                  <CardHeader><div className="flex items-center gap-1.5"><Activity className="w-3.5 h-3.5 text-teal-500" /><span className="text-xs font-semibold">Latest Vitals</span></div></CardHeader>
                  <CardContent className="p-3 pt-0 grid grid-cols-2 gap-1.5">
                    {vitals.systolicBP && vitals.diastolicBP && <VitalChip label="BP" value={`${vitals.systolicBP}/${vitals.diastolicBP}`} />}
                    {vitals.heartRate && <VitalChip label="HR" value={`${vitals.heartRate}`} />}
                    {vitals.temperature && <VitalChip label="Temp" value={`${Math.round(Number(vitals.temperature))}°C`} />}
                    {vitals.weight && <VitalChip label="Wt" value={`${Math.round(Number(vitals.weight))}kg`} />}
                    {vitals.oxygenSaturation && <VitalChip label="SpO2" value={`${Math.round(Number(vitals.oxygenSaturation))}%`} />}
                    {vitals.bmi && <VitalChip label="BMI" value={`${Number(vitals.bmi).toFixed(1)}`} />}
                  </CardContent>
                </Card>
              )}

              {/* Past Visits */}
              {pastNotes.length > 0 && (
                <Card>
                  <CardHeader><div className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5 text-blue-500" /><span className="text-xs font-semibold">Recent Visits ({pastNotes.length})</span></div></CardHeader>
                  <CardContent className="p-2 pt-0 space-y-1">
                    {pastNotes.slice(0, 4).map((note, i) => (
                      <div key={i} className="bg-stone-50 rounded-lg p-2 text-[11px]">
                        {note.diagnosis != null && <p className="font-medium text-stone-700 truncate">Dx: {String(note.diagnosis)}</p>}
                        {note.chiefComplaint != null && <p className="text-stone-400 truncate">CC: {String(note.chiefComplaint)}</p>}
                        <p className="text-[9px] text-stone-300 mt-0.5">{note.createdAt ? new Date(String(note.createdAt)).toLocaleDateString("en-PK", { month: "short", day: "numeric", timeZone: CLINIC_TZ }) : ""}</p>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {/* Past Prescriptions */}
              {pastRx.length > 0 && (
                <Card>
                  <CardHeader><div className="flex items-center gap-1.5"><Pill className="w-3.5 h-3.5 text-emerald-500" /><span className="text-xs font-semibold">Recent Rx ({pastRx.length})</span></div></CardHeader>
                  <CardContent className="p-2 pt-0 space-y-1">
                    {pastRx.slice(0, 3).map((rx, i) => {
                      const items = (rx.items as RxRow[]) || [];
                      return (
                        <div key={i} className="bg-emerald-50/50 rounded-lg p-2 text-[11px]">
                          {items.slice(0, 2).map((item, j) => (
                            <p key={j} className="text-stone-600 truncate">{item.medicineName} <span className="text-stone-400">{item.dosage}</span></p>
                          ))}
                          {items.length > 2 && <p className="text-stone-400">+{items.length - 2} more</p>}
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>
              )}

              {/* Quick Profile Link */}
              <button onClick={() => router.push(`/patients/${patientId}`)}
                className="w-full text-[11px] text-teal-600 font-medium hover:text-teal-700 hover:underline cursor-pointer py-1 text-center">
                View Full Profile &rarr;
              </button>
            </div>
          </div>

          {/* ===== CENTER — Live Consultation Workspace ===== */}
          <div className="lg:col-span-6 space-y-3">
            {error && <div className="bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl px-4 py-2.5">{error}</div>}

            {/* Section Progress */}
            <div className="hidden xl:flex items-center gap-1.5 text-[10px] font-medium">
              {["Complaint", "Findings", "Diagnosis", "Plan", "Rx", "Procedures", "Follow-Up"].map((s, i) => {
                const filled = [complaint, findings, diagnosis, plan, rxRows.length > 0 ? "y" : "", procedures.length > 0 ? "y" : "", followUpDate][i];
                return (
                  <div key={s} className="flex items-center gap-1">
                    <span className={cn("w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold",
                      filled ? "bg-teal-500 text-white" : "bg-stone-200 text-stone-500"
                    )}>{i + 1}</span>
                    <span className={filled ? "text-teal-700" : "text-stone-400"}>{s}</span>
                    {i < 6 && <span className="text-stone-300 mx-0.5">—</span>}
                  </div>
                );
              })}
            </div>

            {/* Last Visit Context */}
            {lastNote && (
              <div className="bg-blue-50/50 rounded-xl border border-blue-100 p-3">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-semibold text-blue-600 uppercase tracking-wider">Last Visit Summary</span>
                  <button onClick={() => { if (lastNote.diagnosis) setDiagnosis(String(lastNote.diagnosis)); if (lastNote.chiefComplaint) setComplaint(String(lastNote.chiefComplaint)); }}
                    className="text-[10px] text-blue-600 font-medium hover:underline cursor-pointer">Reuse</button>
                </div>
                {lastNote.chiefComplaint != null && <p className="text-xs text-stone-600"><span className="font-medium text-stone-500">CC:</span> {String(lastNote.chiefComplaint)}</p>}
                {lastNote.diagnosis != null && <p className="text-xs text-stone-600 mt-0.5"><span className="font-medium text-stone-500">Dx:</span> {String(lastNote.diagnosis)}</p>}
                {lastNote.treatmentPlan != null && <p className="text-xs text-stone-600 mt-0.5"><span className="font-medium text-stone-500">Plan:</span> {String(lastNote.treatmentPlan)}</p>}
              </div>
            )}

            {/* Chief Complaint */}
            <Card>
              <CardHeader><span className="text-sm font-semibold text-stone-900">Chief Complaint</span></CardHeader>
              <CardContent className="p-4 pt-0 space-y-2.5">
                <Textarea placeholder="Why is the patient here today..." rows={2} value={complaint} onChange={(e) => { setComplaint(e.target.value); if (visitStatus === "not_started") setVisitStatus("in_progress"); }} />
                {/* Quick complaint chips */}
                <div className="flex flex-wrap gap-1">
                  {["Acne flare-up", "Pigmentation", "Hair loss", "Follow-up review", "Rosacea", "Melasma", "Eczema", "Scar treatment", "Anti-aging"].map((c) => (
                    <button key={c} onClick={() => setComplaint(c)}
                      className={cn("px-2 py-0.5 rounded-md text-[10px] font-medium cursor-pointer transition-all border",
                        complaint === c ? "border-teal-300 bg-teal-50 text-teal-700" : "border-stone-200 text-stone-400 hover:border-stone-300 hover:text-stone-600"
                      )}>{c}</button>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Clinical Notes */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between w-full">
                  <span className="text-sm font-semibold text-stone-900">Clinical Notes</span>
                  {/* Voice transcription lives on /ai (real Whisper recorder) — link
                      there instead of stubbing a fake mic button here. */}
                  <button
                    onClick={() => router.push(`/ai?patientId=${patientId}`)}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium cursor-pointer bg-indigo-50 text-indigo-600 border border-indigo-100 hover:bg-indigo-100"
                    title="Record + transcribe with Whisper"
                  >
                    <Sparkle className="w-3 h-3" /> Voice → AI
                  </button>
                </div>
              </CardHeader>
              <CardContent className="p-4 pt-0 space-y-2.5">
                <Textarea label="Findings / Examination" placeholder="Clinical findings..." rows={2} value={findings} onChange={(e) => setFindings(e.target.value)} />
                <Textarea label="Diagnosis" placeholder="Primary diagnosis..." rows={2} value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} />
                {/* Diagnosis chips */}
                <div className="flex flex-wrap gap-1">
                  {["Acne vulgaris", "Melasma", "Pigmentation", "Rosacea", "Hair loss", "Eczema", "Post-inflammatory hyperpigmentation", "Aging skin"].map((d) => (
                    <button key={d} onClick={() => setDiagnosis(d)}
                      className={cn("px-2 py-0.5 rounded-md text-[10px] font-medium cursor-pointer transition-all border",
                        diagnosis === d ? "border-violet-300 bg-violet-50 text-violet-700" : "border-stone-200 text-stone-400 hover:border-stone-300"
                      )}>{d}</button>
                  ))}
                </div>
                {/* AI Suggestions based on diagnosis */}
                {suggestions && (
                  <div className="bg-gradient-to-r from-indigo-50/50 to-violet-50/50 rounded-xl border border-indigo-100 p-3 space-y-2 animate-fade-in">
                    <div className="flex items-center gap-1.5">
                      <Sparkle className="w-3.5 h-3.5 text-indigo-500" />
                      <span className="text-[10px] font-semibold text-indigo-600 uppercase tracking-wider">Suggested for {diagnosisKey}</span>
                    </div>
                    {suggestions.treatments.length > 0 && (
                      <div>
                        <span className="text-[10px] text-stone-500">Treatments:</span>
                        <div className="flex flex-wrap gap-1 mt-0.5">
                          {suggestions.treatments.map((t) => (
                            <button key={t} onClick={() => setProcedures((prev) => [...prev, { id: crypto.randomUUID(), name: t, area: "", notes: "" }])}
                              className="px-2 py-0.5 rounded-md text-[10px] font-medium border border-indigo-200 text-indigo-600 hover:bg-indigo-50 cursor-pointer">{t}</button>
                          ))}
                        </div>
                      </div>
                    )}
                    {suggestions.rx.length > 0 && (
                      <div>
                        <span className="text-[10px] text-stone-500">Prescriptions:</span>
                        <button onClick={() => setRxRows(suggestions.rx.map((r) => ({ id: crypto.randomUUID(), ...r, instructions: "" })))}
                          className="ml-1.5 text-[10px] text-indigo-600 font-medium hover:underline cursor-pointer">Apply suggested Rx</button>
                      </div>
                    )}
                    {suggestions.aftercare && (
                      <div>
                        <span className="text-[10px] text-stone-500">Aftercare:</span>
                        <button onClick={() => setAdvice(suggestions.aftercare)}
                          className="ml-1.5 text-[10px] text-indigo-600 font-medium hover:underline cursor-pointer">Use as advice</button>
                      </div>
                    )}
                    {suggestions.followUp && (
                      <div>
                        <span className="text-[10px] text-stone-500">Follow-up:</span>
                        <button onClick={() => {
                          const weeks = parseInt(suggestions.followUp) || 2;
                          const d = new Date(); d.setDate(d.getDate() + weeks * 7);
                          setFollowUpDate(toClinicDay(d));
                        }} className="ml-1.5 text-[10px] text-indigo-600 font-medium hover:underline cursor-pointer">Set {suggestions.followUp}</button>
                      </div>
                    )}
                  </div>
                )}
                <Textarea label="Treatment Plan" placeholder="Recommended treatment..." rows={2} value={plan} onChange={(e) => setPlan(e.target.value)} />
                <Textarea label="Advice" placeholder="Patient instructions..." rows={2} value={advice} onChange={(e) => setAdvice(e.target.value)} />
                <Textarea label="Internal Notes" placeholder="Private notes (not visible to patient)..." rows={1} value={internalNotes} onChange={(e) => setInternalNotes(e.target.value)} />
              </CardContent>
            </Card>

            {/* Prescriptions */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center gap-2"><Pill className="w-4 h-4 text-emerald-500" /><span className="text-sm font-semibold text-stone-900">Prescriptions</span></div>
                  <div className="flex items-center gap-1.5">
                    {lastRxItems.length > 0 && (
                      <button onClick={() => setRxRows(lastRxItems.map((r) => ({ ...r, id: crypto.randomUUID() })))}
                        className="text-[10px] text-emerald-600 font-medium hover:underline cursor-pointer">Repeat Last Rx</button>
                    )}
                    <Button size="sm" variant="ghost" iconLeft={<Plus className="w-3.5 h-3.5" />} onClick={addRx}>Add</Button>
                  </div>
                </div>
              </CardHeader>
              {rxRows.length > 0 && (
                <CardContent className="p-3 pt-0 space-y-2">
                  {rxRows.map((r, i) => (
                    <div key={r.id} className="bg-stone-50 rounded-xl p-3 border border-stone-100 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-stone-400 font-semibold">Rx {i + 1}</span>
                        <button onClick={() => removeRx(r.id)} className="text-red-400 hover:text-red-600 cursor-pointer"><Trash2 className="w-3 h-3" /></button>
                      </div>
                      <Input placeholder="Medicine name" value={r.medicineName} onChange={(e) => updateRx(r.id, "medicineName", e.target.value)} />
                      <div className="grid grid-cols-2 gap-2">
                        <Input placeholder="Dosage" value={r.dosage} onChange={(e) => updateRx(r.id, "dosage", e.target.value)} />
                        <Select placeholder="Frequency" value={r.frequency} onChange={(e) => updateRx(r.id, "frequency", e.target.value)}
                          options={[{ value: "OD", label: "OD" }, { value: "BD", label: "BD" }, { value: "TDS", label: "TDS" }, { value: "QDS", label: "QDS" }, { value: "PRN", label: "PRN" }, { value: "HS", label: "Bedtime" }]} />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <Input placeholder="Duration (e.g. 7 days)" value={r.duration} onChange={(e) => updateRx(r.id, "duration", e.target.value)} />
                        <Input placeholder="Instructions" value={r.instructions} onChange={(e) => updateRx(r.id, "instructions", e.target.value)} />
                      </div>
                    </div>
                  ))}
                </CardContent>
              )}
            </Card>

            {/* Procedures */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center gap-2"><Stethoscope className="w-4 h-4 text-violet-500" /><span className="text-sm font-semibold text-stone-900">Procedures</span></div>
                  <Button size="sm" variant="ghost" iconLeft={<Plus className="w-3.5 h-3.5" />} onClick={addProcedure}>Add</Button>
                </div>
              </CardHeader>
              {/* Treatment catalog quick-add */}
              {treatments.length > 0 && procedures.length === 0 && (
                <CardContent className="p-3 pt-0">
                  <p className="text-[10px] text-stone-400 mb-1.5">Quick add from catalog:</p>
                  <div className="flex flex-wrap gap-1">
                    {treatments.slice(0, 8).map((t) => (
                      <button key={t.id} onClick={() => setProcedures([{ id: crypto.randomUUID(), name: t.name, area: "", notes: "" }])}
                        className="px-2 py-0.5 rounded-md text-[10px] font-medium border border-violet-200 text-violet-600 hover:bg-violet-50 cursor-pointer">{t.name}</button>
                    ))}
                  </div>
                </CardContent>
              )}
              {procedures.length > 0 && (
                <CardContent className="p-3 pt-0 space-y-2">
                  {procedures.map((p) => (
                    <div key={p.id} className="bg-violet-50/50 rounded-xl p-3 border border-violet-100 space-y-2">
                      <Input placeholder="Procedure / service name" value={p.name} onChange={(e) => setProcedures((prev) => prev.map((x) => x.id === p.id ? { ...x, name: e.target.value } : x))} />
                      <div className="grid grid-cols-2 gap-2">
                        <Input placeholder="Area treated" value={p.area} onChange={(e) => setProcedures((prev) => prev.map((x) => x.id === p.id ? { ...x, area: e.target.value } : x))} />
                        <Input placeholder="Notes" value={p.notes} onChange={(e) => setProcedures((prev) => prev.map((x) => x.id === p.id ? { ...x, notes: e.target.value } : x))} />
                      </div>
                    </div>
                  ))}
                </CardContent>
              )}
            </Card>

            {/* Lab + Follow-Up (compact) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Card>
                <CardHeader><div className="flex items-center gap-2"><FlaskConical className="w-4 h-4 text-sky-500" /><span className="text-sm font-semibold">Lab Order</span></div></CardHeader>
                <CardContent className="p-3 pt-0">
                  <Input placeholder="Test name (e.g. CBC, Patch Test)" value={labTest} onChange={(e) => setLabTest(e.target.value)} />
                </CardContent>
              </Card>
              <Card>
                <CardHeader><div className="flex items-center gap-2"><CalendarClock className="w-4 h-4 text-amber-500" /><span className="text-sm font-semibold">Follow-Up</span></div></CardHeader>
                <CardContent className="p-3 pt-0 space-y-2">
                  <DatePicker value={followUpDate} onChange={(e) => setFollowUpDate(e.target.value)} />
                  <div className="flex gap-1 flex-wrap">
                    {[{ l: "1 wk", d: 7 }, { l: "2 wk", d: 14 }, { l: "1 mo", d: 30 }, { l: "3 mo", d: 90 }].map((p) => (
                      <button key={p.l} onClick={() => { const d = new Date(); d.setDate(d.getDate() + p.d); setFollowUpDate(toClinicDay(d)); }}
                        className="px-2 py-1 text-[10px] rounded-md border border-stone-200 text-stone-500 hover:border-teal-300 hover:text-teal-600 cursor-pointer transition-all">{p.l}</button>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* ===== RIGHT — Action Rail ===== */}
          <div className="lg:col-span-3 space-y-3">
            {/* Visit Summary */}
            <Card className="bg-gradient-to-br from-stone-50 to-teal-50/30">
              <CardContent className="p-4">
                <p className="text-xs font-semibold text-stone-400 uppercase tracking-wider mb-2.5">Visit Summary</p>
                <div className="space-y-1.5 text-xs">
                  <div className="flex items-center justify-between"><span className="text-stone-500">Notes</span><Badge variant={complaint || diagnosis ? "success" : "default"} className="text-[9px]">{complaint || diagnosis ? "Added" : "Empty"}</Badge></div>
                  <div className="flex items-center justify-between"><span className="text-stone-500">Prescriptions</span><span className="font-bold text-stone-900">{rxCount}</span></div>
                  <div className="flex items-center justify-between"><span className="text-stone-500">Procedures</span><span className="font-bold text-stone-900">{procCount}</span></div>
                  <div className="flex items-center justify-between"><span className="text-stone-500">Lab Orders</span><span className="font-bold text-stone-900">{labTest.trim() ? 1 : 0}</span></div>
                  <div className="flex items-center justify-between"><span className="text-stone-500">Follow-Up</span><Badge variant={followUpDate ? "info" : "default"} className="text-[9px]">{followUpDate || "None"}</Badge></div>
                </div>
              </CardContent>
            </Card>

            {/* Billing Handoff */}
            <Card className="border-amber-200 bg-amber-50/30">
              <CardContent className="p-4">
                <p className="text-xs font-semibold text-amber-700 uppercase tracking-wider mb-2">Billing Handoff</p>
                <p className="text-[11px] text-amber-600">
                  {rxCount > 0 || procCount > 0
                    ? `${rxCount} prescription${rxCount !== 1 ? "s" : ""}, ${procCount} procedure${procCount !== 1 ? "s" : ""} will be sent to billing`
                    : "No billable items yet"}
                </p>
              </CardContent>
            </Card>

            {/* Quick Actions — Print Rx is disabled until the visit is saved
                (the prescription doesn't exist yet). Add Image / Documents
                navigate to the patient's profile docs tab. */}
            <Card>
              <CardContent className="p-2 space-y-0.5">
                <button
                  onClick={() => router.push(`/vitals?patientId=${patientId}`)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-stone-600 hover:bg-stone-50 cursor-pointer transition-colors"
                >
                  <Activity className="w-3.5 h-3.5 text-teal-500" />
                  Record Vitals
                </button>
                <button
                  onClick={() => router.push(`/patients/${patientId}`)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-stone-600 hover:bg-stone-50 cursor-pointer transition-colors"
                >
                  <FileText className="w-3.5 h-3.5 text-blue-500" />
                  Patient Documents
                </button>
                <button
                  type="button"
                  disabled
                  title="Save the visit first to print the Rx"
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-stone-300 cursor-not-allowed"
                >
                  <Printer className="w-3.5 h-3.5 text-stone-300" />
                  Print Rx
                  <span className="ml-auto text-[9px] text-stone-300">save first</span>
                </button>
              </CardContent>
            </Card>

            {/* Complete Button */}
            <Button className="w-full rounded-xl py-3" iconLeft={<CheckCircle className="w-4 h-4" />}
              onClick={handleComplete} disabled={saving || !patientId}>
              {saving ? "Saving..." : "Complete & Send to Billing"}
            </Button>
          </div>
        </div>
      )}

      {/* ===== MOBILE BOTTOM BAR ===== */}
      {selected && !saved && (
        <div className="fixed bottom-0 left-0 right-0 lg:hidden bg-white border-t border-stone-200 px-4 py-2.5 flex items-center gap-2 z-30">
          <Button size="sm" variant="outline" className="flex-1" iconLeft={<Pill className="w-3.5 h-3.5" />} onClick={addRx}>Rx</Button>
          <Button size="sm" variant="outline" className="flex-1" iconLeft={<Stethoscope className="w-3.5 h-3.5" />} onClick={addProcedure}>Proc</Button>
          <Button size="sm" className="flex-1" iconLeft={<CheckCircle className="w-3.5 h-3.5" />} onClick={handleComplete} disabled={saving}>
            {saving ? "..." : "Complete"}
          </Button>
        </div>
      )}
    </div>
  );
}

function VitalChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white rounded-lg border border-stone-100 px-2.5 py-1.5 text-center">
      <p className="text-[9px] text-stone-400 uppercase">{label}</p>
      <p className="text-sm font-bold text-stone-900">{value}</p>
    </div>
  );
}
