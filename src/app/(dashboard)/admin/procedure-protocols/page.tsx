"use client";

/**
 * /admin/procedure-protocols — manage reusable procedure templates.
 *
 * Each protocol bundles consent text, before/after photo angles,
 * machine settings, aftercare instructions, follow-up timing, and
 * an optional Rx kit reference. The doctor-app's procedure flow
 * pre-fills from these; the protocol's payload is frozen onto the
 * Procedure record at execution time so future template edits
 * never rewrite history.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Sparkles, Plus, ArrowLeft, Loader2, AlertCircle, X,
  Camera, Settings, FileText, CalendarClock, Pill, Clock, Trash2,
} from "lucide-react";
import { Button, Card, Input, Badge } from "@/components/ui";
import { SlidePanel } from "@/components/ui/slide-panel";

interface Protocol {
  id: string;
  name: string;
  description: string | null;
  branchId: string | null;
  branch: { id: string; name: string; code: string } | null;
  treatmentId: string | null;
  treatment: { id: string; name: string; code: string | null } | null;
  consentTemplate: string | null;
  requiredBeforePhotos: string[];
  requiredAfterPhotos: string[];
  machineSettings: Record<string, unknown> | null;
  aftercareInstructions: string | null;
  suggestedFollowUpDays: number | null;
  rxKitName: string | null;
  estimatedDurationMinutes: number | null;
  version: number;
  isActive: boolean;
  createdBy: { id: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
}

interface FormState {
  id?: string;
  name: string;
  description: string;
  branchId: string;
  treatmentId: string;
  consentTemplate: string;
  beforePhotos: string;        // newline-separated
  afterPhotos: string;
  machineSettings: string;     // raw JSON text
  aftercareInstructions: string;
  suggestedFollowUpDays: string;
  rxKitName: string;
  estimatedDurationMinutes: string;
}

const EMPTY_FORM: FormState = {
  name: "", description: "", branchId: "", treatmentId: "",
  consentTemplate: "", beforePhotos: "", afterPhotos: "",
  machineSettings: "", aftercareInstructions: "",
  suggestedFollowUpDays: "", rxKitName: "", estimatedDurationMinutes: "",
};

export default function ProcedureProtocolsPage() {
  const [rows, setRows] = useState<Protocol[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [editing, setEditing] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    fetch(`/api/admin/procedure-protocols?includeInactive=${includeInactive}`, { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        if (!d.success) { setError(d.error || "Failed"); return; }
        setRows(d.data || []); setError(null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [includeInactive]);

  const startCreate = () => setEditing({ ...EMPTY_FORM });
  const startEdit = (p: Protocol) => setEditing({
    id: p.id,
    name: p.name,
    description: p.description ?? "",
    branchId: p.branchId ?? "",
    treatmentId: p.treatmentId ?? "",
    consentTemplate: p.consentTemplate ?? "",
    beforePhotos: p.requiredBeforePhotos.join("\n"),
    afterPhotos: p.requiredAfterPhotos.join("\n"),
    machineSettings: p.machineSettings ? JSON.stringify(p.machineSettings, null, 2) : "",
    aftercareInstructions: p.aftercareInstructions ?? "",
    suggestedFollowUpDays: p.suggestedFollowUpDays != null ? String(p.suggestedFollowUpDays) : "",
    rxKitName: p.rxKitName ?? "",
    estimatedDurationMinutes: p.estimatedDurationMinutes != null ? String(p.estimatedDurationMinutes) : "",
  });

  const save = async () => {
    if (!editing) return;
    if (!editing.name.trim()) { setError("Name is required"); return; }

    let machineSettings: Record<string, unknown> | null = null;
    if (editing.machineSettings.trim()) {
      try {
        const parsed = JSON.parse(editing.machineSettings);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("must be a JSON object");
        machineSettings = parsed;
      } catch (e) {
        setError(`Machine settings: ${e instanceof Error ? e.message : "invalid JSON"}`);
        return;
      }
    }

    const splitLines = (s: string) => s.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);

    const payload = {
      name: editing.name.trim(),
      description: editing.description.trim() || null,
      branchId: editing.branchId || null,
      treatmentId: editing.treatmentId || null,
      consentTemplate: editing.consentTemplate.trim() || null,
      requiredBeforePhotos: splitLines(editing.beforePhotos),
      requiredAfterPhotos: splitLines(editing.afterPhotos),
      machineSettings,
      aftercareInstructions: editing.aftercareInstructions.trim() || null,
      suggestedFollowUpDays: editing.suggestedFollowUpDays.trim() ? Number(editing.suggestedFollowUpDays) : null,
      rxKitName: editing.rxKitName.trim() || null,
      estimatedDurationMinutes: editing.estimatedDurationMinutes.trim() ? Number(editing.estimatedDurationMinutes) : null,
    };

    setSaving(true); setError(null);
    try {
      const url = editing.id ? `/api/admin/procedure-protocols/${editing.id}` : "/api/admin/procedure-protocols";
      const method = editing.id ? "PUT" : "POST";
      const r = await fetch(url, {
        method,
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const d = await r.json();
      if (!d.success) { setError(d.error || "Save failed"); return; }
      setEditing(null);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const archive = async (p: Protocol) => {
    if (!confirm(`Archive "${p.name}"? Existing procedures keep their frozen snapshot.`)) return;
    await fetch(`/api/admin/procedure-protocols/${p.id}`, { method: "DELETE", credentials: "include" });
    load();
  };

  return (
    <div className="space-y-5">
      <div>
        <Link href="/dashboard" className="text-xs text-stone-500 hover:text-teal-600 inline-flex items-center gap-1">
          <ArrowLeft className="w-3 h-3" /> Dashboard
        </Link>
        <div className="flex items-center justify-between mt-1 flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-stone-900 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-pink-600" /> Procedure Protocols
            </h1>
            <p className="text-sm text-stone-500">
              Reusable templates for in-clinic procedures. Each protocol drives consent + photos + machine settings + aftercare when a procedure starts.
            </p>
          </div>
          <Button iconLeft={<Plus className="w-4 h-4" />} onClick={startCreate}>New Protocol</Button>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <label className="inline-flex items-center gap-2 text-sm text-stone-600">
          <input type="checkbox" checked={includeInactive} onChange={(e) => setIncludeInactive(e.target.checked)} className="accent-teal-600" />
          Include archived
        </label>
      </div>

      {error && (
        <div className="px-3 py-2 rounded-xl bg-red-50 border border-red-100 text-sm text-red-700 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /> {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 text-teal-600 animate-spin" />
        </div>
      ) : rows.length === 0 ? (
        <Card padding="md" className="text-center py-10">
          <p className="text-sm text-stone-500">No protocols yet — click <span className="font-semibold">New Protocol</span> to add the first one.</p>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {rows.map((p) => (
            <Card key={p.id} padding="md">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-base font-semibold text-stone-900 truncate">{p.name}</h3>
                    {!p.isActive && <Badge variant="default" className="text-[10px]">Archived</Badge>}
                    {p.treatment && <Badge variant="primary" className="text-[10px]">{p.treatment.name}</Badge>}
                    <span className="text-[10px] text-stone-400">v{p.version}</span>
                  </div>
                  {p.description && <p className="text-xs text-stone-500 mt-0.5 line-clamp-2">{p.description}</p>}
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-stone-500">
                    {p.consentTemplate && (
                      <span className="inline-flex items-center gap-1"><FileText className="w-3 h-3" /> Consent</span>
                    )}
                    {(p.requiredBeforePhotos.length > 0 || p.requiredAfterPhotos.length > 0) && (
                      <span className="inline-flex items-center gap-1">
                        <Camera className="w-3 h-3" /> {p.requiredBeforePhotos.length}B / {p.requiredAfterPhotos.length}A
                      </span>
                    )}
                    {p.machineSettings && (
                      <span className="inline-flex items-center gap-1"><Settings className="w-3 h-3" /> Settings</span>
                    )}
                    {p.aftercareInstructions && (
                      <span className="inline-flex items-center gap-1"><FileText className="w-3 h-3" /> Aftercare</span>
                    )}
                    {p.suggestedFollowUpDays != null && (
                      <span className="inline-flex items-center gap-1"><CalendarClock className="w-3 h-3" /> {p.suggestedFollowUpDays}d</span>
                    )}
                    {p.rxKitName && (
                      <span className="inline-flex items-center gap-1"><Pill className="w-3 h-3" /> {p.rxKitName}</span>
                    )}
                    {p.estimatedDurationMinutes != null && (
                      <span className="inline-flex items-center gap-1"><Clock className="w-3 h-3" /> {p.estimatedDurationMinutes}m</span>
                    )}
                  </div>
                </div>
              </div>
              <div className="mt-3 flex items-center justify-end gap-2">
                {p.isActive && (
                  <button onClick={() => archive(p)} className="text-[11px] text-stone-400 hover:text-red-600 inline-flex items-center gap-1">
                    <Trash2 className="w-3 h-3" /> Archive
                  </button>
                )}
                <Button size="sm" variant="outline" onClick={() => startEdit(p)}>Edit</Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {editing && (
        <SlidePanel
          isOpen={!!editing}
          onClose={() => setEditing(null)}
          title={editing.id ? "Edit protocol" : "New protocol"}
          subtitle={editing.id ? "Updates bump version; existing procedures keep their snapshot." : "Reusable template for in-clinic procedures."}
          width="xl"
          footer={
            <>
              <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
              <Button onClick={save} disabled={saving} iconLeft={saving ? <Loader2 className="w-4 h-4 animate-spin" /> : undefined}>
                {saving ? "Saving…" : editing.id ? "Save changes" : "Create protocol"}
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            <Input label="Name *" placeholder="e.g. HydraFacial — Standard" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            <div>
              <label className="block text-xs font-medium text-stone-600 mb-1">Description</label>
              <textarea
                value={editing.description}
                onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                rows={2}
                placeholder="What this protocol covers, who it's for, key safety notes…"
                className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Input label="Treatment ID" placeholder="(optional UUID)" value={editing.treatmentId} onChange={(e) => setEditing({ ...editing, treatmentId: e.target.value })} />
              <Input label="Branch ID" placeholder="(optional — blank = all branches)" value={editing.branchId} onChange={(e) => setEditing({ ...editing, branchId: e.target.value })} />
            </div>

            <div>
              <label className="block text-xs font-medium text-stone-600 mb-1">Consent template</label>
              <textarea
                value={editing.consentTemplate}
                onChange={(e) => setEditing({ ...editing, consentTemplate: e.target.value })}
                rows={4}
                placeholder="Patient-facing consent text (markdown allowed)"
                className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-stone-600 mb-1">Before-photo angles (one per line)</label>
                <textarea
                  value={editing.beforePhotos}
                  onChange={(e) => setEditing({ ...editing, beforePhotos: e.target.value })}
                  rows={4}
                  placeholder="Face front&#10;Left profile&#10;Right profile"
                  className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-stone-600 mb-1">After-photo angles (one per line)</label>
                <textarea
                  value={editing.afterPhotos}
                  onChange={(e) => setEditing({ ...editing, afterPhotos: e.target.value })}
                  rows={4}
                  placeholder="Face front&#10;Left profile&#10;Right profile"
                  className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-stone-600 mb-1">Default machine settings (JSON object)</label>
              <textarea
                value={editing.machineSettings}
                onChange={(e) => setEditing({ ...editing, machineSettings: e.target.value })}
                rows={4}
                placeholder='{"laserPower": 12, "spotSize": 5, "passes": 2}'
                className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-stone-600 mb-1">Aftercare instructions</label>
              <textarea
                value={editing.aftercareInstructions}
                onChange={(e) => setEditing({ ...editing, aftercareInstructions: e.target.value })}
                rows={3}
                placeholder="Printed for the patient (markdown allowed)"
                className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <Input label="Follow-up (days)" type="number" placeholder="14" value={editing.suggestedFollowUpDays} onChange={(e) => setEditing({ ...editing, suggestedFollowUpDays: e.target.value })} />
              <Input label="Rx kit name" placeholder="Post-laser" value={editing.rxKitName} onChange={(e) => setEditing({ ...editing, rxKitName: e.target.value })} />
              <Input label="Duration (min)" type="number" placeholder="45" value={editing.estimatedDurationMinutes} onChange={(e) => setEditing({ ...editing, estimatedDurationMinutes: e.target.value })} />
            </div>
          </div>
        </SlidePanel>
      )}
    </div>
  );
}
