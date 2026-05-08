"use client";

import { Sparkles, MapPin, Clock } from "lucide-react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LoadingSpinner } from "@/components/ui/loading";
import { usePatientSkinHistory } from "@/hooks/use-queries";
import { formatDate } from "@/lib/utils";
import type { SkinHistory } from "@/types";

const severityVariant: Record<string, "success" | "warning" | "danger"> = {
  MILD: "success",
  MODERATE: "warning",
  SEVERE: "danger",
};

export function SkinHistoryTab({ patientId }: { patientId: string }) {
  const { data: response, isLoading } = usePatientSkinHistory(patientId);

  if (isLoading) return <LoadingSpinner />;

  const skinHistory = (response?.data || []) as SkinHistory[];

  return (
    <div data-id="PATIENT-SKIN-HISTORY-TAB" className="space-y-6">
      {skinHistory.length > 0 ? (
        skinHistory.map((entry) => (
          <Card key={entry.id} padding="md">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-teal-600" />
                  <h3 className="text-sm font-semibold text-stone-900">{entry.condition}</h3>
                </div>
                <Badge variant={severityVariant[entry.severity]}>{entry.severity}</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm">
                  <MapPin className="w-3.5 h-3.5 text-stone-500" />
                  <span className="text-stone-500">Affected Area:</span>
                  <span className="font-medium">{entry.affectedArea}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Clock className="w-3.5 h-3.5 text-stone-500" />
                  <span className="text-stone-500">Onset:</span>
                  <span className="font-medium">{formatDate(entry.onsetDate)}</span>
                </div>
                <div className="text-sm">
                  <p className="text-stone-500 mb-1">Treatment Timeline:</p>
                  <p className="font-medium">{entry.treatmentHistory}</p>
                </div>
                {entry.notes && (
                  <div className="text-sm p-3 rounded-lg bg-stone-50">
                    <p className="text-stone-500 text-xs mb-1">Notes</p>
                    <p>{entry.notes}</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ))
      ) : (
        <Card padding="md">
          <CardContent>
            <p className="text-sm text-stone-500 text-center py-4">
              No skin history recorded for this patient
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
