"use client";

import { useState } from "react";
import {
  Calendar, Pill, Receipt, CalendarClock, Heart, Phone, User,
  Clock, CheckCircle, FileText, ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { formatDate, formatCurrency } from "@/lib/utils";

interface PortalData {
  patient: Record<string, unknown>;
  appointments: Record<string, unknown>[];
  prescriptions: Record<string, unknown>[];
  invoices: Record<string, unknown>[];
  followUps: Record<string, unknown>[];
}

export default function PatientPortal() {
  const [phone, setPhone] = useState("");
  const [patientCode, setPatientCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<PortalData | null>(null);
  const [activeTab, setActiveTab] = useState("appointments");

  const handleLogin = async () => {
    if (!phone.trim() && !patientCode.trim()) {
      setError("Enter your phone number or patient ID");
      return;
    }
    setError(""); setLoading(true);

    try {
      // Look up patient by phone or code
      const searchParam = patientCode.trim() || phone.trim();
      const res = await fetch(`/api/patients?search=${encodeURIComponent(searchParam)}&limit=1`);
      const result = await res.json();

      if (!result.success || !result.data?.length) {
        setError("Patient not found. Please check your details.");
        setLoading(false);
        return;
      }

      const patient = result.data[0];
      const id = patient.id;

      // Fetch patient data in parallel
      const [aptsRes, rxRes, invRes, fuRes] = await Promise.all([
        fetch(`/api/patients/${id}/appointments`).then((r) => r.json()),
        fetch(`/api/patients/${id}/prescriptions`).then((r) => r.json()),
        fetch(`/api/patients/${id}/billing`).then((r) => r.json()),
        fetch(`/api/patients/${id}/follow-ups`).then((r) => r.json()),
      ]);

      setData({
        patient,
        appointments: aptsRes.data || [],
        prescriptions: rxRes.data || [],
        invoices: Array.isArray(invRes.data) ? invRes.data : invRes.data?.invoices || [],
        followUps: fuRes.data || [],
      });
    } catch {
      setError("Something went wrong. Please try again.");
    }
    setLoading(false);
  };

  if (!data) {
    return (
      <div className="min-h-screen bg-[#FAFAF9] flex items-center justify-center px-4">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <div className="w-14 h-14 gradient-warm rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-sm">
              <span className="text-2xl font-bold text-white">M</span>
            </div>
            <h1 className="text-2xl font-bold text-stone-900">Patient Portal</h1>
            <p className="text-sm text-stone-500 mt-1">View your appointments, prescriptions, and invoices</p>
          </div>

          {error && <div className="bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl px-4 py-2.5 mb-4">{error}</div>}

          <div className="space-y-3">
            <Input label="Phone Number" type="tel" placeholder="+92 300 0000000" value={phone} onChange={(e) => setPhone(e.target.value)} />
            <div className="text-center text-xs text-stone-400">or</div>
            <Input label="Patient ID" placeholder="PT-0001" value={patientCode} onChange={(e) => setPatientCode(e.target.value)} />
            <Button className="w-full" onClick={handleLogin} disabled={loading}>
              {loading ? "Looking up..." : "Access My Records"}
            </Button>
          </div>

          <p className="text-center text-xs text-stone-400 mt-6">
            Powered by MediCore Clinic ERP
          </p>
        </div>
      </div>
    );
  }

  const patient = data.patient;
  const name = `${patient.firstName} ${patient.lastName}`;

  const tabs = [
    { value: "appointments", label: "Appointments", icon: <Calendar className="w-4 h-4" />, count: data.appointments.length },
    { value: "prescriptions", label: "Prescriptions", icon: <Pill className="w-4 h-4" />, count: data.prescriptions.length },
    { value: "billing", label: "Billing", icon: <Receipt className="w-4 h-4" />, count: data.invoices.length },
    { value: "followups", label: "Follow-Ups", icon: <CalendarClock className="w-4 h-4" />, count: data.followUps.length },
  ];

  return (
    <div className="min-h-screen bg-[#FAFAF9]">
      {/* Header */}
      <div className="bg-white border-b border-stone-100 px-4 py-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Avatar name={name} size="md" className="ring-2 ring-teal-200" />
            <div>
              <h1 className="text-base font-bold text-stone-900">{name}</h1>
              <p className="text-xs text-stone-400">{String(patient.patientCode)} &middot; {String(patient.phone)}</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setData(null)}>Sign Out</Button>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-5 space-y-4">
        {/* Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto tabs-scroll">
          {tabs.map((t) => (
            <button key={t.value} onClick={() => setActiveTab(t.value)}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium whitespace-nowrap cursor-pointer transition-all ${
                activeTab === t.value ? "bg-teal-50 text-teal-700 border border-teal-200" : "bg-white text-stone-500 border border-stone-200"
              }`}>
              {t.icon} {t.label} <span className="text-[10px] opacity-60">({t.count})</span>
            </button>
          ))}
        </div>

        {/* Appointments */}
        {activeTab === "appointments" && (
          <div className="space-y-2">
            {data.appointments.length === 0 ? <EmptyMsg text="No appointments found" /> :
              data.appointments.map((a, i) => (
                <Card key={i}>
                  <CardContent className="p-4 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600"><Calendar className="w-5 h-5" /></div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-stone-900">{String(a.type || "").replace("_", " ")} — {String(a.date || "").split("T")[0]}</p>
                      <p className="text-xs text-stone-400">{String(a.startTime || "")} &middot; {String((a as Record<string, unknown>).doctorName || (a as Record<string, Record<string, unknown>>).doctor?.name || "Doctor")}</p>
                    </div>
                    <Badge variant={a.status === "COMPLETED" ? "success" : a.status === "CANCELLED" ? "danger" : "info"} className="text-[10px]">
                      {String(a.status || "").replace("_", " ")}
                    </Badge>
                  </CardContent>
                </Card>
              ))
            }
          </div>
        )}

        {/* Prescriptions */}
        {activeTab === "prescriptions" && (
          <div className="space-y-2">
            {data.prescriptions.length === 0 ? <EmptyMsg text="No prescriptions found" /> :
              data.prescriptions.map((rx, i) => {
                const items = (rx.items as Record<string, unknown>[]) || [];
                return (
                  <Card key={i}>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <Pill className="w-4 h-4 text-emerald-500" />
                        <span className="text-sm font-medium text-stone-900">{formatDate(String(rx.createdAt))}</span>
                        <Badge variant="success" className="text-[10px]">Active</Badge>
                      </div>
                      {items.map((item, j) => (
                        <p key={j} className="text-xs text-stone-600 ml-6">
                          {String(item.medicineName)} — {String(item.dosage || "")} {String(item.frequency || "")} for {String(item.duration || "")}
                        </p>
                      ))}
                    </CardContent>
                  </Card>
                );
              })
            }
          </div>
        )}

        {/* Billing */}
        {activeTab === "billing" && (
          <div className="space-y-2">
            {data.invoices.length === 0 ? <EmptyMsg text="No invoices found" /> :
              data.invoices.map((inv, i) => (
                <Card key={i}>
                  <CardContent className="p-4 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-violet-50 flex items-center justify-center text-violet-600"><Receipt className="w-5 h-5" /></div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-stone-900">{String(inv.invoiceNumber)}</p>
                      <p className="text-xs text-stone-400">{formatDate(String(inv.createdAt))}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-stone-900">{formatCurrency(Number(inv.total || 0))}</p>
                      <Badge variant={inv.status === "PAID" ? "success" : inv.status === "OVERDUE" ? "danger" : "warning"} className="text-[10px]">
                        {String(inv.status)}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              ))
            }
          </div>
        )}

        {/* Follow-Ups */}
        {activeTab === "followups" && (
          <div className="space-y-2">
            {data.followUps.length === 0 ? <EmptyMsg text="No follow-ups scheduled" /> :
              data.followUps.map((fu, i) => (
                <Card key={i}>
                  <CardContent className="p-4 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600"><CalendarClock className="w-5 h-5" /></div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-stone-900">{String(fu.reason)}</p>
                      <p className="text-xs text-stone-400">Due: {String(fu.dueDate || "").split("T")[0]}</p>
                    </div>
                    <Badge variant={fu.status === "COMPLETED" ? "success" : fu.status === "MISSED" ? "danger" : "warning"} className="text-[10px]">
                      {String(fu.status)}
                    </Badge>
                  </CardContent>
                </Card>
              ))
            }
          </div>
        )}
      </div>
    </div>
  );
}

function EmptyMsg({ text }: { text: string }) {
  return <div className="py-8 text-center text-sm text-stone-400">{text}</div>;
}
