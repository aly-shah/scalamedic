"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Plus, Users, UserPlus, UserCheck, LayoutGrid, List, Phone, Calendar,
  Stethoscope, Mail, ChevronRight, ChevronLeft, X,
  AlertTriangle, Sparkles, Eye, FileText,
  Receipt, MessageSquare, Clock, Heart, Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { SearchInput } from "@/components/ui/search-input";
import { StatCard } from "@/components/ui/stat-card";
import { formatDate, computeAge, patientAllergyLabels } from "@/lib/utils";
import { useFormatCurrency } from "@/hooks/use-format-currency";
import { AddPatientModal } from "@/components/patients/add-patient-modal";
import { CreateAppointmentModal } from "@/components/appointments/create-appointment-modal";
import { useModuleAccess } from "@/modules/core/hooks";
import { usePatients, queryKeys } from "@/hooks/use-queries";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { downloadCSV } from "@/lib/export";
import Link from "next/link";
import type { Patient } from "@/types";

// ─── Helpers — defensive against legacy flat shape on Patient ───
function ageOf(p: Patient): string {
  return String(p.age ?? computeAge(p.dateOfBirth) ?? "?");
}
function doctorOf(p: Patient): string | null {
  return p.assignedDoctor?.name ?? p.assignedDoctorName ?? null;
}

const ITEMS_PER_PAGE = 15;

type QuickFilter = "all" | "today" | "new" | "followup" | "active" | "inactive";

export default function PatientsPage() {
  const formatCurrency = useFormatCurrency();
  const router = useRouter();
  const access = useModuleAccess("MOD-PATIENT");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("all");
  const [viewMode, setViewMode] = useState<"card" | "list">("list");
  const [showAddModal, setShowAddModal] = useState(false);
  const [showBookModal, setShowBookModal] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [page, setPage] = useState(1);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const apiParams: Record<string, string> = {
    page: String(page),
    limit: String(ITEMS_PER_PAGE),
  };
  if (debouncedSearch) apiParams.search = debouncedSearch;
  if (quickFilter === "active") apiParams.status = "active";
  if (quickFilter === "inactive") apiParams.status = "inactive";

  const { data: response, isLoading } = usePatients(apiParams);
  const patients = (response?.data || []) as Patient[];

  // Prime the per-patient cache so /patients/[id] renders instantly
  // when the receptionist clicks through. The list payload has
  // basics (name, phone, allergies summary, recent activity); the
  // detail page will revalidate with the full record.
  const qc = useQueryClient();
  useEffect(() => {
    patients.forEach((p) => {
      qc.setQueryData(queryKeys.patients.detail(p.id), { success: true, data: p });
    });
  }, [patients, qc]);
  const pagination = (response as unknown as Record<string, unknown>)?.pagination as Record<string, number> | undefined;
  const totalPages = pagination?.totalPages || 1;
  const totalPatients = pagination?.total || patients.length;

  // Computed stats from current page data (approximate)
  const activeCount = patients.filter((p) => p.isActive).length;
  const newThisMonth = patients.filter((p) => {
    const created = new Date(p.createdAt);
    const now = new Date();
    return created.getFullYear() === now.getFullYear() && created.getMonth() === now.getMonth();
  }).length;

  const genderShort = (g: string) => (g === "MALE" ? "M" : g === "FEMALE" ? "F" : "O");

  return (
    <div data-id="PATIENT-LIST" className="animate-fade-in space-y-5 sm:space-y-6">

      {/* ===== HERO ===== */}
      <div className="relative overflow-hidden rounded-2xl border border-stone-100 bg-gradient-to-br from-teal-600 via-emerald-600 to-cyan-600 px-5 py-5 sm:px-7 sm:py-6 text-white">
        <div className="absolute inset-0 opacity-25 [background:radial-gradient(circle_at_30%_30%,#fff_0,transparent_45%)]" />
        <div className="relative flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <Users className="w-4 h-4" />
              <span className="text-[11px] uppercase tracking-wider font-semibold opacity-90">Patients</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-semibold leading-tight">All your patients in one place.</h1>
            <p className="text-sm opacity-90 mt-1 max-w-xl">
              Search, filter, walk-ins, and registrations. Click any patient to preview without leaving the list.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              iconLeft={<Download className="w-3.5 h-3.5" />}
              onClick={() => downloadCSV(patients.map(p => ({ Name: p.firstName + " " + p.lastName, Code: p.patientCode, Phone: p.phone, Email: p.email || "", Gender: p.gender, Active: p.isActive ? "Yes" : "No" })), "patients")}
              className="!bg-white/15 !border-white/30 !text-white hover:!bg-white/25"
            >
              Export
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowBookModal(true)}
              iconLeft={<Calendar className="w-3.5 h-3.5" />}
              className="!bg-white/15 !border-white/30 !text-white hover:!bg-white/25"
            >
              Walk-in
            </Button>
            <Button
              size="sm"
              onClick={() => setShowAddModal(true)}
              iconLeft={<Plus className="w-3.5 h-3.5" />}
              className="!bg-white !text-emerald-700 hover:!bg-stone-50"
            >
              New patient
            </Button>
          </div>
        </div>
      </div>

      {/* ===== KPI CARDS ===== */}
      {/* Show only KPIs we can actually compute. The previous version
          shipped two hardcoded zeros (Follow-Up Due, Billing Pending)
          that misled the user — those need their own queries to surface,
          and live on /follow-ups and /billing already. */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        <StatCard label="Total patients" value={totalPatients} icon={<Users className="w-5 h-5" />} color="primary" />
        <StatCard label="New this month" value={newThisMonth} icon={<UserPlus className="w-5 h-5" />} color="success" />
        <StatCard label="Active" value={activeCount} icon={<UserCheck className="w-5 h-5" />} color="info" />
      </div>

      {/* ===== STATUS CHIPS ===== */}
      {/* Only the filters the API actually supports. The previous "New"
          chip set quickFilter="new" but no API param was wired for it. */}
      <div className="flex items-center gap-1.5 overflow-x-auto tabs-scroll pb-0.5">
        {([
          { label: "All patients", filter: "all" as QuickFilter },
          { label: "Active", filter: "active" as QuickFilter },
          { label: "Inactive", filter: "inactive" as QuickFilter },
        ]).map((view) => (
          <button key={view.label} onClick={() => { setQuickFilter(view.filter); setPage(1); }}
            className={cn(
              "px-3.5 py-1.5 rounded-full text-xs font-medium whitespace-nowrap cursor-pointer transition-all border",
              quickFilter === view.filter
                ? "bg-stone-900 text-white border-stone-900"
                : "bg-white text-stone-500 border-stone-200 hover:border-stone-300 hover:text-stone-700"
            )}>
            {view.label}
          </button>
        ))}
      </div>

      {/* ===== SEARCH + FILTERS + VIEW TOGGLE (STICKY) ===== */}
      <div className="sticky top-16 z-10 bg-[#FAFAF9] -mx-5 px-5 py-2.5 sm:-mx-8 sm:px-8 lg:-mx-10 lg:px-10 xl:-mx-12 xl:px-12 border-b border-stone-100/80">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2.5">
        <div className="flex-1 w-full sm:w-auto">
          <SearchInput
            placeholder="Search by name, phone, ID, or email..."
            value={search}
            onChange={(val) => { setSearch(val); setPage(1); }}
            debounceMs={0}
          />
        </div>

        {/* View toggle */}
        <div className="flex items-center gap-0.5 bg-stone-100 rounded-lg p-0.5">
          <button onClick={() => setViewMode("list")}
            className={cn("p-1.5 rounded", viewMode === "list" ? "bg-white shadow-sm text-stone-900" : "text-stone-400")}>
            <List className="w-4 h-4" />
          </button>
          <button onClick={() => setViewMode("card")}
            className={cn("p-1.5 rounded", viewMode === "card" ? "bg-white shadow-sm text-stone-900" : "text-stone-400")}>
            <LayoutGrid className="w-4 h-4" />
          </button>
        </div>
        </div>
      </div>

      {/* ===== MAIN CONTENT (List + Preview Panel) ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">

        {/* LEFT — Patient List */}
        <div className={cn("space-y-0", selectedPatient ? "lg:col-span-7 xl:col-span-8" : "lg:col-span-12")}>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="bg-white rounded-xl border border-stone-100 p-4 animate-pulse">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-stone-200" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 bg-stone-200 rounded w-1/3" />
                      <div className="h-3 bg-stone-100 rounded w-1/2" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : patients.length === 0 ? (
            <div className="bg-white rounded-2xl border border-stone-100 p-12 text-center">
              <Users className="w-12 h-12 text-stone-300 mx-auto mb-3" />
              <h3 className="text-base font-semibold text-stone-900">No patients found</h3>
              <p className="text-sm text-stone-400 mt-1">Try a different search or filter</p>
              <Button size="sm" className="mt-4" iconLeft={<Plus className="w-3.5 h-3.5" />} onClick={() => setShowAddModal(true)}>
                Add First Patient
              </Button>
            </div>
          ) : viewMode === "list" ? (
            /* ---- LIST VIEW ---- */
            <div className="bg-white rounded-xl border border-stone-100 overflow-hidden">
              {patients.map((p, i) => (
                <button key={p.id} onClick={() => setSelectedPatient(p)}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-3 text-left transition-all cursor-pointer group",
                    i < patients.length - 1 && "border-b border-stone-50",
                    selectedPatient?.id === p.id ? "bg-teal-50/40 border-l-2 border-l-teal-500" : "hover:bg-stone-50",
                  )}>
                  <Avatar name={`${p.firstName} ${p.lastName}`} size="md" className="shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-stone-900 truncate">{p.firstName} {p.lastName}</p>
                      <span className="text-[10px] text-stone-400 font-mono">{p.patientCode}</span>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 text-xs text-stone-400">
                      <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{p.phone}</span>
                      <span>{ageOf(p)}y / {genderShort(p.gender)}</span>
                      {p.lastVisit && <span className="flex items-center gap-1"><Clock className="w-3 h-3" />Last: {formatDate(p.lastVisit)}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {patientAllergyLabels(p.allergies).length > 0 && (
                      <Badge variant="danger" className="text-[10px]"><AlertTriangle className="w-2.5 h-2.5 mr-0.5" />Allergy</Badge>
                    )}
                    {p.skinType && (
                      <Badge variant="purple" className="text-[10px]"><Sparkles className="w-2.5 h-2.5 mr-0.5" />{p.skinType?.replace("TYPE_", "")}</Badge>
                    )}
                    <Badge variant={p.isActive ? "success" : "default"} className="text-[10px]" dot>{p.isActive ? "Active" : "Inactive"}</Badge>
                    <ChevronRight className="w-4 h-4 text-stone-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </button>
              ))}
            </div>
          ) : (
            /* ---- CARD VIEW ---- */
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {patients.map((p) => (
                <button key={p.id} onClick={() => setSelectedPatient(p)}
                  className={cn(
                    "bg-white rounded-xl border border-stone-100 p-4 text-left transition-all cursor-pointer hover:shadow-md hover:border-teal-200 group",
                    selectedPatient?.id === p.id && "ring-2 ring-teal-400 border-teal-300"
                  )}>
                  <div className="flex items-center gap-3 mb-3">
                    <Avatar name={`${p.firstName} ${p.lastName}`} size="md" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-stone-900 truncate">{p.firstName} {p.lastName}</p>
                      <p className="text-[11px] text-stone-400">{p.patientCode} &middot; {ageOf(p)}y / {genderShort(p.gender)}</p>
                    </div>
                    <Badge variant={p.isActive ? "success" : "default"} className="text-[10px]" dot>{p.isActive ? "Active" : "—"}</Badge>
                  </div>
                  <div className="space-y-1.5 text-xs text-stone-500">
                    <div className="flex items-center gap-1.5"><Phone className="w-3 h-3 text-stone-400" />{p.phone}</div>
                    {p.email && <div className="flex items-center gap-1.5"><Mail className="w-3 h-3 text-stone-400" /><span className="truncate">{p.email}</span></div>}
                    {doctorOf(p) && <div className="flex items-center gap-1.5"><Stethoscope className="w-3 h-3 text-stone-400" />{doctorOf(p)}</div>}
                  </div>
                  {patientAllergyLabels(p.allergies).length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {patientAllergyLabels(p.allergies).slice(0, 2).map((a) => (
                        <Badge key={a} variant="danger" className="text-[10px]">{a}</Badge>
                      ))}
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}

          {/* ---- PAGINATION ---- */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-3">
              <p className="text-xs text-stone-400">
                Page {page} of {totalPages} &middot; {totalPatients} patients
              </p>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  const p = i + 1;
                  return (
                    <button key={p} onClick={() => setPage(p)}
                      className={cn(
                        "w-8 h-8 rounded-lg text-xs font-medium cursor-pointer transition-all",
                        page === p ? "bg-teal-500 text-white" : "text-stone-500 hover:bg-stone-100"
                      )}>{p}</button>
                  );
                })}
                <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* RIGHT — Patient Preview Panel */}
        {selectedPatient && (
          <div className="lg:col-span-5 xl:col-span-4">
            <div className="bg-white rounded-2xl border border-stone-100 shadow-sm sticky top-20 overflow-hidden">
              {/* Close */}
              <div className="flex justify-end p-2">
                <button onClick={() => setSelectedPatient(null)} className="p-1.5 rounded-lg hover:bg-stone-100 text-stone-400 cursor-pointer">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Identity */}
              <div className="px-5 pb-4 text-center -mt-2">
                <Avatar name={`${selectedPatient.firstName} ${selectedPatient.lastName}`} size="xl" className="mx-auto ring-4 ring-teal-100 w-16 h-16" />
                <h3 className="text-lg font-bold text-stone-900 mt-3">{selectedPatient.firstName} {selectedPatient.lastName}</h3>
                <p className="text-xs text-stone-400 mt-0.5">{selectedPatient.patientCode} &middot; {ageOf(selectedPatient)}y / {genderShort(selectedPatient.gender)}</p>

                {/* Contact pills */}
                <div className="flex items-center justify-center gap-2 mt-3">
                  <a href={`tel:${selectedPatient.phone || ""}`} className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-50 text-teal-700 rounded-full text-xs font-medium hover:bg-teal-100 transition-colors">
                    <Phone className="w-3 h-3" /> Call
                  </a>
                  <a href={`https://wa.me/${(selectedPatient.phone || "").replace(/[^0-9]/g, "")}`} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-full text-xs font-medium hover:bg-emerald-100 transition-colors">
                    <MessageSquare className="w-3 h-3" /> WhatsApp
                  </a>
                  {selectedPatient.email && (
                    <a href={`mailto:${selectedPatient.email}`} className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 rounded-full text-xs font-medium hover:bg-blue-100 transition-colors">
                      <Mail className="w-3 h-3" /> Email
                    </a>
                  )}
                </div>

                {/* Badges */}
                <div className="flex items-center justify-center gap-1.5 mt-3 flex-wrap">
                  <Badge variant={selectedPatient.isActive ? "success" : "default"} dot>{selectedPatient.isActive ? "Active" : "Inactive"}</Badge>
                  {selectedPatient.bloodType && <Badge variant="info"><Heart className="w-2.5 h-2.5 mr-0.5" />{selectedPatient.bloodType}</Badge>}
                  {selectedPatient.skinType && <Badge variant="purple"><Sparkles className="w-2.5 h-2.5 mr-0.5" />{selectedPatient.skinType.replace("TYPE_", "")}</Badge>}
                </div>
              </div>

              {/* Alerts */}
              {patientAllergyLabels(selectedPatient.allergies).length > 0 && (
                <div className="mx-5 mb-3 p-2.5 bg-red-50 rounded-xl border border-red-100">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-red-700 mb-1">
                    <AlertTriangle className="w-3 h-3" /> Allergies
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {patientAllergyLabels(selectedPatient.allergies).map((a) => (
                      <Badge key={a} variant="danger" className="text-[10px]">{a}</Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Details */}
              <div className="px-5 py-3 border-t border-stone-100 space-y-2.5">
                {doctorOf(selectedPatient) && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-stone-400">Doctor</span>
                    <span className="text-stone-700 font-medium">{doctorOf(selectedPatient)}</span>
                  </div>
                )}
                {selectedPatient.lastVisit && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-stone-400">Last Visit</span>
                    <span className="text-stone-700">{formatDate(selectedPatient.lastVisit)}</span>
                  </div>
                )}
                {selectedPatient.nextAppointment && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-stone-400">Next Appointment</span>
                    <span className="text-teal-600 font-medium">{formatDate(selectedPatient.nextAppointment)}</span>
                  </div>
                )}
                <div className="flex items-center justify-between text-xs">
                  <span className="text-stone-400">Balance</span>
                  <span className={cn("font-semibold", (selectedPatient.outstandingBalance || 0) > 0 ? "text-red-600" : "text-emerald-600")}>
                    {formatCurrency(selectedPatient.outstandingBalance || 0)}
                  </span>
                </div>
              </div>

              {/* Quick Actions */}
              <div className="px-5 py-4 border-t border-stone-100 grid grid-cols-2 gap-2">
                <Link href={`/patients/${selectedPatient.id}`}>
                  <Button variant="primary" size="sm" className="w-full" iconLeft={<Eye className="w-3.5 h-3.5" />}>
                    View Profile
                  </Button>
                </Link>
                <Button variant="outline" size="sm" className="w-full" iconLeft={<Calendar className="w-3.5 h-3.5" />}
                  onClick={() => setShowBookModal(true)}>
                  Book
                </Button>
                <Button variant="outline" size="sm" className="w-full" iconLeft={<FileText className="w-3.5 h-3.5" />}
                  onClick={() => router.push(`/patients/${selectedPatient.id}`)}>
                  Notes
                </Button>
                <Button variant="outline" size="sm" className="w-full" iconLeft={<Receipt className="w-3.5 h-3.5" />}
                  onClick={() => router.push(`/patients/${selectedPatient.id}`)}>
                  Billing
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      <AddPatientModal isOpen={showAddModal} onClose={() => setShowAddModal(false)} />
      <CreateAppointmentModal isOpen={showBookModal} onClose={() => setShowBookModal(false)} preselectedPatientId={selectedPatient?.id} />
    </div>
  );
}
