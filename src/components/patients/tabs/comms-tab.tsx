"use client";

import { MessageSquare, Phone, Mail, MessageCircle } from "lucide-react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LoadingSpinner } from "@/components/ui/loading";
import { usePatientCommunications } from "@/hooks/use-queries";
import { formatDate, formatTime } from "@/lib/utils";
import type { CommunicationLog } from "@/types";

const typeIcon: Record<string, React.ReactNode> = {
  CALL: <Phone className="w-4 h-4" />,
  SMS: <MessageSquare className="w-4 h-4" />,
  EMAIL: <Mail className="w-4 h-4" />,
  WHATSAPP: <MessageCircle className="w-4 h-4" />,
};

const typeColor: Record<string, string> = {
  CALL: "text-teal-600 bg-teal-50",
  SMS: "text-emerald-500 bg-[#E6FAF5]",
  EMAIL: "text-amber-500 bg-[#FFF6E5]",
  WHATSAPP: "text-emerald-500 bg-[#E6FAF5]",
};

export function CommsTab({ patientId }: { patientId: string }) {
  const { data: response, isLoading } = usePatientCommunications(patientId);

  if (isLoading) return <LoadingSpinner />;

  const comms = ((response?.data || []) as CommunicationLog[])
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return (
    <div data-id="PATIENT-COMMS-TAB" className="space-y-4">
      <Card padding="md">
        <CardHeader>
          <div className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-teal-600" />
            <h3 className="text-sm font-semibold text-stone-900">
              Communication History ({comms.length})
            </h3>
          </div>
        </CardHeader>
        <CardContent>
          {comms.length > 0 ? (
            <div className="space-y-4">
              {comms.map((comm) => (
                <div key={comm.id} className="flex items-start gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${typeColor[comm.type]}`}>
                    {typeIcon[comm.type]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-sm">{comm.subject}</span>
                      <Badge variant={comm.direction === "OUTBOUND" ? "info" : "success"}>
                        {comm.direction}
                      </Badge>
                      <Badge variant="default">{comm.type}</Badge>
                    </div>
                    <p className="text-sm text-stone-900">{comm.content}</p>
                    <p className="text-xs text-stone-500 mt-1">
                      {comm.sentByName} - {formatDate(comm.createdAt)} at {formatTime(comm.createdAt)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-stone-500 text-center py-4">
              No communication history for this patient
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
