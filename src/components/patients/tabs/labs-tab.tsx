"use client";

import { useState } from "react";
import { FlaskConical, ChevronDown, ChevronUp, TestTube } from "lucide-react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from "@/components/ui/table";
import { LoadingSpinner } from "@/components/ui/loading";
import { usePatientLabTests } from "@/hooks/use-queries";
import { formatDate } from "@/lib/utils";
import type { LabTest } from "@/types";

const statusVariant: Record<string, "success" | "warning" | "danger" | "info" | "default"> = {
  COMPLETED: "success",
  PROCESSING: "info",
  SAMPLE_COLLECTED: "warning",
  REQUESTED: "default",
  CANCELLED: "danger",
};

export function LabsTab({ patientId }: { patientId: string }) {
  const { data: response, isLoading } = usePatientLabTests(patientId);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (isLoading) return <LoadingSpinner />;

  const labs = (response?.data || []) as LabTest[];

  return (
    <div data-id="PATIENT-LABS-TAB" className="space-y-4">
      <Card padding="md">
        <CardHeader>
          <div className="flex items-center gap-2">
            <FlaskConical className="w-4 h-4 text-teal-600" />
            <h3 className="text-sm font-semibold text-stone-900">
              Lab Tests ({labs.length})
            </h3>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {labs.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Test Name</TableHead>
                  <TableHead>Ordered By</TableHead>
                  <TableHead>Ordered Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Completed</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {labs.map((lab) => {
                  const isExpanded = expandedId === lab.id;

                  return (
                    <>
                      <TableRow key={lab.id}>
                        <TableCell>
                          <span className="font-medium">{lab.testName}</span>
                        </TableCell>
                        <TableCell>{lab.doctorName}</TableCell>
                        <TableCell>{formatDate(lab.createdAt)}</TableCell>
                        <TableCell>
                          <Badge variant={statusVariant[lab.status] || "default"} dot>
                            {lab.status.replace("_", " ")}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {lab.completedAt ? formatDate(lab.completedAt) : "-"}
                        </TableCell>
                        <TableCell>
                          {lab.status === "REQUESTED" && (
                            <Button variant="outline" size="sm">
                              <TestTube className="w-3.5 h-3.5 mr-1" />
                              Collect Sample
                            </Button>
                          )}
                          {(lab.status === "SAMPLE_COLLECTED" || lab.status === "PROCESSING") && (
                            <Badge variant="info" dot>Processing</Badge>
                          )}
                          {lab.status === "COMPLETED" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setExpandedId(isExpanded ? null : lab.id)}
                            >
                              {isExpanded ? (
                                <ChevronUp className="w-4 h-4" />
                              ) : (
                                <ChevronDown className="w-4 h-4" />
                              )}
                              <span className="ml-1 text-xs">View Results</span>
                            </Button>
                          )}
                          {lab.status === "CANCELLED" && (
                            <span className="text-xs text-stone-400">Cancelled</span>
                          )}
                        </TableCell>
                      </TableRow>
                      {isExpanded && lab.status === "COMPLETED" && (
                        <TableRow key={`${lab.id}-results`}>
                          <TableCell colSpan={6}>
                            <div className="bg-stone-50 rounded-lg p-4 space-y-2 text-sm">
                              {lab.results && Object.keys(lab.results).length > 0 ? (
                                <div className="grid grid-cols-2 gap-3">
                                  {Object.entries(lab.results).map(([key, value]) => (
                                    <div key={key}>
                                      <span className="text-stone-500">{key}: </span>
                                      <span className="font-medium">{String(value)}</span>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-stone-500">No detailed results available</p>
                              )}
                              {lab.notes && (
                                <div className="pt-2 border-t border-stone-200">
                                  <span className="text-stone-500">Notes: </span>
                                  <span>{lab.notes}</span>
                                </div>
                              )}
                              {lab.technician && (
                                <div>
                                  <span className="text-stone-500">Technician: </span>
                                  <span>{lab.technician}</span>
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
              No lab tests found for this patient
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
