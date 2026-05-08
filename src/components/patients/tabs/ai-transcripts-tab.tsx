"use client";

import { useState } from "react";
import { Bot, ChevronDown, ChevronUp, Clock, Mic } from "lucide-react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LoadingSpinner } from "@/components/ui/loading";
import { usePatientTranscriptions } from "@/hooks/use-queries";
import { formatDate, formatTime } from "@/lib/utils";
import type { AITranscription } from "@/types";

const statusVariant: Record<string, "success" | "warning" | "danger" | "info" | "default"> = {
  COMPLETED: "success",
  PROCESSING: "info",
  RECORDING: "warning",
  FAILED: "danger",
};

export function AITranscriptsTab({ patientId }: { patientId: string }) {
  const { data: response, isLoading } = usePatientTranscriptions(patientId);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  if (isLoading) return <LoadingSpinner />;

  const transcriptions = (response?.data || []) as AITranscription[];

  const toggleExpand = (id: string) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div data-id="PATIENT-AI-TRANSCRIPTS-TAB" className="space-y-4">
      {transcriptions.length > 0 ? (
        transcriptions.map((t) => (
          <Card key={t.id} padding="md">
            <CardHeader>
              <div
                className="flex items-center justify-between cursor-pointer"
                onClick={() => toggleExpand(t.id)}
              >
                <div className="flex items-center gap-2">
                  <Bot className="w-4 h-4 text-teal-600" />
                  <h3 className="text-sm font-semibold text-stone-900">
                    Consultation Transcript
                  </h3>
                  <Badge variant={statusVariant[t.status] || "default"} dot>
                    {t.status}
                  </Badge>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1 text-xs text-stone-500">
                    <Mic className="w-3 h-3" />
                    {formatDuration(t.duration)}
                  </div>
                  <span className="text-xs text-stone-500">
                    {t.doctorName} | {formatDate(t.createdAt)}
                  </span>
                  {expanded[t.id] ? (
                    <ChevronUp className="w-4 h-4 text-stone-500" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-stone-500" />
                  )}
                </div>
              </div>
            </CardHeader>
            {expanded[t.id] && (
              <CardContent>
                <div className="space-y-4">
                  {/* Summary */}
                  {t.summary && (
                    <div className="p-3 rounded-lg bg-teal-50 border border-teal-500/10">
                      <p className="text-xs font-semibold text-teal-600 uppercase mb-1">
                        AI Summary
                      </p>
                      <p className="text-sm">{t.summary}</p>
                    </div>
                  )}

                  {/* Structured Note */}
                  {t.structuredNote && (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-stone-500 uppercase">
                        Structured Note
                      </p>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        {Object.entries(t.structuredNote).map(([key, value]) => (
                          <div key={key} className="p-2 rounded bg-stone-50">
                            <p className="text-xs text-stone-500 capitalize">
                              {key.replace(/([A-Z])/g, " $1").trim()}
                            </p>
                            <p className="text-sm font-medium">{String(value)}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Raw Transcript */}
                  <div>
                    <p className="text-xs font-semibold text-stone-500 uppercase mb-2">
                      Full Transcript
                    </p>
                    <div className="p-3 rounded-lg bg-stone-50 text-sm whitespace-pre-wrap font-mono text-xs leading-relaxed">
                      {t.rawTranscript}
                    </div>
                  </div>
                </div>
              </CardContent>
            )}
          </Card>
        ))
      ) : (
        <Card padding="md">
          <CardContent>
            <p className="text-sm text-stone-500 text-center py-4">
              No AI transcriptions found for this patient
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
