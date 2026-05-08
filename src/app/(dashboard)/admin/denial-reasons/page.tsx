"use client";

/**
 * /admin/denial-reasons — Per-tenant denial reason taxonomy (v60).
 * Compact admin: code, description, common-flag, active toggle.
 */
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { ArrowLeft, ListX, Plus, Edit, Power, Star } from "lucide-react";
import { Badge, Button, SearchInput } from "@/components/ui";
import { Modal } from "@/components/ui/modal";
import { LoadingSpinner } from "@/components/ui/loading";

interface ReasonRow {
  id: string;
  code: string;
  description: string;
  isCommon: boolean;
  isActive: boolean;
}
const EMPTY = { id: "", code: "", description: "", isCommon: false, isActive: true };

export default function DenialReasonsPage() {
  const [rows, setRows] = useState<ReasonRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState<typeof EMPTY | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/denial-reasons", { credentials: "include" }).then((r) => r.json());
      if (res?.success && Array.isArray(res.data)) setRows(res.data as ReasonRow[]);
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { reload(); }, [reload]);

  const filtered = rows.filter((r) => {
    if (!showInactive && !r.isActive) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return r.code.toLowerCase().includes(q) || r.description.toLowerCase().includes(q);
  });

  async function save() {
    if (!editing) return;
    setBusy(true); setError("");
    try {
      const isUpdate = Boolean(editing.id);
      const url = isUpdate ? `/api/admin/denial-reasons/${editing.id}` : "/api/admin/denial-reasons";
      const method = isUpdate ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          code: editing.code.toUpperCase(),
          description: editing.description,
          isCommon: editing.isCommon,
          isActive: editing.isActive,
        }),
      }).then((r) => r.json());
      if (!res?.success) { setError(res?.error || "Save failed"); setBusy(false); return; }
      setEditing(null);
      reload();
    } catch { setError("Network error"); }
    finally { setBusy(false); }
  }

  async function toggleActive(r: ReasonRow) {
    const verb = r.isActive ? "Deactivate" : "Activate";
    if (!confirm(`${verb} ${r.code}?`)) return;
    const res = await fetch(`/api/admin/denial-reasons/${r.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ isActive: !r.isActive }),
    }).then((r) => r.json());
    if (!res?.success) { alert(res?.error || "Failed"); return; }
    reload();
  }

  if (loading) return <div className="flex items-center justify-center py-20"><LoadingSpinner size="lg" /></div>;

  return (
    <div className="animate-fade-in space-y-5 sm:space-y-6" data-id="ADMIN-DENIAL-REASONS">
      <div className="relative overflow-hidden rounded-2xl border border-stone-100 bg-gradient-to-br from-rose-600 via-pink-600 to-fuchsia-600 px-5 py-5 sm:px-7 sm:py-6 text-white">
        <div className="absolute inset-0 opacity-25 [background:radial-gradient(circle_at_30%_30%,#fff_0,transparent_45%)]" />
        <div className="relative flex items-start justify-between gap-4 flex-wrap">
          <div>
            <Link href="/admin" className="inline-flex items-center gap-1 text-[11px] uppercase tracking-wider opacity-90 hover:opacity-100 mb-1.5">
              <ArrowLeft className="w-3 h-3" /> Admin
            </Link>
            <div className="flex items-center gap-2">
              <ListX className="w-5 h-5" />
              <h1 className="text-xl sm:text-2xl font-semibold leading-tight">Denial reasons</h1>
            </div>
            <p className="text-sm opacity-90 mt-1 max-w-xl">
              Curated taxonomy that the claim decide modal uses when an insurer denies a claim. Codes flagged as common appear at the top of the picker.
            </p>
          </div>
          <Button size="sm" iconLeft={<Plus className="w-3.5 h-3.5" />} onClick={() => { setEditing({ ...EMPTY }); setError(""); }}
            className="!bg-white !text-rose-700 hover:!bg-stone-50">
            New code
          </Button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-3">
        <SearchInput placeholder="Search code / description…" value={search} onChange={setSearch} className="w-full sm:max-w-sm" />
        <label className="inline-flex items-center gap-2 text-sm text-stone-600">
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} className="rounded border-stone-300" />
          Show inactive
        </label>
        <span className="text-xs text-stone-400 ml-auto">
          {rows.filter((r) => r.isCommon && r.isActive).length} common · {rows.filter((r) => r.isActive).length} active
        </span>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-12 text-center">
          <ListX className="w-10 h-10 text-stone-200 mx-auto mb-3" />
          <p className="text-sm text-stone-500 font-medium">No denial reasons match these filters</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-stone-100 shadow-sm overflow-hidden">
          <ul className="divide-y divide-stone-100">
            {filtered.map((r) => (
              <li key={r.id} className="flex items-center gap-3 px-4 py-3 hover:bg-stone-50/60">
                <div className="w-32 shrink-0">
                  <p className="font-mono text-xs text-stone-700">{r.code}</p>
                  {r.isCommon && (
                    <span className="inline-flex items-center gap-1 text-[10px] text-amber-600 mt-0.5">
                      <Star className="w-2.5 h-2.5 fill-amber-500" /> common
                    </span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-stone-800 truncate">{r.description}</p>
                </div>
                <Badge variant={r.isActive ? "success" : "default"} dot>{r.isActive ? "ACTIVE" : "INACTIVE"}</Badge>
                <Button size="sm" variant="outline" iconLeft={<Edit className="w-3.5 h-3.5" />} onClick={() => { setEditing({ id: r.id, code: r.code, description: r.description, isCommon: r.isCommon, isActive: r.isActive }); setError(""); }}>
                  Edit
                </Button>
                <Button size="sm" variant="outline" iconLeft={<Power className="w-3.5 h-3.5" />} onClick={() => toggleActive(r)}>
                  {r.isActive ? "Off" : "On"}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {editing && (
        <Modal isOpen onClose={() => setEditing(null)} title={editing.id ? "Edit denial reason" : "New denial reason"} subtitle="Tenant-scoped taxonomy code">
          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-1.5 block">Code</label>
              <input type="text" value={editing.code}
                onChange={(e) => setEditing({ ...editing, code: e.target.value.toUpperCase() })}
                className="w-full px-3.5 py-2.5 text-sm font-mono bg-white border border-stone-200 rounded-xl outline-none focus:border-rose-500"
                maxLength={40} placeholder="AUTH-MISSING" required />
              <p className="text-[10px] text-stone-400 mt-1">3-40 chars, uppercase + digits + hyphens.</p>
            </div>
            <div>
              <label className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-1.5 block">Description</label>
              <input type="text" value={editing.description}
                onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                className="w-full px-3.5 py-2.5 text-sm bg-white border border-stone-200 rounded-xl outline-none focus:border-rose-500"
                maxLength={200} required />
            </div>
            <div className="flex items-center gap-4">
              <label className="inline-flex items-center gap-2 text-sm text-stone-700">
                <input type="checkbox" checked={editing.isCommon} onChange={(e) => setEditing({ ...editing, isCommon: e.target.checked })} className="rounded border-stone-300" />
                Common (top of picker)
              </label>
              <label className="inline-flex items-center gap-2 text-sm text-stone-700">
                <input type="checkbox" checked={editing.isActive} onChange={(e) => setEditing({ ...editing, isActive: e.target.checked })} className="rounded border-stone-300" />
                Active
              </label>
            </div>
            {error && <p className="text-xs text-red-600">{error}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setEditing(null)}>Cancel</Button>
              <Button size="sm" onClick={save} disabled={busy}>{busy ? "Saving…" : editing.id ? "Save" : "Create"}</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
