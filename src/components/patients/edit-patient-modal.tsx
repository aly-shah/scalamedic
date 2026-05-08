"use client";

import { useState } from "react";
import { SlidePanel } from "@/components/ui/slide-panel";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { calculateAge } from "@/lib/utils";
import { useUpdatePatient } from "@/hooks/use-queries";
import { useModuleEmit } from "@/modules/core/hooks";
import { SystemEvents } from "@/modules/core/events";
import type { Patient } from "@/types";

interface EditPatientModalProps {
  isOpen: boolean;
  onClose: () => void;
  patient: Patient;
}

function buildFormFromPatient(patient: Patient) {
  return {
    firstName: patient.firstName || "",
    middleName: (patient as unknown as Record<string, unknown>).middleName as string || "",
    lastName: patient.lastName || "",
    dateOfBirth: patient.dateOfBirth || "",
    gender: patient.gender || "",
    phone: patient.phone || "",
    email: patient.email || "",
    address: patient.address || "",
    city: patient.city || "",
    emergencyContact: patient.emergencyContact || "",
    emergencyPhone: patient.emergencyPhone || "",
    bloodType: patient.bloodType || "",
    skinType: patient.skinType || "",
    notes: patient.notes || "",
    isVip: Boolean((patient as unknown as Record<string, unknown>).isVip),
    isActive: patient.isActive,
  };
}

export function EditPatientModal({ isOpen, onClose, patient }: EditPatientModalProps) {
  const emit = useModuleEmit("MOD-PATIENT");
  const updatePatient = useUpdatePatient();
  const [activeTab, setActiveTab] = useState("personal");
  const [form, setForm] = useState(() => buildFormFromPatient(patient));
  const [error, setError] = useState("");

  // Re-sync form when patient prop changes or modal opens
  const [prevKey, setPrevKey] = useState(`${patient.id}-${isOpen}`);
  const currentKey = `${patient.id}-${isOpen}`;
  if (currentKey !== prevKey) {
    setPrevKey(currentKey);
    if (isOpen) {
      setForm(buildFormFromPatient(patient));
      setError("");
    }
  }

  const age = form.dateOfBirth ? calculateAge(form.dateOfBirth) : "";

  const set = (field: keyof typeof form) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const setChecked = (field: "isVip" | "isActive") => (
    e: React.ChangeEvent<HTMLInputElement>
  ) => setForm((f) => ({ ...f, [field]: e.target.checked }));

  const validate = (): string | null => {
    if (!form.firstName.trim()) return "First name is required";
    if (!form.lastName.trim()) return "Last name is required";
    if (!form.phone.trim()) return "Phone number is required";
    if (!form.dateOfBirth) return "Date of birth is required";
    if (!form.gender) return "Gender is required";
    return null;
  };

  const handleSubmit = async () => {
    const err = validate();
    if (err) {
      setError(err);
      return;
    }
    setError("");

    try {
      await updatePatient.mutateAsync({
        id: patient.id,
        data: {
          firstName: form.firstName.trim(),
          middleName: form.middleName.trim() || undefined,
          lastName: form.lastName.trim(),
          dateOfBirth: form.dateOfBirth,
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
          isVip: form.isVip,
          isActive: form.isActive,
        },
      });

      emit(SystemEvents.PATIENT_UPDATED, {
        patientId: patient.id,
        patientName: `${form.firstName} ${form.lastName}`,
      });

      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update patient");
    }
  };

  const handleClose = () => {
    setError("");
    onClose();
  };

  return (
    <SlidePanel
      isOpen={isOpen}
      onClose={handleClose}
      title="Edit Patient"
      subtitle={`${patient.firstName} ${patient.lastName}`}
      width="lg"
      data-id="PATIENT-PROFILE-EDIT"
    >
      <Tabs value={activeTab} onChange={(v) => setActiveTab(v)}>
        <TabsList>
          <TabsTrigger value="personal">Personal Information</TabsTrigger>
          <TabsTrigger value="medical">Medical</TabsTrigger>
        </TabsList>

        {/* Error display */}
        {error && (
          <div className="mt-3 bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl px-4 py-2.5">
            {error}
          </div>
        )}

        {/* Tab 1 - Personal Information */}
        <TabsContent value="personal">
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Input label="First Name" placeholder="First name" required value={form.firstName} onChange={set("firstName")} />
              <Input label="Middle Name" placeholder="Middle name" value={form.middleName} onChange={set("middleName")} />
              <Input label="Last Name" placeholder="Last name" required value={form.lastName} onChange={set("lastName")} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Input label="Date of Birth" type="date" required value={form.dateOfBirth} onChange={set("dateOfBirth")} />
              <Input label="Age" value={age !== "" ? String(age) : ""} readOnly placeholder="Auto-calculated" />
              <Select
                label="Gender"
                required
                placeholder="Select gender"
                value={form.gender}
                onChange={set("gender")}
                options={[
                  { value: "MALE", label: "Male" },
                  { value: "FEMALE", label: "Female" },
                  { value: "OTHER", label: "Other" },
                ]}
              />
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

        {/* Tab 2 - Medical */}
        <TabsContent value="medical">
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Select
                label="Blood Type"
                placeholder="Select blood type"
                value={form.bloodType}
                onChange={set("bloodType")}
                options={[
                  { value: "O+", label: "O+" },
                  { value: "O-", label: "O-" },
                  { value: "A+", label: "A+" },
                  { value: "A-", label: "A-" },
                  { value: "B+", label: "B+" },
                  { value: "B-", label: "B-" },
                  { value: "AB+", label: "AB+" },
                  { value: "AB-", label: "AB-" },
                ]}
              />
              <Select
                label="Skin Type (Fitzpatrick Scale)"
                placeholder="Select skin type"
                value={form.skinType}
                onChange={set("skinType")}
                options={[
                  { value: "TYPE_I", label: "Type I — Very fair, always burns" },
                  { value: "TYPE_II", label: "Type II — Fair, burns easily" },
                  { value: "TYPE_III", label: "Type III — Medium, sometimes burns" },
                  { value: "TYPE_IV", label: "Type IV — Olive, rarely burns" },
                  { value: "TYPE_V", label: "Type V — Brown, very rarely burns" },
                  { value: "TYPE_VI", label: "Type VI — Dark, never burns" },
                ]}
              />
            </div>
            <Input label="Notes" placeholder="Any notes about allergies, medications, conditions..." value={form.notes} onChange={set("notes")} />
            <div className="flex items-center gap-6">
              <label className="flex items-center gap-2 text-sm text-stone-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.isVip}
                  onChange={setChecked("isVip")}
                  className="rounded border-stone-300 text-teal-600 focus:ring-teal-500"
                />
                VIP Patient
              </label>
              <label className="flex items-center gap-2 text-sm text-stone-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={setChecked("isActive")}
                  className="rounded border-stone-300 text-teal-600 focus:ring-teal-500"
                />
                Active
              </label>
            </div>
            <div className="flex justify-between pt-2">
              <Button variant="outline" onClick={() => setActiveTab("personal")}>Back</Button>
              <Button
                onClick={handleSubmit}
                disabled={updatePatient.isPending}
              >
                {updatePatient.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </SlidePanel>
  );
}
