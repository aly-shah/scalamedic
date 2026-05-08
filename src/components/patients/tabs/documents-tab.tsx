"use client";

import { useState } from "react";
import { FileText, Upload, Download, File, Trash2 } from "lucide-react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from "@/components/ui/table";
import { LoadingSpinner } from "@/components/ui/loading";
import { SlidePanel } from "@/components/ui/slide-panel";
import { usePatientDocuments, useCreatePatientDocument } from "@/hooks/use-queries";
import { formatDate } from "@/lib/utils";
import { useModuleEmit } from "@/modules/core/hooks";
import { SystemEvents } from "@/modules/core/events";
import { DocumentType } from "@/types";
import type { PatientDocument } from "@/types";

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const typeVariant: Record<string, "success" | "warning" | "danger" | "info" | "default" | "primary"> = {
  REPORT: "info",
  IMAGE: "default",
  CONSENT: "warning",
  PRESCRIPTION: "success",
  LAB_RESULT: "primary",
  BEFORE_AFTER: "danger",
  OTHER: "default",
};

const DOC_TYPES = Object.values(DocumentType);

export function DocumentsTab({ patientId }: { patientId: string }) {
  const emit = useModuleEmit("MOD-DOCUMENTS");
  const { data: response, isLoading } = usePatientDocuments(patientId);
  const createDoc = useCreatePatientDocument(patientId);

  const [showUpload, setShowUpload] = useState(false);
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const [form, setForm] = useState({ name: "", type: "REPORT" as string, notes: "" });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  if (isLoading) return <LoadingSpinner />;

  const documents = ((response?.data || []) as PatientDocument[]).filter(
    (d) => !hiddenIds.has(d.id)
  );

  const handleSubmit = async () => {
    if (!form.name.trim()) return;
    setUploading(true);

    let fileUrl = "/uploads/placeholder.pdf";
    let fileSize = 0;
    let mimeType = "";

    // Upload actual file if selected
    if (selectedFile) {
      try {
        const fd = new FormData();
        fd.append("file", selectedFile);
        const uploadRes = await fetch("/api/upload", { method: "POST", body: fd });
        const uploadData = await uploadRes.json();
        if (uploadData.success) {
          fileUrl = uploadData.data.url;
          fileSize = uploadData.data.size;
          mimeType = uploadData.data.mimeType;
        }
      } catch { /* fallback to placeholder */ }
    }

    createDoc.mutate(
      {
        name: form.name.trim(),
        type: form.type,
        notes: form.notes.trim() || undefined,
        fileUrl,
        fileSize,
        mimeType: mimeType || undefined,
      },
      {
        onSuccess: () => {
          emit(SystemEvents.DOCUMENT_UPLOADED, { patientId, name: form.name }, { patientId });
          setForm({ name: "", type: "REPORT", notes: "" });
          setSelectedFile(null);
          setShowUpload(false);
          setUploading(false);
        },
        onError: () => setUploading(false),
      }
    );
  };

  const handleDelete = (id: string) => {
    setHiddenIds((prev) => new Set(prev).add(id));
  };

  return (
    <div data-id="PATIENT-DOCUMENTS-TAB" className="space-y-4">
      {/* Upload Area */}
      <Card padding="md">
        <CardContent>
          <div className="border-2 border-dashed border-stone-200 rounded-lg p-8 text-center">
            <Upload className="w-8 h-8 text-stone-500 mx-auto mb-3" />
            <p className="text-sm font-medium text-stone-900 mb-1">
              Drop files here or click to upload
            </p>
            <p className="text-xs text-stone-500">
              PDF, JPG, PNG up to 10MB
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => setShowUpload(true)}
            >
              Browse Files
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Upload SlidePanel */}
      <SlidePanel
        isOpen={showUpload}
        onClose={() => setShowUpload(false)}
        title="Upload Document"
        subtitle="Add a new document for this patient"
        width="md"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setShowUpload(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSubmit} disabled={!form.name.trim() || uploading || createDoc.isPending}>
              {uploading ? "Uploading file..." : createDoc.isPending ? "Saving..." : "Upload"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">Document Name</label>
            <input
              type="text"
              className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              placeholder="e.g. Blood Test Results"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">Type</label>
            <select
              className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              value={form.type}
              onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
            >
              {DOC_TYPES.map((t) => (
                <option key={t} value={t}>{t.replace("_", " ")}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">File</label>
            <input
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  setSelectedFile(file);
                  if (!form.name) setForm((f) => ({ ...f, name: file.name.replace(/\.[^.]+$/, "") }));
                }
              }}
              className="w-full text-sm text-stone-600 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-medium file:bg-teal-50 file:text-teal-700 hover:file:bg-teal-100 file:cursor-pointer cursor-pointer"
            />
            {selectedFile && (
              <p className="text-xs text-stone-400 mt-1">{selectedFile.name} — {(selectedFile.size / 1024).toFixed(1)} KB</p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">Notes (optional)</label>
            <textarea
              className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 min-h-[80px]"
              placeholder="Any additional notes..."
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            />
          </div>
        </div>
      </SlidePanel>

      {/* Document List */}
      <Card padding="md">
        <CardHeader>
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-teal-600" />
            <h3 className="text-sm font-semibold text-stone-900">
              Documents ({documents.length})
            </h3>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {documents.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Uploaded By</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {documents.map((doc) => (
                  <TableRow key={doc.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <File className="w-4 h-4 text-stone-500" />
                        <span className="font-medium">{doc.name}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={typeVariant[doc.type] || "default"}>
                        {doc.type.replace("_", " ")}
                      </Badge>
                    </TableCell>
                    <TableCell>{formatFileSize(doc.fileSize)}</TableCell>
                    <TableCell>{doc.uploadedByName}</TableCell>
                    <TableCell>{formatDate(doc.createdAt)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <button className="p-1 rounded hover:bg-stone-50 cursor-pointer">
                          <Download className="w-4 h-4 text-stone-500" />
                        </button>
                        <button
                          className="p-1 rounded hover:bg-red-50 cursor-pointer"
                          onClick={() => handleDelete(doc.id)}
                        >
                          <Trash2 className="w-4 h-4 text-red-400" />
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="py-8 text-center text-sm text-stone-500">
              No documents found for this patient
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
