"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, User, Heart, Shield, CheckCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { calculateAge } from "@/lib/utils";
import { useCreatePatient } from "@/hooks/use-queries";
import { useModuleAccess, useModuleEmit } from "@/modules/core/hooks";
import { SystemEvents } from "@/modules/core/events";
import { useAuth } from "@/lib/auth-context";

const initialForm = {
  firstName: "",
  middleName: "",
  lastName: "",
  dateOfBirth: "",
  gender: "",
  phone: "",
  email: "",
  address: "",
  city: "",
  emergencyContact: "",
  emergencyPhone: "",
  bloodType: "",
  skinType: "",
  notes: "",
  payerId: "",
  insuranceProvider: "",
  policyNumber: "",
  coverageType: "",
  insuranceExpiry: "",
};

// v59 — Payer master row (subset the picker cares about).
interface PayerOption { id: string; code: string; name: string; isActive: boolean }

export default function NewPatientPage() {
  const router = useRouter();
  const access = useModuleAccess("MOD-PATIENT");
  const emit = useModuleEmit("MOD-PATIENT");
  const { user } = useAuth();
  const createPatient = useCreatePatient();

  const [activeTab, setActiveTab] = useState("personal");
  const [form, setForm] = useState(initialForm);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  // v59 — Active payers for the picker on the Insurance tab. Lazy
  // GET so a user that never opens that tab doesn't fetch them.
  const [payers, setPayers] = useState<PayerOption[]>([]);
  useEffect(() => {
    if (activeTab !== "insurance" || payers.length > 0) return;
    fetch("/api/admin/payers?active=true", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => { if (d?.success && Array.isArray(d.data)) setPayers(d.data as PayerOption[]); })
      .catch(() => {});
  }, [activeTab, payers.length]);

  const age = form.dateOfBirth ? calculateAge(form.dateOfBirth) : "";

  const set = (field: keyof typeof initialForm) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const validate = (): string | null => {
    if (!form.firstName.trim()) return "First name is required";
    if (!form.lastName.trim()) return "Last name is required";
    if (!form.phone.trim()) return "Phone number is required";
    if (!form.gender) return "Gender is required";
    return null;
  };

  const handleSubmit = async () => {
    const err = validate();
    if (err) { setError(err); return; }
    setError("");

    try {
      const result = await createPatient.mutateAsync({
        firstName: form.firstName.trim(),
        middleName: form.middleName.trim() || undefined,
        lastName: form.lastName.trim(),
        // DOB is optional at intake — receptionists fill it in later via Edit.
        dateOfBirth: form.dateOfBirth || undefined,
        gender: form.gender,
        phone: form.phone.trim(),
        email: form.email.trim() || undefined,
        address: form.address.trim() || undefined,
        city: form.city.trim() || undefined,
        emergencyContact: form.emergencyContact.trim() || undefined,
        emergencyPhone: form.emergencyPhone.trim() || undefined,
        bloodType: form.bloodType || undefined,
        skinType: form.skinType || undefined,
        notes: form.notes.trim() || undefined,
        branchId: user?.branchId || undefined,
      });

      emit(SystemEvents.PATIENT_CREATED, {
        patientName: `${form.firstName} ${form.lastName}`,
      });

      // Navigate to the new patient's profile after a brief delay
      const newPatient = (result as unknown as Record<string, unknown>)?.data as Record<string, unknown> | undefined;

      // v59 — Persist insurance row if the user filled the tab. We do
      // this AFTER patient creation (vs. embedding in the patient
      // create payload) so partial failures don't leave the patient
      // half-created. Either payerId or provider must be present.
      const newPatientId = typeof newPatient?.id === "string" ? newPatient.id : null;
      const wantsInsurance = !!(form.payerId || form.insuranceProvider.trim() || form.policyNumber.trim());
      if (newPatientId && wantsInsurance) {
        if (!form.policyNumber.trim()) {
          setError("Policy number is required when adding insurance — patient created without it.");
        } else {
          try {
            await fetch(`/api/patients/${newPatientId}/insurance`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify({
                payerId: form.payerId || undefined,
                provider: form.insuranceProvider.trim() || undefined,
                policyNumber: form.policyNumber.trim(),
                coverageType: form.coverageType || undefined,
                expiryDate: form.insuranceExpiry || undefined,
              }),
            });
          } catch {
            // Don't block redirection on a non-critical insurance save.
            // The user can re-add it from the patient profile.
          }
        }
      }

      setSuccess(true);
      setTimeout(() => {
        if (newPatient?.id) {
          router.push(`/patients/${newPatient.id}`);
        } else {
          router.push("/patients");
        }
      }, 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create patient");
    }
  };

  if (!access.canCreate) {
    return (
      <div className="flex items-center justify-center py-20 text-stone-500">
        You don&apos;t have permission to register patients.
      </div>
    );
  }

  if (success) {
    return (
      <div className="flex flex-col items-center justify-center py-20 animate-fade-in">
        <CheckCircle className="w-16 h-16 text-emerald-500 mb-4" />
        <h2 className="text-xl font-semibold text-stone-900">Patient Registered</h2>
        <p className="text-sm text-stone-500 mt-1">{form.firstName} {form.lastName} has been added successfully</p>
        <p className="text-xs text-stone-400 mt-3">Redirecting to patient profile...</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" iconLeft={<ArrowLeft className="w-4 h-4" />} onClick={() => router.back()}>
            Back
          </Button>
          <div>
            <h1 className="text-lg sm:text-xl font-semibold text-stone-900">Register New Patient</h1>
            <p className="text-xs text-stone-400">Fill in patient details to create a new record</p>
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl px-4 py-2.5">{error}</div>
      )}

      {/* Form */}
      <Card>
        <CardContent className="p-5 sm:p-6">
          <Tabs value={activeTab} onChange={(v) => setActiveTab(v)}>
            <TabsList>
              <TabsTrigger value="personal">
                <User className="w-3.5 h-3.5 mr-1.5" />
                Personal
              </TabsTrigger>
              <TabsTrigger value="medical">
                <Heart className="w-3.5 h-3.5 mr-1.5" />
                Medical
              </TabsTrigger>
              <TabsTrigger value="insurance">
                <Shield className="w-3.5 h-3.5 mr-1.5" />
                Insurance
              </TabsTrigger>
            </TabsList>

            {/* Personal */}
            <TabsContent value="personal">
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <Input label="First Name" placeholder="First name" required value={form.firstName} onChange={set("firstName")} />
                  <Input label="Middle Name" placeholder="Middle name" value={form.middleName} onChange={set("middleName")} />
                  <Input label="Last Name" placeholder="Last name" required value={form.lastName} onChange={set("lastName")} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <Input label="Date of Birth (optional)" type="date" value={form.dateOfBirth} onChange={set("dateOfBirth")} />
                  <Input label="Age" value={age !== "" ? String(age) : ""} readOnly placeholder="Auto" />
                  <Select label="Gender" required placeholder="Select" value={form.gender} onChange={set("gender")}
                    options={[{ value: "MALE", label: "Male" }, { value: "FEMALE", label: "Female" }, { value: "OTHER", label: "Other" }]} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input label="Phone" type="tel" placeholder="+92 300 0000000" required value={form.phone} onChange={set("phone")} />
                  <Input label="Email" type="email" placeholder="patient@email.com" value={form.email} onChange={set("email")} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input label="Address" placeholder="Street address" value={form.address} onChange={set("address")} />
                  <Input label="City" placeholder="City" value={form.city} onChange={set("city")} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input label="Emergency Contact" placeholder="Contact name" value={form.emergencyContact} onChange={set("emergencyContact")} />
                  <Input label="Emergency Phone" type="tel" placeholder="+92 300 0000000" value={form.emergencyPhone} onChange={set("emergencyPhone")} />
                </div>
                <div className="flex justify-end pt-2">
                  <Button onClick={() => setActiveTab("medical")}>Next</Button>
                </div>
              </div>
            </TabsContent>

            {/* Medical */}
            <TabsContent value="medical">
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Select label="Blood Type" placeholder="Select" value={form.bloodType} onChange={set("bloodType")}
                    options={["O+","O-","A+","A-","B+","B-","AB+","AB-"].map((v) => ({ value: v, label: v }))} />
                  <Select label="Skin Type (Fitzpatrick)" placeholder="Select" value={form.skinType} onChange={set("skinType")}
                    options={[
                      { value: "TYPE_I", label: "I — Very fair" },
                      { value: "TYPE_II", label: "II — Fair" },
                      { value: "TYPE_III", label: "III — Medium" },
                      { value: "TYPE_IV", label: "IV — Olive" },
                      { value: "TYPE_V", label: "V — Brown" },
                      { value: "TYPE_VI", label: "VI — Dark" },
                    ]} />
                </div>
                <Input label="Notes" placeholder="Allergies, medications, conditions..." value={form.notes} onChange={set("notes")} />
                <div className="flex justify-between pt-2">
                  <Button variant="outline" onClick={() => setActiveTab("personal")}>Back</Button>
                  <Button onClick={() => setActiveTab("insurance")}>Next</Button>
                </div>
              </div>
            </TabsContent>

            {/* Insurance */}
            <TabsContent value="insurance">
              <div className="space-y-4">
                {/* v59 — Payer master picker. Selecting a payer auto-
                    fills the Provider name (denormalized) but leaves
                    it editable in case the patient knows it by a
                    different name on their card. Free-text-only entry
                    is still allowed for niche / international payers. */}
                <div>
                  <Select
                    label="Payer (from master list)"
                    placeholder="Select an insurance company…"
                    value={form.payerId}
                    onChange={(e) => {
                      const v = e.target.value;
                      const p = payers.find((x) => x.id === v);
                      setForm((f) => ({
                        ...f,
                        payerId: v,
                        // Auto-fill provider name; user can still override.
                        insuranceProvider: p ? p.name : f.insuranceProvider,
                      }));
                    }}
                    options={payers.map((p) => ({ value: p.id, label: `${p.name} (${p.code})` }))}
                  />
                  <p className="text-[11px] text-stone-400 mt-1">
                    Pick a payer from the clinic master list (managed in <a href="/admin/payers" className="text-violet-600 hover:underline">/admin/payers</a>) — or leave blank and just type the provider name below for a one-off entry.
                  </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input label="Provider name on card" placeholder="Provider name (auto-fills from payer)" value={form.insuranceProvider} onChange={set("insuranceProvider")} />
                  <Input label="Policy Number" placeholder="Policy number" value={form.policyNumber} onChange={set("policyNumber")} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Select label="Coverage Type" placeholder="Select" value={form.coverageType} onChange={set("coverageType")}
                    options={[
                      { value: "full", label: "Full Coverage" },
                      { value: "partial", label: "Partial Coverage" },
                      { value: "cosmetic", label: "Cosmetic Only" },
                      { value: "medical", label: "Medical Only" },
                      { value: "none", label: "No Insurance" },
                    ]} />
                  <Input label="Expiration Date" type="date" value={form.insuranceExpiry} onChange={set("insuranceExpiry")} />
                </div>
                <div className="flex justify-between pt-2">
                  <Button variant="outline" onClick={() => setActiveTab("medical")}>Back</Button>
                  <Button onClick={handleSubmit} disabled={createPatient.isPending}>
                    {createPatient.isPending ? "Registering..." : "Register Patient"}
                  </Button>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
