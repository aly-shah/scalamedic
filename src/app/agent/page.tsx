"use client";

import { useState, useEffect } from "react";
import {
  Phone, PhoneCall, PhoneOff,
  User, Calendar, Clock, Search,
  CheckCircle, LogOut, Plus, Home,
  Users, FileText, ChevronRight, X, ArrowLeft,
  Stethoscope, CreditCard,
} from "lucide-react";
import { cn, getClinicToday } from "@/lib/utils";

// ---- Types ----
type Tab = "home" | "patients" | "appointments" | "more";

interface Patient {
  id: string;
  firstName: string;
  lastName: string;
  patientCode: string;
  phone: string;
  email?: string;
  gender?: string;
  dateOfBirth?: string;
}

interface Appointment {
  id: string;
  date: string;
  time: string;
  status: string;
  type: string;
  patient?: { firstName: string; lastName: string; patientCode: string };
  doctor?: { name: string };
}

// ---- API ----
async function api(path: string, opts?: RequestInit) {
  const res = await fetch(path, { credentials: "include", ...opts });
  return res.json();
}

async function apiPost(path: string, data: Record<string, unknown>) {
  return api(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
}

// ---- Main App ----
export default function AgentApp() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [user, setUser] = useState<{ id: string; name: string; role: string; branchId: string } | null>(null);

  // Login
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  // Navigation
  const [tab, setTab] = useState<Tab>("home");
  const [subScreen, setSubScreen] = useState<string | null>(null);

  // Data
  const [patients, setPatients] = useState<Patient[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);

  // Patient detail
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);

  // New patient form
  const [newPatient, setNewPatient] = useState({ firstName: "", lastName: "", phone: "", email: "", gender: "MALE" });

  // Check session on mount
  useEffect(() => {
    api("/api/auth/me").then(res => {
      if (res.success && res.data?.user) {
        setUser(res.data.user);
        setLoggedIn(true);
      }
    }).catch(() => {});
  }, []);

  // ---- Auth ----
  const handleLogin = async () => {
    if (!email || !password) return;
    setLoginLoading(true);
    setLoginError("");
    try {
      const res = await apiPost("/api/auth/login", { email, password });
      if (res.success) {
        setUser(res.data.user);
        setLoggedIn(true);
      } else {
        setLoginError(res.error || "Login failed");
      }
    } catch {
      setLoginError("Connection error");
    }
    setLoginLoading(false);
  };

  const handleLogout = async () => {
    await api("/api/auth/logout", { method: "POST" });
    setLoggedIn(false);
    setUser(null);
    setTab("home");
  };

  // ---- Data loading ----
  const loadPatients = async (query?: string) => {
    setLoading(true);
    const q = query ? `?search=${encodeURIComponent(query)}` : "?limit=20";
    const res = await api(`/api/patients${q}`);
    if (res.success) setPatients(res.data || []);
    setLoading(false);
  };

  const loadAppointments = async () => {
    setLoading(true);
    const today = getClinicToday();
    const res = await api(`/api/appointments?date=${today}&limit=30`);
    if (res.success) setAppointments(res.data || []);
    setLoading(false);
  };

  const createPatient = async () => {
    if (!newPatient.firstName || !newPatient.lastName || !newPatient.phone) return;
    setLoading(true);
    const res = await apiPost("/api/patients", { ...newPatient, branchId: user?.branchId });
    if (res.success) {
      setSubScreen(null);
      setNewPatient({ firstName: "", lastName: "", phone: "", email: "", gender: "MALE" });
      loadPatients();
    }
    setLoading(false);
  };

  // Load data on tab change
  useEffect(() => {
    if (!loggedIn) return;
    const timer = setTimeout(() => {
      if (tab === "patients") loadPatients();
      if (tab === "appointments") loadAppointments();
    }, 0);
    return () => clearTimeout(timer);
  }, [tab, loggedIn]);

  // ---- LOGIN SCREEN ----
  if (!loggedIn) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-teal-600 to-teal-700 flex items-center justify-center px-6">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Stethoscope className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-white">Nakhoda Skin</h1>
            <p className="text-teal-200 text-sm mt-1">Clinic Management</p>
          </div>

          <div className="bg-white rounded-2xl p-6 shadow-xl space-y-4">
            {loginError && (
              <div className="bg-red-50 text-red-600 text-sm rounded-xl px-4 py-2.5">{loginError}</div>
            )}
            <div>
              <label className="text-xs font-medium text-stone-500 mb-1 block">Email</label>
              <input type="email" placeholder="you@clinic.com" value={email} onChange={e => setEmail(e.target.value)}
                className="w-full px-4 py-3 text-sm bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none" />
            </div>
            <div>
              <label className="text-xs font-medium text-stone-500 mb-1 block">Password</label>
              <input type="password" placeholder="Enter password" value={password} onChange={e => setPassword(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleLogin()}
                className="w-full px-4 py-3 text-sm bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none" />
            </div>
            <button onClick={handleLogin} disabled={loginLoading}
              className="w-full py-3.5 bg-teal-600 text-white rounded-xl font-semibold text-sm hover:bg-teal-700 active:scale-[0.98] transition-all disabled:opacity-50">
              {loginLoading ? "Signing in..." : "Sign In"}
            </button>
            <div className="text-center">
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ---- SUB SCREENS ----

  // New Patient Form
  if (subScreen === "new-patient") {
    return (
      <div className="min-h-screen bg-[#FAFAF9] flex flex-col">
        <div className="bg-white border-b border-stone-100 px-4 py-3 flex items-center gap-3">
          <button onClick={() => setSubScreen(null)} className="p-1.5 rounded-lg hover:bg-stone-100"><ArrowLeft className="w-5 h-5 text-stone-600" /></button>
          <h1 className="text-base font-bold text-stone-900">New Patient</h1>
        </div>
        <div className="flex-1 px-5 py-5 space-y-4">
          <div>
            <label className="text-xs font-medium text-stone-500 mb-1 block">First Name *</label>
            <input type="text" value={newPatient.firstName} onChange={e => setNewPatient({ ...newPatient, firstName: e.target.value })}
              className="w-full px-4 py-3 text-sm bg-white border border-stone-200 rounded-xl outline-none focus:border-teal-500" />
          </div>
          <div>
            <label className="text-xs font-medium text-stone-500 mb-1 block">Last Name *</label>
            <input type="text" value={newPatient.lastName} onChange={e => setNewPatient({ ...newPatient, lastName: e.target.value })}
              className="w-full px-4 py-3 text-sm bg-white border border-stone-200 rounded-xl outline-none focus:border-teal-500" />
          </div>
          <div>
            <label className="text-xs font-medium text-stone-500 mb-1 block">Phone *</label>
            <input type="tel" value={newPatient.phone} onChange={e => setNewPatient({ ...newPatient, phone: e.target.value })}
              placeholder="+923001234567"
              className="w-full px-4 py-3 text-sm bg-white border border-stone-200 rounded-xl outline-none focus:border-teal-500" />
          </div>
          <div>
            <label className="text-xs font-medium text-stone-500 mb-1 block">Email</label>
            <input type="email" value={newPatient.email} onChange={e => setNewPatient({ ...newPatient, email: e.target.value })}
              className="w-full px-4 py-3 text-sm bg-white border border-stone-200 rounded-xl outline-none focus:border-teal-500" />
          </div>
          <div>
            <label className="text-xs font-medium text-stone-500 mb-1 block">Gender</label>
            <select value={newPatient.gender} onChange={e => setNewPatient({ ...newPatient, gender: e.target.value })}
              className="w-full px-4 py-3 text-sm bg-white border border-stone-200 rounded-xl outline-none focus:border-teal-500">
              <option value="MALE">Male</option>
              <option value="FEMALE">Female</option>
              <option value="OTHER">Other</option>
            </select>
          </div>
          <button onClick={createPatient} disabled={loading || !newPatient.firstName || !newPatient.lastName || !newPatient.phone}
            className="w-full py-3.5 bg-teal-600 text-white rounded-xl font-semibold text-sm active:scale-[0.98] disabled:opacity-50 mt-4">
            {loading ? "Saving..." : "Register Patient"}
          </button>
        </div>
      </div>
    );
  }

  // Patient Detail
  if (subScreen === "patient-detail" && selectedPatient) {
    return (
      <div className="min-h-screen bg-[#FAFAF9] flex flex-col">
        <div className="bg-white border-b border-stone-100 px-4 py-3 flex items-center gap-3">
          <button onClick={() => { setSubScreen(null); setSelectedPatient(null); }} className="p-1.5 rounded-lg hover:bg-stone-100"><ArrowLeft className="w-5 h-5 text-stone-600" /></button>
          <h1 className="text-base font-bold text-stone-900">Patient Details</h1>
        </div>
        <div className="flex-1 px-5 py-5 space-y-4">
          <div className="bg-white rounded-2xl border border-stone-100 p-5">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-teal-100 rounded-full flex items-center justify-center">
                <span className="text-lg font-bold text-teal-700">{selectedPatient.firstName[0]}{selectedPatient.lastName[0]}</span>
              </div>
              <div>
                <h2 className="text-lg font-bold text-stone-900">{selectedPatient.firstName} {selectedPatient.lastName}</h2>
                <p className="text-sm text-stone-500">{selectedPatient.patientCode}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-stone-100 divide-y divide-stone-100">
            <div className="px-5 py-3.5 flex justify-between">
              <span className="text-sm text-stone-500">Phone</span>
              <span className="text-sm font-medium text-stone-900">{selectedPatient.phone || "—"}</span>
            </div>
            <div className="px-5 py-3.5 flex justify-between">
              <span className="text-sm text-stone-500">Email</span>
              <span className="text-sm font-medium text-stone-900">{selectedPatient.email || "—"}</span>
            </div>
            <div className="px-5 py-3.5 flex justify-between">
              <span className="text-sm text-stone-500">Gender</span>
              <span className="text-sm font-medium text-stone-900">{selectedPatient.gender || "—"}</span>
            </div>
            <div className="px-5 py-3.5 flex justify-between">
              <span className="text-sm text-stone-500">Date of Birth</span>
              <span className="text-sm font-medium text-stone-900">{selectedPatient.dateOfBirth ? new Date(selectedPatient.dateOfBirth).toLocaleDateString() : "—"}</span>
            </div>
          </div>

          <a href={`tel:${selectedPatient.phone}`} className="block w-full py-3.5 bg-teal-600 text-white rounded-xl font-semibold text-sm text-center active:scale-[0.98]">
            <Phone className="w-4 h-4 inline mr-2" />Call Patient
          </a>
        </div>
      </div>
    );
  }

  // ---- MAIN TABS ----
  return (
    <div className="min-h-screen bg-[#FAFAF9] flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-stone-100 px-5 py-3 flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-base font-bold text-stone-900">{user?.name}</h1>
          <p className="text-[11px] text-stone-400 capitalize">{user?.role?.toLowerCase().replace("_", " ")}</p>
        </div>
        <button onClick={handleLogout} className="p-2 rounded-lg hover:bg-stone-100 text-stone-400">
          <LogOut className="w-5 h-5" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">

        {/* HOME TAB */}
        {tab === "home" && (
          <div className="px-5 py-4 space-y-4">
            {/* Quick Actions */}
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => { setTab("patients"); }} className="bg-white rounded-2xl border border-stone-100 p-4 flex flex-col items-center gap-2.5 active:scale-[0.97]">
                <div className="w-11 h-11 rounded-xl bg-blue-50 flex items-center justify-center"><Search className="w-5 h-5 text-blue-600" /></div>
                <span className="text-xs font-semibold text-stone-700">Find Patient</span>
              </button>
              <button onClick={() => setSubScreen("new-patient")} className="bg-white rounded-2xl border border-stone-100 p-4 flex flex-col items-center gap-2.5 active:scale-[0.97]">
                <div className="w-11 h-11 rounded-xl bg-emerald-50 flex items-center justify-center"><Plus className="w-5 h-5 text-emerald-600" /></div>
                <span className="text-xs font-semibold text-stone-700">New Patient</span>
              </button>
              <button onClick={() => setTab("appointments")} className="bg-white rounded-2xl border border-stone-100 p-4 flex flex-col items-center gap-2.5 active:scale-[0.97]">
                <div className="w-11 h-11 rounded-xl bg-violet-50 flex items-center justify-center"><Calendar className="w-5 h-5 text-violet-600" /></div>
                <span className="text-xs font-semibold text-stone-700">Appointments</span>
              </button>
              <button onClick={() => setTab("more")} className="bg-white rounded-2xl border border-stone-100 p-4 flex flex-col items-center gap-2.5 active:scale-[0.97]">
                <div className="w-11 h-11 rounded-xl bg-amber-50 flex items-center justify-center"><FileText className="w-5 h-5 text-amber-600" /></div>
                <span className="text-xs font-semibold text-stone-700">More</span>
              </button>
            </div>

            {/* Today's Summary */}
            <div className="bg-white rounded-2xl border border-stone-100 p-4">
              <p className="text-xs font-semibold text-stone-400 uppercase tracking-wider mb-3">Today&apos;s Overview</p>
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-stone-50 rounded-xl p-3 text-center">
                  <p className="text-xl font-bold text-stone-900">{appointments.length}</p>
                  <p className="text-[10px] text-stone-400 mt-0.5">Appointments</p>
                </div>
                <div className="bg-emerald-50 rounded-xl p-3 text-center">
                  <p className="text-xl font-bold text-emerald-600">{appointments.filter(a => a.status === "CHECKED_IN" || a.status === "COMPLETED").length}</p>
                  <p className="text-[10px] text-stone-400 mt-0.5">Seen</p>
                </div>
                <div className="bg-amber-50 rounded-xl p-3 text-center">
                  <p className="text-xl font-bold text-amber-600">{appointments.filter(a => a.status === "SCHEDULED" || a.status === "CONFIRMED").length}</p>
                  <p className="text-[10px] text-stone-400 mt-0.5">Pending</p>
                </div>
              </div>
            </div>

            {/* Upcoming Appointments */}
            <div className="bg-white rounded-2xl border border-stone-100">
              <div className="px-4 py-3 border-b border-stone-100 flex items-center justify-between">
                <p className="text-sm font-semibold text-stone-900">Upcoming</p>
                <button onClick={() => setTab("appointments")} className="text-xs text-teal-600 font-medium">View All</button>
              </div>
              {appointments.length === 0 ? (
                <div className="px-4 py-8 text-center">
                  <Calendar className="w-8 h-8 text-stone-300 mx-auto mb-2" />
                  <p className="text-sm text-stone-400">No appointments today</p>
                </div>
              ) : (
                <div className="divide-y divide-stone-50">
                  {appointments.slice(0, 5).map(apt => (
                    <div key={apt.id} className="px-4 py-3 flex items-center gap-3">
                      <div className="w-10 h-10 bg-teal-50 rounded-full flex items-center justify-center shrink-0">
                        <Clock className="w-4 h-4 text-teal-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-stone-900 truncate">
                          {apt.patient ? `${apt.patient.firstName} ${apt.patient.lastName}` : "Patient"}
                        </p>
                        <p className="text-xs text-stone-400">{apt.time} · {apt.doctor?.name || apt.type}</p>
                      </div>
                      <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full",
                        apt.status === "COMPLETED" ? "bg-emerald-50 text-emerald-600" :
                        apt.status === "CHECKED_IN" ? "bg-blue-50 text-blue-600" :
                        apt.status === "CANCELLED" ? "bg-red-50 text-red-600" :
                        "bg-stone-100 text-stone-500"
                      )}>{apt.status?.replace("_", " ")}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* PATIENTS TAB */}
        {tab === "patients" && (
          <div className="px-5 py-4 space-y-3">
            <div className="flex items-center gap-2 -mx-1 mb-1">
              <button onClick={() => setTab("home")} className="p-1.5 rounded-lg hover:bg-stone-100"><ArrowLeft className="w-5 h-5 text-stone-600" /></button>
              <h2 className="text-base font-bold text-stone-900">Patients</h2>
            </div>
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
              <input type="text" placeholder="Search patients..." value={searchQuery}
                onChange={e => { setSearchQuery(e.target.value); }}
                onKeyDown={e => { if (e.key === "Enter") loadPatients(searchQuery); }}
                className="w-full pl-10 pr-4 py-3 text-sm bg-white border border-stone-200 rounded-xl outline-none focus:border-teal-500" />
              {searchQuery && (
                <button onClick={() => { setSearchQuery(""); loadPatients(); }} className="absolute right-3 top-1/2 -translate-y-1/2">
                  <X className="w-4 h-4 text-stone-400" />
                </button>
              )}
            </div>

            <div className="flex gap-2">
              <button onClick={() => loadPatients(searchQuery)} className="flex-1 py-2.5 bg-teal-600 text-white rounded-xl text-sm font-medium active:scale-[0.98]">
                Search
              </button>
              <button onClick={() => setSubScreen("new-patient")} className="py-2.5 px-4 bg-emerald-50 text-emerald-700 rounded-xl text-sm font-medium active:scale-[0.98]">
                <Plus className="w-4 h-4" />
              </button>
            </div>

            {/* Patient List */}
            {loading ? (
              <div className="py-12 text-center"><p className="text-sm text-stone-400">Loading...</p></div>
            ) : patients.length === 0 ? (
              <div className="py-12 text-center">
                <Users className="w-10 h-10 text-stone-300 mx-auto mb-2" />
                <p className="text-sm text-stone-400">No patients found</p>
              </div>
            ) : (
              <div className="space-y-2">
                {patients.map(p => (
                  <button key={p.id} onClick={() => { setSelectedPatient(p); setSubScreen("patient-detail"); }}
                    className="w-full bg-white rounded-xl border border-stone-100 px-4 py-3 flex items-center gap-3 active:bg-stone-50 text-left">
                    <div className="w-10 h-10 bg-teal-50 rounded-full flex items-center justify-center shrink-0">
                      <span className="text-sm font-bold text-teal-700">{p.firstName?.[0]}{p.lastName?.[0]}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-stone-900 truncate">{p.firstName} {p.lastName}</p>
                      <p className="text-xs text-stone-400">{p.patientCode} · {p.phone || "No phone"}</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-stone-300 shrink-0" />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* APPOINTMENTS TAB */}
        {tab === "appointments" && (
          <div className="px-5 py-4 space-y-3">
            <div className="flex items-center gap-2 -mx-1 mb-1">
              <button onClick={() => setTab("home")} className="p-1.5 rounded-lg hover:bg-stone-100"><ArrowLeft className="w-5 h-5 text-stone-600" /></button>
              <h2 className="text-base font-bold text-stone-900 flex-1">Appointments</h2>
              <button onClick={loadAppointments} className="text-xs text-teal-600 font-medium">Refresh</button>
            </div>

            {loading ? (
              <div className="py-12 text-center"><p className="text-sm text-stone-400">Loading...</p></div>
            ) : appointments.length === 0 ? (
              <div className="py-12 text-center">
                <Calendar className="w-10 h-10 text-stone-300 mx-auto mb-2" />
                <p className="text-sm text-stone-400">No appointments today</p>
              </div>
            ) : (
              <div className="space-y-2">
                {appointments.map(apt => (
                  <div key={apt.id} className="bg-white rounded-xl border border-stone-100 px-4 py-3.5">
                    <div className="flex items-center justify-between mb-1.5">
                      <p className="text-sm font-semibold text-stone-900">
                        {apt.patient ? `${apt.patient.firstName} ${apt.patient.lastName}` : "Patient"}
                      </p>
                      <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full",
                        apt.status === "COMPLETED" ? "bg-emerald-50 text-emerald-600" :
                        apt.status === "CHECKED_IN" ? "bg-blue-50 text-blue-600" :
                        apt.status === "NO_SHOW" ? "bg-red-50 text-red-600" :
                        apt.status === "CANCELLED" ? "bg-red-50 text-red-600" :
                        "bg-amber-50 text-amber-600"
                      )}>{apt.status?.replace("_", " ")}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-stone-400">
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{apt.time}</span>
                      {apt.doctor?.name && <span className="flex items-center gap-1"><Stethoscope className="w-3 h-3" />{apt.doctor.name}</span>}
                      <span>{apt.type}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* MORE TAB */}
        {tab === "more" && (
          <div className="px-5 py-4 space-y-2">
            <div className="flex items-center gap-2 -mx-1 mb-2">
              <button onClick={() => setTab("home")} className="p-1.5 rounded-lg hover:bg-stone-100"><ArrowLeft className="w-5 h-5 text-stone-600" /></button>
              <h2 className="text-base font-bold text-stone-900">More</h2>
            </div>

            {[
              { label: "New Patient", icon: <Plus className="w-5 h-5" />, color: "text-emerald-600", bg: "bg-emerald-50", action: () => setSubScreen("new-patient") },
              { label: "All Patients", icon: <Users className="w-5 h-5" />, color: "text-blue-600", bg: "bg-blue-50", action: () => setTab("patients") },
              { label: "Appointments", icon: <Calendar className="w-5 h-5" />, color: "text-violet-600", bg: "bg-violet-50", action: () => setTab("appointments") },
            ].map(item => (
              <button key={item.label} onClick={item.action}
                className="w-full bg-white rounded-xl border border-stone-100 px-4 py-3.5 flex items-center gap-3 active:bg-stone-50">
                <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", item.bg, item.color)}>{item.icon}</div>
                <span className="text-sm font-medium text-stone-900 flex-1 text-left">{item.label}</span>
                <ChevronRight className="w-4 h-4 text-stone-300" />
              </button>
            ))}

            <div className="mt-6 pt-4 border-t border-stone-100">
              <div className="bg-white rounded-xl border border-stone-100 p-4 mb-3">
                <p className="text-xs text-stone-400 mb-1">Signed in as</p>
                <p className="text-sm font-semibold text-stone-900">{user?.name}</p>
                <p className="text-xs text-stone-400">{user?.role?.replace("_", " ")}</p>
              </div>
              <button onClick={handleLogout}
                className="w-full py-3 bg-red-50 text-red-600 rounded-xl text-sm font-medium active:scale-[0.98]">
                Sign Out
              </button>
            </div>
          </div>
        )}
      </div>

      {/* BOTTOM NAV */}
      <div className="bg-white border-t border-stone-200 px-2 py-1.5 flex justify-around shrink-0" style={{ paddingBottom: "env(safe-area-inset-bottom, 8px)" }}>
        {([
          { id: "home" as Tab, label: "Home", icon: <Home className="w-5 h-5" /> },
          { id: "patients" as Tab, label: "Patients", icon: <Users className="w-5 h-5" /> },
          { id: "appointments" as Tab, label: "Schedule", icon: <Calendar className="w-5 h-5" /> },
          { id: "more" as Tab, label: "More", icon: <FileText className="w-5 h-5" /> },
        ]).map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={cn("flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl min-w-[60px]",
              tab === t.id ? "text-teal-600" : "text-stone-400"
            )}>
            {t.icon}
            <span className="text-[10px] font-medium">{t.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
