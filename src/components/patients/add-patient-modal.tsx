"use client";

import { useState, useEffect } from "react";
import { SlidePanel } from "@/components/ui/slide-panel";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { calculateAge } from "@/lib/utils";
import { useCreatePatient } from "@/hooks/use-queries";
import { useModuleEmit } from "@/modules/core/hooks";
import { SystemEvents } from "@/modules/core/events";
import { useAuth } from "@/lib/auth-context";
import { useRouter } from "next/navigation";
import {
  User, Phone, Mail, MapPin, Heart, ChevronDown, ChevronUp, CheckCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface AddPatientModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Pre-fill the form when opened (e.g. from a recent caller row in
   *  QuickBookPanel — pass phone + contact name so the receptionist
   *  isn't typing what we already know). Only the fields you care about
   *  need to be set. */
  prefill?: { firstName?: string; lastName?: string; phone?: string };
  /** Called once with the newly-created patient id after a successful
   *  registration — lets the caller chain into a follow-up flow (e.g.
   *  filling the patient slot in a booking dialog). */
  onCreated?: (patientId: string) => void;
}

const initialForm = {
  firstName: "",
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
  notes: "",
};

export function AddPatientModal({ isOpen, onClose, prefill, onCreated }: AddPatientModalProps) {
  const emit = useModuleEmit("MOD-PATIENT");
  const { user } = useAuth();
  const router = useRouter();
  const createPatient = useCreatePatient();
  const [form, setForm] = useState(initialForm);
  const [error, setError] = useState("");
  const [showMore, setShowMore] = useState(false);
  const [success, setSuccess] = useState(false);
  const [newPatientId, setNewPatientId] = useState("");

  // When the panel opens with prefill data, seed the form from it so the
  // receptionist sees the caller's name + phone already in place. We only
  // do this on each open transition (isOpen flipping true), not on every
  // prefill object identity change — the caller may rebuild it inline.
  useEffect(() => {
    if (!isOpen || !prefill) return;
    setForm((f) => ({
      ...f,
      firstName: prefill.firstName ?? f.firstName,
      lastName: prefill.lastName ?? f.lastName,
      phone: prefill.phone ?? f.phone,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const age = form.dateOfBirth ? calculateAge(form.dateOfBirth) : null;

  const set = (field: keyof typeof initialForm) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const setGender = (g: string) => setForm((f) => ({ ...f, gender: g }));

  const handleSubmit = async () => {
    if (!form.firstName.trim()) { setError("First name is required"); return; }
    if (!form.lastName.trim()) { setError("Last name is required"); return; }
    if (!form.phone.trim()) { setError("Phone number is required"); return; }
    if (!form.gender) { setError("Please select gender"); return; }
    setError("");

    try {
      const result = await createPatient.mutateAsync({
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        // Optional — only send when the receptionist actually entered one.
        dateOfBirth: form.dateOfBirth || undefined,
        gender: form.gender,
        phone: form.phone.trim(),
        email: form.email.trim() || undefined,
        address: form.address.trim() || undefined,
        city: form.city.trim() || undefined,
        emergencyContact: form.emergencyContact.trim() || undefined,
        emergencyPhone: form.emergencyPhone.trim() || undefined,
        bloodType: form.bloodType || undefined,
        notes: form.notes.trim() || undefined,
        branchId: user?.branchId || undefined,
      });

      emit(SystemEvents.PATIENT_CREATED, {
        patientName: `${form.firstName} ${form.lastName}`,
      });

      const patient = (result as unknown as Record<string, unknown>)?.data as Record<string, unknown> | undefined;
      const newId = (patient?.id as string) || "";
      setNewPatientId(newId);
      setSuccess(true);
      if (newId && onCreated) onCreated(newId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to register patient");
    }
  };

  const handleClose = () => {
    setForm(initialForm);
    setError("");
    setShowMore(false);
    setSuccess(false);
    setNewPatientId("");
    onClose();
  };

  const handleViewProfile = () => {
    handleClose();
    if (newPatientId) router.push(`/patients/${newPatientId}`);
  };

  return (
    <SlidePanel
      isOpen={isOpen}
      onClose={handleClose}
      title="New Patient"
      subtitle="Quick registration — details can be added later"
      width="md"
      data-id="PATIENT-PROFILE-CREATE"
      footer={success ? undefined : (
        <>
          <Button variant="outline" onClick={handleClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={createPatient.isPending}>
            {createPatient.isPending ? "Registering..." : "Register Patient"}
          </Button>
        </>
      )}
    >
      {success ? (
        <div className="flex flex-col items-center justify-center py-12 animate-fade-in">
          <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center mb-4">
            <CheckCircle className="w-8 h-8 text-emerald-500" />
          </div>
          <h3 className="text-lg font-semibold text-stone-900">Patient Registered</h3>
          <p className="text-sm text-stone-500 mt-1">{form.firstName} {form.lastName}</p>
          <div className="flex gap-3 mt-6">
            <Button variant="outline" onClick={handleClose}>Close</Button>
            <Button onClick={handleViewProfile}>View Profile</Button>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          {/* Error */}
          {error && (
            <div className="bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl px-4 py-2.5 animate-fade-in">
              {error}
            </div>
          )}

          {/* ---- ESSENTIAL FIELDS ---- */}

          {/* Name */}
          <div className="space-y-1">
            <div className="flex items-center gap-2 mb-2">
              <User className="w-4 h-4 text-teal-500" />
              <span className="text-xs font-semibold text-stone-400 uppercase tracking-wider">Name</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input placeholder="First name *" value={form.firstName} onChange={set("firstName")} />
              <Input placeholder="Last name *" value={form.lastName} onChange={set("lastName")} />
            </div>
          </div>

          {/* Gender — tap buttons */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-semibold text-stone-400 uppercase tracking-wider">Gender</span>
            </div>
            <div className="flex gap-2">
              {[
                { value: "MALE", label: "Male", emoji: "👨" },
                { value: "FEMALE", label: "Female", emoji: "👩" },
                { value: "OTHER", label: "Other", emoji: "🧑" },
              ].map((g) => (
                <button
                  key={g.value}
                  onClick={() => setGender(g.value)}
                  className={cn(
                    "flex-1 py-2.5 rounded-xl border-2 text-sm font-medium transition-all cursor-pointer",
                    form.gender === g.value
                      ? "border-teal-500 bg-teal-50 text-teal-700"
                      : "border-stone-200 bg-white text-stone-500 hover:border-stone-300"
                  )}
                >
                  <span className="mr-1.5">{g.emoji}</span>
                  {g.label}
                </button>
              ))}
            </div>
          </div>

          {/* DOB + Age */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Heart className="w-4 h-4 text-rose-400" />
              <span className="text-xs font-semibold text-stone-400 uppercase tracking-wider">Date of Birth (optional)</span>
            </div>
            <div className="flex gap-3 items-end">
              <div className="flex-1">
                <Input type="date" value={form.dateOfBirth} onChange={set("dateOfBirth")} />
              </div>
              {age !== null && (
                <div className="shrink-0 px-4 py-2.5 bg-teal-50 border border-teal-200 rounded-xl text-center">
                  <span className="text-lg font-bold text-teal-700">{age}</span>
                  <span className="text-xs text-teal-500 ml-1">years</span>
                </div>
              )}
            </div>
          </div>

          {/* Phone */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Phone className="w-4 h-4 text-blue-500" />
              <span className="text-xs font-semibold text-stone-400 uppercase tracking-wider">Contact</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input type="tel" placeholder="Phone number *" value={form.phone} onChange={set("phone")} />
              <Input type="email" placeholder="Email (optional)" value={form.email} onChange={set("email")} />
            </div>
          </div>

          {/* ---- OPTIONAL FIELDS (collapsible) ---- */}
          <button
            onClick={() => setShowMore(!showMore)}
            className="flex items-center gap-2 w-full text-sm text-stone-400 hover:text-stone-600 transition-colors cursor-pointer py-1"
          >
            <div className="flex-1 border-t border-stone-100" />
            <span className="flex items-center gap-1 shrink-0 text-xs font-medium">
              {showMore ? "Less details" : "More details"}
              {showMore ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </span>
            <div className="flex-1 border-t border-stone-100" />
          </button>

          {showMore && (
            <div className="space-y-4 animate-fade-in">
              {/* Address */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <MapPin className="w-4 h-4 text-amber-500" />
                  <span className="text-xs font-semibold text-stone-400 uppercase tracking-wider">Address</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Input placeholder="Street address" value={form.address} onChange={set("address")} />
                  <Input placeholder="City" value={form.city} onChange={set("city")} />
                </div>
              </div>

              {/* Emergency */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-semibold text-stone-400 uppercase tracking-wider">Emergency Contact</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Input placeholder="Contact name" value={form.emergencyContact} onChange={set("emergencyContact")} />
                  <Input placeholder="Contact phone" value={form.emergencyPhone} onChange={set("emergencyPhone")} />
                </div>
              </div>

              {/* Blood Type */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-semibold text-stone-400 uppercase tracking-wider">Blood Type</span>
                </div>
                <div className="flex gap-1.5 flex-wrap">
                  {["O+", "O-", "A+", "A-", "B+", "B-", "AB+", "AB-"].map((bt) => (
                    <button
                      key={bt}
                      onClick={() => setForm((f) => ({ ...f, bloodType: f.bloodType === bt ? "" : bt }))}
                      className={cn(
                        "px-3 py-1.5 rounded-lg border text-xs font-medium transition-all cursor-pointer",
                        form.bloodType === bt
                          ? "border-red-300 bg-red-50 text-red-700"
                          : "border-stone-200 bg-white text-stone-500 hover:border-stone-300"
                      )}
                    >
                      {bt}
                    </button>
                  ))}
                </div>
              </div>

              {/* Notes */}
              <Input placeholder="Any notes (allergies, conditions...)" value={form.notes} onChange={set("notes")} />
            </div>
          )}
        </div>
      )}
    </SlidePanel>
  );
}
