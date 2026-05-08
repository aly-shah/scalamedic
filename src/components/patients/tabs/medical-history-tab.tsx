"use client";

import { Stethoscope, AlertTriangle, Pill } from "lucide-react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
// Medical history and allergies come from the patient profile (props).
// Prescriptions are fetched via usePatientPrescriptions.
import { LoadingSpinner } from "@/components/ui/loading";
import { usePatientPrescriptions } from "@/hooks/use-queries";
import { formatDate, patientAllergyLabels } from "@/lib/utils";
import type { Patient, Prescription, MedicalHistory } from "@/types";

const conditionStatusVariant: Record<string, "success" | "warning" | "danger" | "info" | "default"> = {
  ACTIVE: "warning",
  RESOLVED: "success",
  CHRONIC: "danger",
};

export function MedicalHistoryTab({ patient }: { patient: Patient }) {
  const history = ((patient as unknown as Record<string, unknown>).medicalHistory || []) as MedicalHistory[];
  const { data: rxResponse, isLoading } = usePatientPrescriptions(patient.id);

  if (isLoading) return <LoadingSpinner />;

  const prescriptions = (rxResponse?.data || []) as Prescription[];

  return (
    <div data-id="PATIENT-MEDICAL-HISTORY-TAB" className="space-y-6">
      {/* Allergies */}
      <Card padding="md">
        <CardHeader>
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-500" />
            <h3 className="text-sm font-semibold text-stone-900">Allergies</h3>
          </div>
        </CardHeader>
        <CardContent>
          {(() => {
            const labels = patientAllergyLabels(patient.allergies);
            return labels.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {labels.map((allergy) => (
                  <Badge key={allergy} variant="danger">{allergy}</Badge>
                ))}
              </div>
            ) : (
              <p className="text-sm text-stone-500">No known allergies (NKDA)</p>
            );
          })()}
        </CardContent>
      </Card>

      {/* Medical Conditions */}
      <Card padding="md">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Stethoscope className="w-4 h-4 text-teal-600" />
            <h3 className="text-sm font-semibold text-stone-900">
              Medical Conditions ({history.length})
            </h3>
          </div>
        </CardHeader>
        <CardContent>
          {history.length > 0 ? (
            <div className="space-y-4">
              {history.map((h) => (
                <div key={h.id} className="flex items-start justify-between p-3 rounded-lg bg-stone-50">
                  <div>
                    <p className="font-medium text-sm">{h.condition}</p>
                    <p className="text-xs text-stone-500 mt-1">
                      Diagnosed: {formatDate(h.diagnosedDate)}
                    </p>
                    {h.notes && (
                      <p className="text-xs text-stone-500 mt-1">{h.notes}</p>
                    )}
                  </div>
                  <Badge variant={conditionStatusVariant[h.status] || "default"}>
                    {h.status}
                  </Badge>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-stone-500">No medical history recorded</p>
          )}
        </CardContent>
      </Card>

      {/* Current Medications */}
      <Card padding="md">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Pill className="w-4 h-4 text-emerald-500" />
            <h3 className="text-sm font-semibold text-stone-900">Current Medications</h3>
          </div>
        </CardHeader>
        <CardContent>
          {prescriptions.length > 0 ? (
            <div className="space-y-4">
              {prescriptions.map((rx) => (
                <div key={rx.id} className="border border-stone-200 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-stone-500">
                      Prescribed by {rx.doctorName} on {formatDate(rx.createdAt)}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {rx.items.map((item) => (
                      <div key={item.id} className="text-sm">
                        <p className="font-medium">{item.medicineName}</p>
                        <p className="text-xs text-stone-500">
                          {item.dosage} | {item.frequency} | {item.duration}
                        </p>
                        <p className="text-xs text-stone-500 italic">{item.instructions}</p>
                      </div>
                    ))}
                  </div>
                  {rx.notes && (
                    <p className="text-xs text-stone-500 mt-2 pt-2 border-t border-stone-200">
                      {rx.notes}
                    </p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-stone-500">No current medications</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
