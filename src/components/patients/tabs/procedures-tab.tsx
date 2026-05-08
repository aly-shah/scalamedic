"use client";

import { useState } from "react";
import { Syringe, ImageIcon, ChevronDown, ChevronUp } from "lucide-react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from "@/components/ui/table";
import { LoadingSpinner } from "@/components/ui/loading";
import { usePatientProcedures } from "@/hooks/use-queries";
import { formatDate } from "@/lib/utils";
import type { Procedure } from "@/types";

type EnrichedProcedure = Procedure & {
  treatment?: { id: string; name: string };
  doctor?: { id: string; name: string; speciality?: string };
  appointment?: { id: string; appointmentCode: string; date: string };
};

export function ProceduresTab({ patientId }: { patientId: string }) {
  const { data: response, isLoading } = usePatientProcedures(patientId);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (isLoading) return <LoadingSpinner />;

  const procedures = (response?.data || []) as EnrichedProcedure[];

  return (
    <div data-id="PATIENT-PROCEDURES-TAB" className="space-y-4">
      <Card padding="md">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Syringe className="w-4 h-4 text-teal-600" />
            <h3 className="text-sm font-semibold text-stone-900">
              Procedure History ({procedures.length})
            </h3>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {procedures.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Procedure</TableHead>
                  <TableHead>Doctor</TableHead>
                  <TableHead>Outcome</TableHead>
                  <TableHead>Before / After</TableHead>
                  <TableHead className="w-[80px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {procedures.map((proc) => {
                  const isExpanded = expandedId === proc.id;
                  const hasOutcome = !!proc.outcome;

                  return (
                    <>
                      <TableRow key={proc.id}>
                        <TableCell>{proc.performedAt ? formatDate(proc.performedAt) : "—"}</TableCell>
                        <TableCell>
                          <span className="font-medium">
                            {proc.treatmentName || proc.treatment?.name || "Procedure"}
                          </span>
                        </TableCell>
                        <TableCell>{proc.doctorName || proc.doctor?.name}</TableCell>
                        <TableCell>
                          {hasOutcome ? (
                            <Badge variant="success" dot>Completed</Badge>
                          ) : (
                            <Badge variant="warning" dot>Pending Outcome</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="w-12 h-12 rounded-lg bg-stone-50 flex items-center justify-center">
                              <ImageIcon className="w-4 h-4 text-stone-500" />
                            </div>
                            <div className="w-12 h-12 rounded-lg bg-stone-50 flex items-center justify-center">
                              <ImageIcon className="w-4 h-4 text-stone-500" />
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setExpandedId(isExpanded ? null : proc.id)}
                          >
                            {isExpanded ? (
                              <ChevronUp className="w-4 h-4" />
                            ) : (
                              <ChevronDown className="w-4 h-4" />
                            )}
                            <span className="ml-1 text-xs">View</span>
                          </Button>
                        </TableCell>
                      </TableRow>
                      {isExpanded && (
                        <TableRow key={`${proc.id}-details`}>
                          <TableCell colSpan={6}>
                            <div className="bg-stone-50 rounded-lg p-4 space-y-2 text-sm">
                              <div className="grid grid-cols-2 gap-4">
                                <div>
                                  <span className="text-stone-500">Treatment: </span>
                                  <span className="font-medium">
                                    {proc.treatmentName || proc.treatment?.name || "-"}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-stone-500">Outcome: </span>
                                  <span className="font-medium">
                                    {proc.outcome || "Not recorded yet"}
                                  </span>
                                </div>
                              </div>
                              {proc.complications && (
                                <div>
                                  <span className="text-stone-500">Complications: </span>
                                  <span className="font-medium">{proc.complications}</span>
                                </div>
                              )}
                              {proc.notes && (
                                <div>
                                  <span className="text-stone-500">Notes: </span>
                                  <span>{proc.notes}</span>
                                </div>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <div className="py-8 text-center text-sm text-stone-500">
              No procedures recorded for this patient
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
