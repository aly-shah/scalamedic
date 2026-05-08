"use client";

import { Clock, CheckCircle, XCircle, AlertCircle, Plus, Check, Ban } from "lucide-react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui";
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from "@/components/ui/table";
import { LoadingSpinner } from "@/components/ui/loading";
import { usePatientFollowUps, useUpdateFollowUp, useCreatePatientFollowUp } from "@/hooks/use-queries";
import { formatDate } from "@/lib/utils";
import { useModuleEmit } from "@/modules/core/hooks";
import { SystemEvents } from "@/modules/core/events";
import type { FollowUp } from "@/types";

const statusConfig: Record<string, { variant: "success" | "warning" | "danger" | "default"; icon: React.ReactNode }> = {
  PENDING: { variant: "warning", icon: <Clock className="w-3.5 h-3.5" /> },
  COMPLETED: { variant: "success", icon: <CheckCircle className="w-3.5 h-3.5" /> },
  MISSED: { variant: "danger", icon: <XCircle className="w-3.5 h-3.5" /> },
  CANCELLED: { variant: "default", icon: <AlertCircle className="w-3.5 h-3.5" /> },
};

export function FollowUpsTab({ patientId }: { patientId: string }) {
  const emit = useModuleEmit("MOD-FOLLOWUP");
  const { data: response, isLoading } = usePatientFollowUps(patientId);
  const updateFollowUp = useUpdateFollowUp();
  const createFollowUp = useCreatePatientFollowUp(patientId);

  if (isLoading) return <LoadingSpinner />;

  const followUps = ((response?.data || []) as FollowUp[])
    .sort((a, b) => b.dueDate.localeCompare(a.dueDate));

  return (
    <div data-id="PATIENT-FOLLOWUPS-TAB" className="space-y-4">
      <Card padding="md">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-teal-600" />
              <h3 className="text-sm font-semibold text-stone-900">
                Follow-Ups ({followUps.length})
              </h3>
            </div>
            <Button
              size="sm"
              iconLeft={<Plus className="w-3.5 h-3.5" />}
              onClick={() => {
                const reason = prompt("Follow-up reason:");
                if (!reason) return;
                const dueDate = prompt("Due date (YYYY-MM-DD):");
                if (!dueDate) return;
                createFollowUp.mutate({ reason, dueDate, status: "PENDING" });
                emit(SystemEvents.FOLLOWUP_SCHEDULED, { patientId, reason, dueDate });
              }}
            >
              Schedule Follow-Up
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {followUps.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Due Date</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Doctor</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Completed</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {followUps.map((fu) => {
                  const config = statusConfig[fu.status] || statusConfig.PENDING;
                  return (
                    <TableRow key={fu.id}>
                      <TableCell>
                        <span className="font-medium">{formatDate(fu.dueDate)}</span>
                      </TableCell>
                      <TableCell>{fu.reason}</TableCell>
                      <TableCell>{fu.doctorName}</TableCell>
                      <TableCell>
                        <Badge variant={config.variant} dot>
                          {fu.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {fu.completedAt ? formatDate(fu.completedAt) : "-"}
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-stone-500">{fu.notes || "-"}</span>
                      </TableCell>
                      <TableCell>
                        {fu.status === "PENDING" && (
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              variant="success"
                              iconLeft={<Check className="w-3 h-3" />}
                              onClick={() => {
                                updateFollowUp.mutate({ id: fu.id, data: { status: "COMPLETED" } });
                                emit(SystemEvents.FOLLOWUP_COMPLETED, { id: fu.id, patientId });
                              }}
                            >
                              Complete
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              iconLeft={<Ban className="w-3 h-3" />}
                              onClick={() => {
                                updateFollowUp.mutate({ id: fu.id, data: { status: "CANCELLED" } });
                              }}
                            >
                              Cancel
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <div className="py-8 text-center text-sm text-stone-500">
              No follow-ups found for this patient
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
