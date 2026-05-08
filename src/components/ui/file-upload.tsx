"use client";

import { useState, useCallback } from "react";
import { Upload, X, FileText } from "lucide-react";
import { cn } from "@/lib/utils";

interface FileUploadProps {
  onFilesSelected?: (files: File[]) => void;
  accept?: string;
  multiple?: boolean;
  className?: string;
  "data-id"?: string;
}

export function FileUpload({ onFilesSelected, accept, multiple, className, ...props }: FileUploadProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  const handleFiles = useCallback((newFiles: FileList) => {
    const fileArray = Array.from(newFiles);
    setFiles((prev) => [...prev, ...fileArray]);
    onFilesSelected?.(fileArray);
  }, [onFilesSelected]);

  const removeFile = (index: number) => setFiles((prev) => prev.filter((_, i) => i !== index));

  return (
    <div className={cn("space-y-3", className)} {...props}>
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => { e.preventDefault(); setIsDragging(false); handleFiles(e.dataTransfer.files); }}
        className={cn(
          "border-2 border-dashed rounded-2xl p-10 text-center transition-all cursor-pointer",
          isDragging ? "border-teal-400 bg-teal-50" : "border-stone-200 hover:border-teal-300 hover:bg-teal-50/30"
        )}
      >
        <input type="file" accept={accept} multiple={multiple} onChange={(e) => e.target.files && handleFiles(e.target.files)} className="hidden" id="file-upload" />
        <label htmlFor="file-upload" className="cursor-pointer">
          <div className="w-12 h-12 rounded-xl bg-teal-50 flex items-center justify-center mx-auto mb-3">
            <Upload className="w-5 h-5 text-teal-600" />
          </div>
          <p className="text-sm text-stone-700"><span className="text-teal-600 font-medium">Click to upload</span> or drag and drop</p>
          <p className="text-xs text-stone-400 mt-1">PDF, JPG, PNG up to 10MB</p>
        </label>
      </div>
      {files.length > 0 && (
        <div className="space-y-2">
          {files.map((file, i) => (
            <div key={i} className="flex items-center justify-between px-4 py-2.5 bg-stone-50 rounded-xl">
              <div className="flex items-center gap-2.5">
                <FileText className="w-4 h-4 text-teal-600" />
                <span className="text-sm text-stone-700">{file.name}</span>
                <span className="text-xs text-stone-400">{(file.size / 1024).toFixed(0)} KB</span>
              </div>
              <button onClick={() => removeFile(i)} className="text-stone-400 hover:text-red-500 cursor-pointer"><X className="w-4 h-4" /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
