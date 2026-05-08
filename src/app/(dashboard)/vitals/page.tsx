"use client";

import { useState } from "react";
import {
  Thermometer,
  Heart,
  Wind,
  Activity,
  Weight,
  Ruler,
  Droplets,
  Save,
  User,
} from "lucide-react";
import {
  Button,
  Card,
  CardHeader,
  CardContent,
  Input,
  Select,
  Textarea,
  SearchInput,
  Badge,
} from "@/components/ui";
import { calculateBMI, patientAllergyLabels } from "@/lib/utils";
import { useModuleAccess, useModuleEmit } from "@/modules/core/hooks";
import { usePatients, usePatient } from "@/hooks/use-queries";
import { LoadingSpinner } from "@/components/ui/loading";
import type { Patient } from "@/types";
import { SystemEvents } from "@/modules/core/events";

export default function VitalsPage() {
  const access = useModuleAccess("MOD-APPOINTMENT");
  const emit = useModuleEmit("MOD-APPOINTMENT");
  const [patientSearch, setPatientSearch] = useState("");

  // Read patientId from URL if navigated from patient profile
  const [selectedPatientId, setSelectedPatientId] = useState(
    () => typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("patientId") || "" : ""
  );

  const searchParams = patientSearch.length >= 2 ? { search: patientSearch } : undefined;
  const { data: patientsResponse, isLoading } = usePatients(searchParams);
  const allPatients = (patientsResponse?.data || []) as Patient[];

  // Fetch individual patient when preselected (list only returns 20)
  const { data: singlePatientRes } = usePatient(selectedPatientId);
  const singlePatient = (singlePatientRes?.data || null) as Patient | null;

  // Vitals
  const [temperature, setTemperature] = useState("");
  const [systolicBP, setSystolicBP] = useState("");
  const [diastolicBP, setDiastolicBP] = useState("");
  const [heartRate, setHeartRate] = useState("");
  const [respiratoryRate, setRespiratoryRate] = useState("");
  const [weight, setWeight] = useState("");
  const [height, setHeight] = useState("");
  const [oxygenSat, setOxygenSat] = useState("");

  // Assessment
  const [notes, setNotes] = useState("");
  const [skinObservations, setSkinObservations] = useState("");
  const [urgencyLevel, setUrgencyLevel] = useState("NORMAL");

  const w = parseFloat(weight);
  const h = parseFloat(height);
  const bmi = (w > 0 && h > 0) ? calculateBMI(w, h) : "--";

  const selectedPatient = allPatients.find((p) => p.id === selectedPatientId) || singlePatient;

  const filteredPatients = allPatients;

  const handleSubmit = () => {
    emit(
      SystemEvents.VITALS_RECORDED,
      { patientName: selectedPatient ? `${selectedPatient.firstName} ${selectedPatient.lastName}` : "", details: `BP: ${systolicBP}/${diastolicBP}, HR: ${heartRate}, Temp: ${temperature}` },
      { patientId: selectedPatientId }
    );
  };

  if (isLoading) {
    return <div className="flex items-center justify-center py-20"><LoadingSpinner size="lg" /></div>;
  }

  if (!access.canView) {
    return (
      <div className="flex items-center justify-center py-20 text-stone-500">
        You don&apos;t have access to this module.
      </div>
    );
  }

  return (
    <div data-id="FLOW-CHECKIN" className="animate-fade-in space-y-4 sm:space-y-6">
      {/* Header with patient name */}
      <div>
        <h1 className="text-xl sm:text-2xl font-semibold text-stone-900">
          Vitals & Triage
        </h1>
        {selectedPatient ? (
          <div className="flex items-center gap-3 mt-2">
            <div className="w-10 h-10 rounded-full bg-teal-100 flex items-center justify-center">
              <span className="text-sm font-bold text-teal-700">{selectedPatient.firstName?.[0]}{selectedPatient.lastName?.[0]}</span>
            </div>
            <div>
              <p className="text-base font-semibold text-stone-900">{selectedPatient.firstName} {selectedPatient.lastName}</p>
              <p className="text-xs text-stone-400">{selectedPatient.patientCode} · {selectedPatient.phone || "No phone"}</p>
            </div>
            <button onClick={() => setSelectedPatientId("")} className="ml-auto text-xs text-teal-600 hover:underline cursor-pointer">Change</button>
          </div>
        ) : (
          <p className="text-sm text-stone-500 mt-1">Select a patient to record vitals</p>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        {/* Patient Selection — SearchSelect style */}
        <div className="lg:col-span-1 space-y-4">
          {!selectedPatient && (
          <Card padding="md" className="bg-white rounded-2xl border border-stone-100 shadow-sm">
            <CardHeader>
              <h2 className="text-base font-semibold text-stone-900">
                Search Patient
              </h2>
            </CardHeader>
            <CardContent className="space-y-3">
              <SearchInput
                placeholder="Type name, phone, or patient code..."
                value={patientSearch}
                onChange={setPatientSearch}
              />
              {patientSearch.length >= 2 && filteredPatients.length === 0 && (
                <p className="text-xs text-stone-400 text-center py-4">No patients found</p>
              )}
              {filteredPatients.slice(0, 8).map((patient) => (
                <button
                  key={patient.id}
                  onClick={() => { setSelectedPatientId(patient.id); setPatientSearch(""); }}
                  className="w-full text-left p-3 rounded-xl bg-stone-50 hover:bg-teal-50 hover:border-teal-200 border border-stone-100 transition-all cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-teal-50 text-teal-700 flex items-center justify-center text-xs font-semibold">
                      {patient.firstName?.[0]}{patient.lastName?.[0]}
                    </div>
                    <div>
                      <p className="font-medium text-sm text-stone-900">{patient.firstName} {patient.lastName}</p>
                      <p className="text-xs text-stone-400">{patient.patientCode} · {patient.phone || ""}</p>
                    </div>
                  </div>
                </button>
              ))}
              {patientSearch.length < 2 && (
                <p className="text-xs text-stone-400 text-center py-2">Type at least 2 characters to search</p>
              )}
            </CardContent>
          </Card>
          )}

          {/* Selected Patient Info */}
          {selectedPatient && (
            <Card className="bg-white rounded-2xl border border-stone-100 shadow-sm animate-fade-in">
              <CardContent>
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between items-center py-1">
                    <span className="text-stone-400">Blood Type</span>
                    <Badge variant="default">
                      {selectedPatient.bloodType || "N/A"}
                    </Badge>
                  </div>
                  <div className="border-t border-stone-50" />
                  <div className="flex justify-between items-start py-1">
                    <span className="text-stone-400">Allergies</span>
                    <div className="flex flex-wrap gap-1 justify-end max-w-[60%]">
                      {(() => {
                        const labels = patientAllergyLabels(selectedPatient.allergies);
                        return labels.length > 0 ? (
                          labels.map((a) => (
                            <Badge key={a} variant="danger">
                              {a}
                            </Badge>
                          ))
                        ) : (
                          <span className="text-stone-500 text-xs">None</span>
                        );
                      })()}
                    </div>
                  </div>
                  <div className="border-t border-stone-50" />
                  <div className="flex justify-between items-center py-1">
                    <span className="text-stone-400">Skin Type</span>
                    <span className="font-medium text-stone-700">
                      {selectedPatient.skinType || "N/A"}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Vitals Form */}
        <div className="lg:col-span-2 space-y-6">
          <Card padding="md" className="bg-white rounded-2xl border border-stone-100 shadow-sm">
            <CardHeader>
              <h2 className="text-base font-semibold text-stone-900">
                Vital Signs
              </h2>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-5">
                <Input
                  label="Temperature (&deg;C)"
                  type="number"
                  step="0.1"
                  placeholder="36.5"
                  value={temperature}
                  onChange={(e) => setTemperature(e.target.value)}
                  iconLeft={<Thermometer className="w-4 h-4" />}
                />
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-stone-700">
                    Blood Pressure (mmHg)
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      placeholder="Systolic"
                      value={systolicBP}
                      onChange={(e) => setSystolicBP(e.target.value)}
                      className="w-full px-3.5 py-2.5 text-sm bg-white border border-stone-200 rounded-xl text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all"
                    />
                    <span className="text-stone-300 font-bold text-lg">/</span>
                    <input
                      type="number"
                      placeholder="Diastolic"
                      value={diastolicBP}
                      onChange={(e) => setDiastolicBP(e.target.value)}
                      className="w-full px-3.5 py-2.5 text-sm bg-white border border-stone-200 rounded-xl text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all"
                    />
                  </div>
                </div>
                <Input
                  label="Heart Rate (bpm)"
                  type="number"
                  placeholder="72"
                  value={heartRate}
                  onChange={(e) => setHeartRate(e.target.value)}
                  iconLeft={<Heart className="w-4 h-4" />}
                />
                <Input
                  label="Respiratory Rate (/min)"
                  type="number"
                  placeholder="16"
                  value={respiratoryRate}
                  onChange={(e) => setRespiratoryRate(e.target.value)}
                  iconLeft={<Wind className="w-4 h-4" />}
                />
                <Input
                  label="Weight (kg)"
                  type="number"
                  step="0.1"
                  placeholder="70"
                  value={weight}
                  onChange={(e) => setWeight(e.target.value)}
                  iconLeft={<Weight className="w-4 h-4" />}
                />
                <Input
                  label="Height (cm)"
                  type="number"
                  placeholder="170"
                  value={height}
                  onChange={(e) => setHeight(e.target.value)}
                  iconLeft={<Ruler className="w-4 h-4" />}
                />
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-stone-700">
                    BMI (Auto)
                  </label>
                  <div className="flex items-center px-3.5 py-2.5 bg-stone-50 border border-stone-100 rounded-xl">
                    <Activity className="w-4 h-4 text-stone-400 mr-2" />
                    <span className="text-sm font-semibold text-stone-900">
                      {bmi}
                    </span>
                    {bmi !== "--" && (
                      <span className="ml-2 text-xs text-stone-400">
                        {parseFloat(bmi) < 18.5
                          ? "Underweight"
                          : parseFloat(bmi) < 25
                          ? "Normal"
                          : parseFloat(bmi) < 30
                          ? "Overweight"
                          : "Obese"}
                      </span>
                    )}
                  </div>
                </div>
                <Input
                  label="O2 Saturation (%)"
                  type="number"
                  placeholder="98"
                  value={oxygenSat}
                  onChange={(e) => setOxygenSat(e.target.value)}
                  iconLeft={<Droplets className="w-4 h-4" />}
                />
              </div>
            </CardContent>
          </Card>

          {/* Assessment */}
          <Card padding="md" className="bg-white rounded-2xl border border-stone-100 shadow-sm">
            <CardHeader>
              <h2 className="text-base font-semibold text-stone-900">
                Assessment
              </h2>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                label="Notes"
                placeholder="General assessment notes..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
              />
              <Textarea
                label="Skin Observations"
                placeholder="Describe visible skin conditions, rashes, lesions..."
                value={skinObservations}
                onChange={(e) => setSkinObservations(e.target.value)}
                rows={3}
              />
              <Select
                label="Urgency Level"
                options={[
                  { value: "NORMAL", label: "Normal" },
                  { value: "URGENT", label: "Urgent" },
                  { value: "EMERGENCY", label: "Emergency" },
                ]}
                value={urgencyLevel}
                onChange={(e) => setUrgencyLevel(e.target.value)}
              />
            </CardContent>
          </Card>

          {/* Submit */}
          <div className="flex justify-end pb-6">
            <Button
              size="lg"
              iconLeft={<Save className="w-5 h-5" />}
              onClick={handleSubmit}
              disabled={!selectedPatientId}
            >
              Submit Vitals
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
