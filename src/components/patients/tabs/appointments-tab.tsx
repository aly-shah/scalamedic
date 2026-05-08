"use client";

import { Calendar } from "lucide-react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from "@/components/ui/table";
import { LoadingSpinner } from "@/components/ui/loading";
import { usePatientAppointments } from "@/hooks/use-queries";
import { formatDate } from "@/lib/utils";
import type { Appointment } from "@/types";

const statusVariant: Record<string, "success" | "warning" | "danger" | "info" | "default"> = {
  COMPLETED: "success",
  IN_PROGRESS: "info",
  CHECKED_IN: "info",
  WAITING: "warning",
  CONFIRMED: "success",
  SCHEDULED: "default",
  CANCELLED: "danger",
  NO_SHOW: "danger",
  RESCHEDULED: "warning",
};

export function AppointmentsTab({ patientId }: { patientId: string }) {
  const { data: response, isLoading } = usePatientAppointments(patientId);

  if (isLoading) return <LoadingSpinner />;

  const appointments = ((response?.data || []) as Appointment[])
    .sort((a, b) => b.date.localeCompare(a.date) || b.startTime.localeCompare(a.startTime));

  return (
    <div data-id="PATIENT-APPOINTMENTS-TAB" className="space-y-4">
      <Card padding="md">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-teal-600" />
            <h3 className="text-sm font-semibold text-stone-900">
              Appointments ({appointments.length})
            </h3>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {appointments.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Time</TableHead>
                  <TableHead>Doctor</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {appointments.map((apt) => (
                  <TableRow key={apt.id}>
                    <TableCell>
                      <span className="font-mono text-xs text-stone-500">{apt.appointmentCode}</span>
                    </TableCell>
                    <TableCell>{formatDate(apt.date)}</TableCell>
                    <TableCell>{apt.startTime} - {apt.endTime}</TableCell>
                    <TableCell>{apt.doctorName}</TableCell>
                    <TableCell>
                      <Badge variant="info">{apt.type.replace("_", " ")}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariant[apt.status] || "default"} dot>
                        {apt.status.replace("_", " ")}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-stone-500 truncate max-w-[200px] block">
                        {apt.notes || "-"}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="py-8 text-center text-sm text-stone-500">
              No appointments found for this patient
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
