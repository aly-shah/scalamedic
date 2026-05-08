"use client";

import { useState } from "react";
import { ImageIcon, Upload, Filter } from "lucide-react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/ui/loading";
import { usePatientDocuments } from "@/hooks/use-queries";
import { formatDate } from "@/lib/utils";
import type { PatientDocument } from "@/types";

const categories = ["All", "Before/After", "Clinical", "Lab Results"];

export function ImagesTab({ patientId }: { patientId: string }) {
  const [activeCategory, setActiveCategory] = useState("All");
  const { data: response, isLoading } = usePatientDocuments(patientId);

  if (isLoading) return <LoadingSpinner />;

  const allDocuments = (response?.data || []) as PatientDocument[];
  const images = allDocuments.filter(
    (d) => d.type === "IMAGE" || d.type === "BEFORE_AFTER"
  );

  const filteredImages = activeCategory === "All"
    ? images
    : images.filter((img) => {
        if (activeCategory === "Before/After") return img.type === "BEFORE_AFTER";
        return true;
      });

  return (
    <div data-id="PATIENT-IMAGES-TAB" className="space-y-4">
      <Card padding="md">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ImageIcon className="w-4 h-4 text-teal-600" />
              <h3 className="text-sm font-semibold text-stone-900">
                Images ({images.length})
              </h3>
            </div>
            <Button size="sm" iconLeft={<Upload className="w-3.5 h-3.5" />}>
              Upload Image
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Category Filter */}
          <div className="flex items-center gap-2 mb-4">
            <Filter className="w-3.5 h-3.5 text-stone-500" />
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`px-3 py-1 rounded-full text-xs font-medium cursor-pointer transition-colors ${
                  activeCategory === cat
                    ? "bg-teal-600 text-white"
                    : "bg-stone-50 text-stone-500 hover:bg-stone-100"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Image Grid */}
          {filteredImages.length > 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {filteredImages.map((img) => (
                <div key={img.id} className="group relative">
                  <div className="aspect-square rounded-lg bg-stone-50 flex items-center justify-center border border-stone-200">
                    <ImageIcon className="w-8 h-8 text-stone-500" />
                  </div>
                  <div className="mt-2">
                    <p className="text-xs font-medium truncate">{img.name}</p>
                    <p className="text-xs text-stone-500">{formatDate(img.createdAt)}</p>
                    <Badge variant="info" className="mt-1">{img.type.replace("_", "/")}</Badge>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-8 text-center text-sm text-stone-500">
              No images found for this patient
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
