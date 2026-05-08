"use client";

import { Package, AlertTriangle } from "lucide-react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LoadingSpinner } from "@/components/ui/loading";
import { usePatientPackages } from "@/hooks/use-queries";
import { formatDate } from "@/lib/utils";
import type { PatientPackage } from "@/types";

/* API shape: patientPackage.package.treatments is a relational PackageTreatment[] */
type EnrichedPatientPackage = PatientPackage & {
  package?: { treatments?: { id: string; name: string; sessions: number }[] };
};

function daysUntil(dateStr: string): number {
  const target = new Date(dateStr);
  const now = new Date();
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

export function PackagesTab({ patientId }: { patientId: string }) {
  const { data: response, isLoading } = usePatientPackages(patientId);

  if (isLoading) return <LoadingSpinner />;

  const patientPackages = (response?.data || []) as EnrichedPatientPackage[];

  return (
    <div data-id="PATIENT-PACKAGES-TAB" className="space-y-4">
      {patientPackages.length > 0 ? (
        patientPackages.map((pp) => {
          const treatments = pp.package?.treatments || [];
          const totalSessions = treatments.reduce((sum, t) => sum + t.sessions, 0);
          const remainingTotal = Object.values(pp.remainingSessions).reduce(
            (sum, v) => sum + v,
            0
          );
          const usedTotal = totalSessions - remainingTotal;
          const progressPercent = totalSessions > 0 ? (usedTotal / totalSessions) * 100 : 0;
          const daysLeft = daysUntil(pp.expiryDate);

          return (
            <Card key={pp.id} padding="md">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Package className="w-4 h-4 text-teal-600" />
                    <h3 className="text-sm font-semibold text-stone-900">{pp.packageName}</h3>
                  </div>
                  <Badge
                    variant={pp.status === "ACTIVE" ? "success" : pp.status === "EXPIRED" ? "danger" : "default"}
                    dot
                  >
                    {pp.status}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {/* Dates */}
                  <div className="flex items-center gap-6 text-sm">
                    <div>
                      <span className="text-stone-500">Purchased: </span>
                      <span className="font-medium">{formatDate(pp.purchaseDate)}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-stone-500">Expires: </span>
                      <span
                        className={`font-medium ${
                          daysLeft < 7
                            ? "text-red-600"
                            : daysLeft < 30
                            ? "text-amber-600"
                            : "text-stone-900"
                        }`}
                      >
                        {formatDate(pp.expiryDate)}
                      </span>
                      {daysLeft < 7 && daysLeft > 0 && (
                        <span className="inline-flex items-center gap-0.5 ml-1 text-xs text-red-600">
                          <AlertTriangle className="w-3 h-3" />
                          {daysLeft}d left
                        </span>
                      )}
                      {daysLeft <= 0 && pp.status === "ACTIVE" && (
                        <span className="inline-flex items-center gap-0.5 ml-1 text-xs text-red-600">
                          <AlertTriangle className="w-3 h-3" />
                          Overdue
                        </span>
                      )}
                      {daysLeft >= 7 && daysLeft < 30 && (
                        <span className="inline-flex items-center gap-0.5 ml-1 text-xs text-amber-600">
                          <AlertTriangle className="w-3 h-3" />
                          {daysLeft}d left
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Overall Progress */}
                  <div>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="text-stone-500">Overall Progress</span>
                      <span className="font-medium">{usedTotal}/{totalSessions} sessions</span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-stone-50">
                      <div
                        className="h-2 rounded-full bg-teal-600 transition-all"
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>
                  </div>

                  {/* Per-treatment breakdown */}
                  <div className="space-y-3">
                    {Object.entries(pp.remainingSessions).map(([treatment, remaining]) => {
                      const pkgTreatment = treatments.find((t) => t.name === treatment);
                      const total = pkgTreatment?.sessions || remaining;
                      const used = total - remaining;
                      const pct = total > 0 ? (used / total) * 100 : 0;

                      return (
                        <div key={treatment}>
                          <div className="flex items-center justify-between text-xs mb-1">
                            <span className="font-medium">{treatment}</span>
                            <span className="text-stone-500">
                              {remaining} of {total} remaining
                            </span>
                          </div>
                          <div className="w-full h-1.5 rounded-full bg-stone-50">
                            <div
                              className={`h-1.5 rounded-full transition-all ${
                                remaining === 0 ? "bg-stone-400" : "bg-[#05CD99]"
                              }`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          {remaining === 0 && (
                            <span className="text-[10px] text-stone-400 mt-0.5 inline-block">
                              All sessions used
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })
      ) : (
        <Card padding="md">
          <CardContent>
            <p className="text-sm text-stone-500 text-center py-4">
              No active packages for this patient
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
