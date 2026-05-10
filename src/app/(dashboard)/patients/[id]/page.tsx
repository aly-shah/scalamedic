"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Phone, MessageSquare, Pencil, AlertTriangle, Droplets,
  Sparkles, User, DollarSign, Plus, X, Tag, FileText, Pill,
  Stethoscope, Activity, CalendarClock, Heart, Calendar, Clock,
  ChevronRight, Receipt, Eye, MoreVertical, UserMinus, Trash2, RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { LoadingSpinner } from "@/components/ui/loading";
import { usePatient, usePatientTags, usePatientBilling, useAddPatientTag, useRemovePatientTag, useDeletePatient, useHardDeletePatient, useRestorePatient } from "@/hooks/use-queries";
import { DropdownMenu } from "@/components/ui/dropdown";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useAuth } from "@/lib/auth-context";
import { formatDate, calculateAge, patientAllergyLabels } from "@/lib/utils";
import { useFormatCurrency } from "@/hooks/use-format-currency";
import { useModuleAccess } from "@/modules/core/hooks";
import { ModuleActionGate } from "@/modules/core/components";
import { cn } from "@/lib/utils";
import Link from "next/link";

import { lazy, Suspense } from "react";
import { LoadingSpinner as TabSpinner } from "@/components/ui/loading";

// Lazy-load tabs — only the active tab's code is downloaded
const OverviewTab = lazy(() => import("@/components/patients/tabs/overview-tab").then((m) => ({ default: m.OverviewTab })));
const AppointmentsTab = lazy(() => import("@/components/patients/tabs/appointments-tab").then((m) => ({ default: m.AppointmentsTab })));
const MedicalHistoryTab = lazy(() => import("@/components/patients/tabs/medical-history-tab").then((m) => ({ default: m.MedicalHistoryTab })));
const SkinHistoryTab = lazy(() => import("@/components/patients/tabs/skin-history-tab").then((m) => ({ default: m.SkinHistoryTab })));
const NotesTab = lazy(() => import("@/components/patients/tabs/notes-tab").then((m) => ({ default: m.NotesTab })));
const ProceduresTab = lazy(() => import("@/components/patients/tabs/procedures-tab").then((m) => ({ default: m.ProceduresTab })));
const PrescriptionsTab = lazy(() => import("@/components/patients/tabs/prescriptions-tab").then((m) => ({ default: m.PrescriptionsTab })));
const ImagesTab = lazy(() => import("@/components/patients/tabs/images-tab").then((m) => ({ default: m.ImagesTab })));
const LabsTab = lazy(() => import("@/components/patients/tabs/labs-tab").then((m) => ({ default: m.LabsTab })));
const DocumentsTab = lazy(() => import("@/components/patients/tabs/documents-tab").then((m) => ({ default: m.DocumentsTab })));
const BillingTab = lazy(() => import("@/components/patients/tabs/billing-tab").then((m) => ({ default: m.BillingTab })));
const PackagesTab = lazy(() => import("@/components/patients/tabs/packages-tab").then((m) => ({ default: m.PackagesTab })));
const CommsTab = lazy(() => import("@/components/patients/tabs/comms-tab").then((m) => ({ default: m.CommsTab })));
const FollowUpsTab = lazy(() => import("@/components/patients/tabs/followups-tab").then((m) => ({ default: m.FollowUpsTab })));
const AITranscriptsTab = lazy(() => import("@/components/patients/tabs/ai-transcripts-tab").then((m) => ({ default: m.AITranscriptsTab })));
import { EditPatientModal } from "@/components/patients/edit-patient-modal";
import { CreateAppointmentModal } from "@/components/appointments/create-appointment-modal";
import { CreateInvoiceModal } from "@/components/billing/create-invoice-modal";

import type { Patient } from "@/types";

// ---- API Patient shape ----
interface ApiPatient {
  id: string; patientCode: string; firstName: string; middleName?: string | null;
  lastName: string; email?: string | null; phone?: string | null; dateOfBirth: string;
  gender: string; bloodType?: string | null; skinType?: string | null;
  address?: string | null; city?: string | null; notes?: string | null;
  isActive: boolean; isVip?: boolean; createdAt: string;
  assignedDoctor?: { id: string; name: string; speciality?: string } | null;
  branch?: { id: string; name: string } | null;
  allergies?: { id: string; allergen: string; severity: string }[];
  medications?: { id: string; name: string; dosage?: string; isActive: boolean }[];
  medicalHistory?: { id: string; condition: string; status: string }[];
}

function normalize(raw: ApiPatient): Patient & { assignedDoctorName: string; age: number; allergies: string[] } {
  return {
    id: raw.id, patientCode: raw.patientCode, firstName: raw.firstName, lastName: raw.lastName,
    email: raw.email ?? null, phone: raw.phone ?? null, dateOfBirth: raw.dateOfBirth,
    age: raw.dateOfBirth ? calculateAge(raw.dateOfBirth) : 0,
    gender: raw.gender as Patient["gender"], address: raw.address || "", city: raw.city || "",
    emergencyContact: "", emergencyPhone: "", bloodType: raw.bloodType || "",
    branchId: raw.branch?.id || "", branchName: raw.branch?.name,
    assignedDoctorId: raw.assignedDoctor?.id, assignedDoctorName: raw.assignedDoctor?.name || "Unassigned",
    notes: raw.notes || "", isActive: raw.isActive, skinType: raw.skinType || undefined,
    allergies: (raw.allergies || []).map((a) => a.allergen), outstandingBalance: 0, createdAt: raw.createdAt,
  };
}

// ---- Tab Groups ----
const TAB_GROUPS = [
  {
    group: "Clinical",
    tabs: [
      { value: "overview", label: "Overview" },
      { value: "notes", label: "Notes" },
      { value: "prescriptions", label: "Rx" },
      { value: "procedures", label: "Procedures" },
      { value: "labs", label: "Labs" },
      { value: "skin-history", label: "Skin" },
      { value: "medical-history", label: "History" },
    ],
  },
  {
    group: "Records",
    tabs: [
      { value: "appointments", label: "Appointments" },
      { value: "followups", label: "Follow-Ups" },
      { value: "documents", label: "Documents" },
      { value: "images", label: "Images" },
      { value: "ai-transcripts", label: "AI Notes" },
    ],
  },
  {
    group: "Admin",
    tabs: [
      { value: "billing", label: "Billing" },
      { value: "packages", label: "Packages" },
      { value: "comms", label: "Comms" },
    ],
  },
];

const TAB_COMPONENTS: Record<string, React.FC<{ patientId: string; patient?: Patient }>> = {
  overview: ({ patient }) => patient ? <OverviewTab patient={patient} /> : null,
  appointments: ({ patientId }) => <AppointmentsTab patientId={patientId} />,
  notes: ({ patientId }) => <NotesTab patientId={patientId} />,
  "skin-history": ({ patientId }) => <SkinHistoryTab patientId={patientId} />,
  "medical-history": ({ patient }) => patient ? <MedicalHistoryTab patient={patient} /> : null,
  procedures: ({ patientId }) => <ProceduresTab patientId={patientId} />,
  prescriptions: ({ patientId }) => <PrescriptionsTab patientId={patientId} />,
  images: ({ patientId }) => <ImagesTab patientId={patientId} />,
  labs: ({ patientId }) => <LabsTab patientId={patientId} />,
  documents: ({ patientId }) => <DocumentsTab patientId={patientId} />,
  billing: ({ patientId }) => <BillingTab patientId={patientId} />,
  packages: ({ patientId }) => <PackagesTab patientId={patientId} />,
  comms: ({ patientId }) => <CommsTab patientId={patientId} />,
  followups: ({ patientId }) => <FollowUpsTab patientId={patientId} />,
  "ai-transcripts": ({ patientId }) => <AITranscriptsTab patientId={patientId} />,
};

export default function PatientProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const formatCurrency = useFormatCurrency();
  const { id } = use(params);
  const router = useRouter();
  const { data: response, isLoading } = usePatient(id);
  const [activeTab, setActiveTab] = useState("overview");
  const [showEditModal, setShowEditModal] = useState(false);
  const [showBookModal, setShowBookModal] = useState(false);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [newTag, setNewTag] = useState("");

  // Tags
  const { data: tagsResponse } = usePatientTags(id);
  const tags = (tagsResponse?.data || []) as { id: string; tag: string; color: string | null }[];
  const addTag = useAddPatientTag(id);
  const removeTag = useRemovePatientTag(id);

  // Billing summary — sidebar's "Balance" line + Overview tab's KPI both
  // need the real outstanding number; normalize() can't read it because
  // the patient endpoint doesn't include invoice rows. usePatientBilling
  // is React-Query-cached so the Overview tab reuses the same fetch.
  const { data: billingResp } = usePatientBilling(id);
  type BillingPayload = { invoices?: { balanceDue?: number | string }[]; totalOutstanding?: number };
  const billingPayload = billingResp?.data as BillingPayload | { balanceDue?: number | string }[] | undefined;
  const outstandingBalance = Array.isArray(billingPayload)
    ? billingPayload.reduce((s: number, i) => s + Number(i.balanceDue ?? 0), 0)
    : Number(billingPayload?.totalOutstanding ?? 0);

  // Deactivate / hard-delete / restore — admin-only actions exposed via
  // the kebab menu next to Edit. Hard delete is refused server-side if
  // the patient has clinical history; we surface that as an alert.
  const { user } = useAuth();
  const isAdmin = user?.role === "SUPER_ADMIN" || user?.role === "ADMIN";
  const deactivate = useDeletePatient();
  const hardDelete = useHardDeletePatient();
  const restore = useRestorePatient();
  const { confirm } = useConfirm();

  if (isLoading) return <div className="flex items-center justify-center py-20"><LoadingSpinner size="lg" /></div>;

  const rawPatient = response?.data as ApiPatient | null;
  if (!rawPatient) {
    return (
      <div className="py-12 text-center">
        <User className="w-12 h-12 text-stone-300 mx-auto mb-3" />
        <p className="text-stone-500">Patient not found</p>
        <Button variant="ghost" size="sm" className="mt-3" onClick={() => router.push("/patients")}>Back to Patients</Button>
      </div>
    );
  }

  const patient = normalize(rawPatient);
  const genderShort = patient.gender === "MALE" ? "M" : patient.gender === "FEMALE" ? "F" : "O";

  return (
    <div data-id="PATIENT-PROFILE" className="max-w-6xl mx-auto">

      {/* ===== STICKY HEADER ===== */}
      <div className="sticky top-16 z-10 bg-[#FAFAF9] -mx-5 px-5 sm:-mx-8 sm:px-8 lg:-mx-10 lg:px-10 xl:-mx-12 xl:px-12 pb-3 pt-1 border-b border-stone-100/80">
        {/* Back */}
        <button onClick={() => router.push("/patients")} className="flex items-center gap-1 text-xs text-stone-400 hover:text-stone-600 mb-2 cursor-pointer">
          <ArrowLeft className="w-3.5 h-3.5" /> Patients
        </button>

        <div className="flex items-center gap-3 sm:gap-4">
          <Avatar name={`${patient.firstName} ${patient.lastName}`} size="lg" className="ring-2 ring-teal-200 w-12 h-12 sm:w-14 sm:h-14 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg sm:text-xl font-bold text-stone-900 truncate">{patient.firstName} {patient.lastName}</h1>
              <Badge variant="primary" className="text-[10px]">{patient.patientCode}</Badge>
              <Badge variant={patient.isActive ? "success" : "default"} className="text-[10px]" dot>{patient.isActive ? "Active" : "Inactive"}</Badge>
            </div>
            <div className="flex items-center gap-3 mt-0.5 text-xs text-stone-400">
              <span>{patient.age}y / {genderShort}</span>
              <span>{patient.phone || "—"}</span>
              {patient.assignedDoctorName !== "Unassigned" && <span className="hidden sm:inline">{patient.assignedDoctorName}</span>}
            </div>
          </div>

          {/* Quick contact + actions */}
          <div className="flex items-center gap-1.5 shrink-0">
            <a href={`tel:${patient.phone || ""}`} className="w-9 h-9 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center hover:bg-teal-100 transition-colors">
              <Phone className="w-4 h-4" />
            </a>
            <a href={`https://wa.me/${(patient.phone || "").replace(/[^0-9]/g, "")}`} target="_blank" rel="noopener noreferrer"
              className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center hover:bg-emerald-100 transition-colors">
              <MessageSquare className="w-4 h-4" />
            </a>
            <button onClick={() => setShowEditModal(true)} className="w-9 h-9 rounded-xl bg-stone-100 text-stone-500 flex items-center justify-center hover:bg-stone-200 transition-colors cursor-pointer">
              <Pencil className="w-4 h-4" />
            </button>
            {isAdmin && (
              <DropdownMenu
                trigger={
                  <button className="w-9 h-9 rounded-xl bg-stone-100 text-stone-500 flex items-center justify-center hover:bg-stone-200 transition-colors cursor-pointer" title="More actions">
                    <MoreVertical className="w-4 h-4" />
                  </button>
                }
                items={[
                  // Soft-delete / restore mutually exclusive based on
                  // current isActive flag.
                  ...(patient.isActive
                    ? [{
                        label: "Deactivate patient",
                        icon: <UserMinus className="w-4 h-4" />,
                        onClick: async () => {
                          const ok = await confirm({
                            title: "Deactivate this patient?",
                            message: `${patient.firstName} ${patient.lastName} will be hidden from pickers and the active list. The record + every invoice / appointment / note stays intact and admins can restore at any time.`,
                            confirmLabel: "Deactivate",
                            variant: "warning",
                          });
                          if (!ok) return;
                          deactivate.mutate(id);
                        },
                      }]
                    : [{
                        label: "Restore patient",
                        icon: <RotateCcw className="w-4 h-4" />,
                        onClick: async () => {
                          const ok = await confirm({
                            title: "Restore this patient?",
                            message: `${patient.firstName} ${patient.lastName} will reappear in pickers and active lists. All historical data is intact — restoring just flips the active flag back on.`,
                            confirmLabel: "Restore",
                            variant: "default",
                          });
                          if (!ok) return;
                          restore.mutate(id);
                        },
                      }]),
                  { divider: true, label: "" },
                  {
                    label: "Delete permanently…",
                    icon: <Trash2 className="w-4 h-4" />,
                    danger: true,
                    onClick: async () => {
                      const ok = await confirm({
                        title: "Delete this patient permanently?",
                        message: `Hard delete is irreversible — the row is removed from the database. Only succeeds when the patient has zero invoices, appointments, prescriptions, lab tests, or any other clinical history (the API refuses otherwise to protect billing + audit). Use Deactivate for patients with history.`,
                        confirmLabel: "Delete permanently",
                        variant: "danger",
                      });
                      if (!ok) return;
                      try {
                        const res = await hardDelete.mutateAsync(id) as { success?: boolean; error?: string; blockers?: Record<string, number> };
                        if (!res.success) {
                          const blocks = res.blockers
                            ? "\n\n" + Object.entries(res.blockers).map(([k, v]) => `• ${v} ${k}`).join("\n")
                            : "";
                          alert((res.error || "Could not delete") + blocks);
                          return;
                        }
                        router.push("/patients");
                      } catch (e) {
                        alert(e instanceof Error ? e.message : "Could not delete");
                      }
                    },
                  },
                ]}
              />
            )}
          </div>
        </div>
      </div>

      {/* ===== ALERT STRIP ===== */}
      <div className="flex flex-wrap items-center gap-1.5 mt-3 mb-1">
        {patientAllergyLabels(patient.allergies).map((a) => (
          <Badge key={a} variant="danger" className="text-[10px]"><AlertTriangle className="w-2.5 h-2.5 mr-0.5" />{a}</Badge>
        ))}
        {patient.bloodType && <Badge variant="info" className="text-[10px]"><Droplets className="w-2.5 h-2.5 mr-0.5" />{patient.bloodType}</Badge>}
        {patient.skinType && <Badge variant="purple" className="text-[10px]"><Sparkles className="w-2.5 h-2.5 mr-0.5" />Fitz {patient.skinType.replace("TYPE_", "")}</Badge>}
        {tags.map((t) => (
          <Badge key={t.id} variant="default" className="text-[10px] gap-0.5 pr-1">
            <Tag className="w-2.5 h-2.5" />{t.tag}
            <button onClick={() => removeTag.mutate(t.id)} className="ml-0.5 p-0.5 rounded-full hover:bg-stone-200 cursor-pointer"><X className="w-2 h-2" /></button>
          </Badge>
        ))}
        <div className="flex items-center gap-1">
          <input type="text" value={newTag} onChange={(e) => setNewTag(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && newTag.trim()) { addTag.mutate({ tag: newTag.trim() }); setNewTag(""); } }}
            placeholder="+ tag" className="w-14 text-[10px] px-1.5 py-0.5 border border-stone-200 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-teal-400 placeholder:text-stone-300" />
        </div>
      </div>

      {/* ===== STICKY ACTION BAR ===== */}
      <div className="flex items-center gap-1.5 overflow-x-auto tabs-scroll py-2 -mx-1 px-1">
        <a href={`/consultation?patientId=${patient.id}`}>
          <Button size="sm" variant="outline" iconLeft={<FileText className="w-3.5 h-3.5" />} className="shrink-0 rounded-xl">Add Note</Button>
        </a>
        <a href={`/consultation?patientId=${patient.id}`}>
          <Button size="sm" variant="outline" iconLeft={<Pill className="w-3.5 h-3.5" />} className="shrink-0 rounded-xl">Prescribe</Button>
        </a>
        <a href={`/consultation?patientId=${patient.id}`}>
          <Button size="sm" variant="outline" iconLeft={<Stethoscope className="w-3.5 h-3.5" />} className="shrink-0 rounded-xl">Procedure</Button>
        </a>
        <a href={`/vitals?patientId=${patient.id}`}>
          <Button size="sm" variant="outline" iconLeft={<Activity className="w-3.5 h-3.5" />} className="shrink-0 rounded-xl">Vitals</Button>
        </a>
        <Button size="sm" variant="outline" iconLeft={<CalendarClock className="w-3.5 h-3.5" />} className="shrink-0 rounded-xl"
          onClick={() => setShowBookModal(true)}>Follow-Up</Button>
      </div>

      {/* ===== MAIN CONTENT ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 mt-2">

        {/* LEFT — Summary (visible on tablet/desktop as sidebar) */}
        <div className="hidden lg:block lg:col-span-4 xl:col-span-3 space-y-3">
          {/* Info Card */}
          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-stone-400">Doctor</span>
                <span className="text-stone-700 font-medium">{patient.assignedDoctorName}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-stone-400">Registered</span>
                <span className="text-stone-700">{formatDate(patient.createdAt)}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-stone-400">Balance</span>
                <span className={cn("font-semibold", outstandingBalance > 0 ? "text-red-600" : "text-emerald-600")}>
                  {formatCurrency(outstandingBalance)}
                </span>
              </div>
              {patient.email && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-stone-400">Email</span>
                  <span className="text-stone-700 truncate ml-4">{patient.email}</span>
                </div>
              )}
              {patient.address && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-stone-400">Location</span>
                  <span className="text-stone-700">{patient.city || patient.address}</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Active Medications */}
          {(rawPatient.medications || []).filter((m) => m.isActive).length > 0 && (
            <Card>
              <CardHeader><div className="flex items-center gap-2"><Pill className="w-3.5 h-3.5 text-emerald-500" /><span className="text-xs font-semibold text-stone-900">Active Medications</span></div></CardHeader>
              <CardContent className="p-3 pt-0 space-y-1.5">
                {(rawPatient.medications || []).filter((m) => m.isActive).slice(0, 5).map((m) => (
                  <div key={m.id} className="text-xs text-stone-600 bg-stone-50 rounded-lg px-2.5 py-1.5">
                    <span className="font-medium">{m.name}</span>
                    {m.dosage && <span className="text-stone-400 ml-1">{m.dosage}</span>}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Conditions */}
          {(rawPatient.medicalHistory || []).filter((h) => h.status === "ACTIVE").length > 0 && (
            <Card>
              <CardHeader><div className="flex items-center gap-2"><Heart className="w-3.5 h-3.5 text-red-400" /><span className="text-xs font-semibold text-stone-900">Active Conditions</span></div></CardHeader>
              <CardContent className="p-3 pt-0 space-y-1.5">
                {(rawPatient.medicalHistory || []).filter((h) => h.status === "ACTIVE").map((h) => (
                  <div key={h.id} className="text-xs text-stone-600 bg-red-50 rounded-lg px-2.5 py-1.5">
                    {h.condition}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Quick Nav */}
          <Card>
            <CardContent className="p-2 space-y-0.5">
              {[
                { label: "Full Profile", icon: <Eye className="w-3.5 h-3.5" />, action: () => setActiveTab("overview") },
                { label: "Book Appointment", icon: <Calendar className="w-3.5 h-3.5" />, action: () => setShowBookModal(true) },
                { label: "Create Invoice", icon: <Receipt className="w-3.5 h-3.5" />, action: () => setShowInvoiceModal(true) },
              ].map((item) => (
                <button key={item.label} onClick={item.action}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-stone-600 hover:bg-stone-50 transition-colors cursor-pointer">
                  {item.icon}
                  {item.label}
                  <ChevronRight className="w-3 h-3 text-stone-300 ml-auto" />
                </button>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* RIGHT — Tabs */}
        <div className="lg:col-span-8 xl:col-span-9">
          <Tabs value={activeTab} onChange={setActiveTab}>
            {/* Grouped tabs — horizontally scrollable */}
            <div className="flex items-center gap-1 overflow-x-auto tabs-scroll pb-1">
              {TAB_GROUPS.map((group) => (
                <div key={group.group} className="flex items-center gap-0.5 shrink-0">
                  <span className="text-[9px] font-semibold text-stone-300 uppercase tracking-wider px-1 hidden sm:inline">{group.group}</span>
                  {group.tabs.map((tab) => (
                    <button key={tab.value} onClick={() => setActiveTab(tab.value)}
                      className={cn(
                        "px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap cursor-pointer transition-all",
                        activeTab === tab.value
                          ? "bg-teal-50 text-teal-700 border border-teal-200"
                          : "text-stone-500 hover:text-stone-700 hover:bg-stone-50"
                      )}>
                      {tab.label}
                    </button>
                  ))}
                  <div className="w-px h-4 bg-stone-200 mx-1 last:hidden shrink-0" />
                </div>
              ))}
            </div>

            {/* Tab Content */}
            {TAB_GROUPS.flatMap((g) => g.tabs).map((tab) => {
              const Component = TAB_COMPONENTS[tab.value];
              if (!Component) return null;
              return activeTab === tab.value ? (
                <Suspense key={tab.value} fallback={<div className="flex items-center justify-center py-8"><TabSpinner size="md" /></div>}>
                  <div className="mt-3 animate-fade-in">
                    <Component patientId={patient.id} patient={patient} />
                  </div>
                </Suspense>
              ) : null;
            })}
          </Tabs>
        </div>
      </div>

      {/* Modals */}
      <EditPatientModal isOpen={showEditModal} onClose={() => setShowEditModal(false)} patient={patient} />
      <CreateAppointmentModal isOpen={showBookModal} onClose={() => setShowBookModal(false)} preselectedPatientId={patient.id} />
      <CreateInvoiceModal isOpen={showInvoiceModal} onClose={() => setShowInvoiceModal(false)} preselectedPatientId={patient.id} />
    </div>
  );
}
