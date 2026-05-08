"use client";

import { useState } from "react";
import { FileText, ChevronDown, ChevronUp, Lock, ShieldCheck } from "lucide-react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/ui/loading";
import { usePatientNotes, useSignNote } from "@/hooks/use-queries";
import { formatDate } from "@/lib/utils";
import type { ConsultationNote } from "@/types";

export function NotesTab({ patientId }: { patientId: string }) {
  const { data: response, isLoading } = usePatientNotes(patientId);
  const signNote = useSignNote(patientId);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  if (isLoading) return <LoadingSpinner />;

  const notes = (response?.data || []) as ConsultationNote[];

  const toggleExpand = (id: string) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleSign = (noteId: string) => {
    if (confirm("Are you sure you want to sign and lock this note? This action cannot be undone.")) {
      signNote.mutate({ noteId });
    }
  };

  return (
    <div data-id="PATIENT-NOTES-TAB" className="space-y-4">
      {notes.length > 0 ? (
        notes.map((note) => (
          <Card key={note.id} padding="md">
            <CardHeader>
              <div
                className="flex items-center justify-between cursor-pointer"
                onClick={() => toggleExpand(note.id)}
              >
                <div className="flex items-center gap-2">
                  {note.isSigned ? (
                    <Lock className="w-4 h-4 text-emerald-600" />
                  ) : (
                    <FileText className="w-4 h-4 text-teal-600" />
                  )}
                  <h3 className="text-sm font-semibold text-stone-900">
                    {note.chiefComplaint}
                  </h3>
                  {note.isSigned ? (
                    <Badge variant="success" dot>Signed</Badge>
                  ) : (
                    <Badge variant="warning" dot>Draft</Badge>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  {note.isSigned && note.signedAt && (
                    <span className="text-xs text-emerald-600 font-medium">
                      Signed at: {formatDate(note.signedAt)}
                    </span>
                  )}
                  <span className="text-xs text-stone-500">
                    {note.doctorName} | {formatDate(note.createdAt)}
                  </span>
                  {expanded[note.id] ? (
                    <ChevronUp className="w-4 h-4 text-stone-500" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-stone-500" />
                  )}
                </div>
              </div>
            </CardHeader>
            {expanded[note.id] && (
              <CardContent>
                <div className="space-y-4 text-sm">
                  <div>
                    <p className="text-xs font-semibold text-stone-500 uppercase mb-1">Symptoms</p>
                    <p>{note.symptoms}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-stone-500 uppercase mb-1">Examination</p>
                    <p>{note.examination}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-stone-500 uppercase mb-1">Diagnosis</p>
                    <p className="font-medium">{note.diagnosis}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-stone-500 uppercase mb-1">Treatment Plan</p>
                    <p>{note.treatmentPlan}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-stone-500 uppercase mb-1">Advice</p>
                    <p>{note.advice}</p>
                  </div>
                  {note.followUpDate && (
                    <div className="pt-2 border-t border-stone-200">
                      <div className="flex items-center gap-2">
                        <Badge variant="info">Follow-up: {formatDate(note.followUpDate)}</Badge>
                      </div>
                      {note.followUpNotes && (
                        <p className="text-xs text-stone-500 mt-1">{note.followUpNotes}</p>
                      )}
                    </div>
                  )}
                  {!note.isSigned && (
                    <div className="pt-3 border-t border-stone-200 flex justify-end">
                      <Button
                        variant="success"
                        size="sm"
                        iconLeft={<ShieldCheck className="w-3.5 h-3.5" />}
                        onClick={() => handleSign(note.id)}
                        loading={signNote.isPending}
                      >
                        Sign &amp; Lock
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            )}
          </Card>
        ))
      ) : (
        <Card padding="md">
          <CardContent>
            <p className="text-sm text-stone-500 text-center py-4">
              No consultation notes found for this patient
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
