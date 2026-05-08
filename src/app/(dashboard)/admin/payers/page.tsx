"use client";

/**
 * /admin/payers — Payer master list (v59).
 *
 * Per-tenant insurance company catalog. Used by the patient
 * insurance form's payer picker and by claim analytics. Common
 * Pakistani payers are seeded by the v59 migration; admins add /
 * deactivate the rest from this page.
 */
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { ArrowLeft, ShieldCheck, Plus, Edit, Power, Mail, Phone, Hash } from "lucide-react";
import { Badge, Button, SearchInput } from "@/components/ui";
import { Modal } from "@/components/ui/modal";
import { LoadingSpinner } from "@/components/ui/loading";

interface PayerRow {
  id: string;
  name: string;
  code: string;
  contactEmail: string | null;
  claimSubmissionEmail: string | null;
  contactPhone: string | null;
  notes: string | null;
  isActive: boolean;
  createdAt: string;
  _count?: { insurances: number };
}

const EMPTY_FORM = {
  id: "",
  name: "",
  code: "",
  contactEmail: "",
  claimSubmissionEmail: "",
  contactPhone: "",
  notes: "",
  isActive: true,
};

export default function PayersPage() {
  const [payers, setPayers] = useState<PayerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);

  const [editing, setEditing] = useState<typeof EMPTY_FORM | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/payers", { credentials: "include" }).then((r) => r.json());
      if (res?.success && Array.isArray(res.data)) setPayers(res.data as PayerRow[]);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const filtered = payers.filter((p) => {
    if (!showInactive && !p.isActive) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      p.name.toLowerCase().includes(q) ||
      p.code.toLowerCase().includes(q) ||
      (p.contactEmail || "").toLowerCase().includes(q)
    );
  });

  function openNew() {
    setEditing({ ...EMPTY_FORM });
    setError("");
  }
  function openEdit(p: PayerRow) {
    setEditing({
      id: p.id,
      name: p.name,
      code: p.code,
      contactEmail: p.contactEmail ?? "",
      claimSubmissionEmail: p.claimSubmissionEmail ?? "",
      contactPhone: p.contactPhone ?? "",
      notes: p.notes ?? "",
      isActive: p.isActive,
    });
    setError("");
  }

  async function save() {
    if (!editing) return;
    setBusy(true); setError("");
    try {
      const isUpdate = Boolean(editing.id);
      const url = isUpdate ? `/api/admin/payers/${editing.id}` : "/api/admin/payers";
      const method = isUpdate ? "PATCH" : "POST";
      const payload: Record<string, unknown> = {
        name: editing.name,
        code: editing.code.toUpperCase(),
        contactEmail: editing.contactEmail || null,
        claimSubmissionEmail: editing.claimSubmissionEmail || null,
        contactPhone: editing.contactPhone || null,
        notes: editing.notes || null,
        isActive: editing.isActive,
      };
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      }).then((r) => r.json());
      if (!res?.success) {
        setError(res?.error || "Save failed");
        setBusy(false);
        return;
      }
      setEditing(null);
      reload();
    } catch {
      setError("Network error");
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(p: PayerRow) {
    const verb = p.isActive ? "Deactivate" : "Activate";
    if (!confirm(`${verb} ${p.name}? ${p.isActive ? "It'll stop appearing in the new-insurance picker." : ""}`)) return;
    const res = await fetch(`/api/admin/payers/${p.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ isActive: !p.isActive }),
    }).then((r) => r.json());
    if (!res?.success) { alert(res?.error || "Failed"); return; }
    reload();
  }

  if (loading) return <div className="flex items-center justify-center py-20"><LoadingSpinner size="lg" /></div>;

  const activeCount = payers.filter((p) => p.isActive).length;

  return (
    <div className="animate-fade-in space-y-5 sm:space-y-6" data-id="ADMIN-PAYERS">
      <div className="relative overflow-hidden rounded-2xl border border-stone-100 bg-gradient-to-br from-blue-600 via-indigo-600 to-violet-600 px-5 py-5 sm:px-7 sm:py-6 text-white">
        <div className="absolute inset-0 opacity-25 [background:radial-gradient(circle_at_30%_30%,#fff_0,transparent_45%)]" />
        <div className="relative flex items-start justify-between gap-4 flex-wrap">
          <div>
            <Link href="/admin" className="inline-flex items-center gap-1 text-[11px] uppercase tracking-wider opacity-90 hover:opacity-100 mb-1.5">
              <ArrowLeft className="w-3 h-3" /> Admin
            </Link>
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5" />
              <h1 className="text-xl sm:text-2xl font-semibold leading-tight">Insurance payers</h1>
            </div>
            <p className="text-sm opacity-90 mt-1 max-w-xl">
              Standardized list of insurance companies the clinic deals with. Used by the patient insurance form&apos;s picker and by per-payer claim reports.
            </p>
          </div>
          <Button size="sm" iconLeft={<Plus className="w-3.5 h-3.5" />} onClick={openNew}
            className="!bg-white !text-indigo-700 hover:!bg-stone-50">
            New payer
          </Button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-3">
        <SearchInput
          placeholder="Search name / code / email…"
          value={search}
          onChange={setSearch}
          className="w-full sm:max-w-sm"
        />
        <label className="inline-flex items-center gap-2 text-sm text-stone-600">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
            className="rounded border-stone-300"
          />
          Show inactive
        </label>
        <span className="text-xs text-stone-400 ml-auto">{activeCount} active · {payers.length} total</span>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-12 text-center">
          <ShieldCheck className="w-10 h-10 text-stone-200 mx-auto mb-3" />
          <p className="text-sm text-stone-500 font-medium">No payers match these filters</p>
          <p className="text-xs text-stone-400 mt-1">
            {payers.length === 0
              ? "Click 'New payer' to add the first one."
              : "Try a different search or toggle 'Show inactive'."}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-stone-100 shadow-sm overflow-hidden">
          <div className="hidden md:grid grid-cols-[1.6fr_1fr_1.4fr_1fr_0.8fr_1fr] gap-3 px-4 py-2.5 border-b border-stone-100 bg-stone-50/60 text-[10px] uppercase tracking-wider text-stone-400 font-semibold">
            <div>Payer</div>
            <div>Code</div>
            <div>Contact</div>
            <div>Phone</div>
            <div>Status</div>
            <div className="text-right pr-1">Actions</div>
          </div>

          <ul className="divide-y divide-stone-100">
            {filtered.map((p) => (
              <li key={p.id} className="md:grid md:grid-cols-[1.6fr_1fr_1.4fr_1fr_0.8fr_1fr] md:gap-3 md:items-center px-4 py-3 hover:bg-stone-50/60 transition-colors">
                <div className="mb-1 md:mb-0">
                  <p className="text-sm font-semibold text-stone-900">{p.name}</p>
                  {p._count && (
                    <p className="text-[11px] text-stone-400">{p._count.insurances} polic{p._count.insurances === 1 ? "y" : "ies"}</p>
                  )}
                </div>
                <div className="mb-1 md:mb-0 flex items-center gap-1.5 text-stone-700">
                  <Hash className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                  <span className="text-xs font-mono">{p.code}</span>
                </div>
                <div className="mb-1 md:mb-0 min-w-0 text-xs text-stone-600">
                  {p.contactEmail ? (
                    <span className="inline-flex items-center gap-1 truncate"><Mail className="w-3 h-3 shrink-0" />{p.contactEmail}</span>
                  ) : <span className="text-stone-300">—</span>}
                  {p.claimSubmissionEmail && p.claimSubmissionEmail !== p.contactEmail && (
                    <p className="text-[10px] text-stone-400 truncate">claims: {p.claimSubmissionEmail}</p>
                  )}
                </div>
                <div className="mb-2 md:mb-0 text-xs text-stone-600">
                  {p.contactPhone ? (
                    <span className="inline-flex items-center gap-1 truncate"><Phone className="w-3 h-3 shrink-0" />{p.contactPhone}</span>
                  ) : <span className="text-stone-300">—</span>}
                </div>
                <div className="mb-2 md:mb-0">
                  <Badge variant={p.isActive ? "success" : "default"} dot>
                    {p.isActive ? "ACTIVE" : "INACTIVE"}
                  </Badge>
                </div>
                <div className="flex md:justify-end items-center gap-1.5 flex-wrap">
                  <Button size="sm" variant="outline" iconLeft={<Edit className="w-3.5 h-3.5" />} onClick={() => openEdit(p)}>
                    Edit
                  </Button>
                  <Button size="sm" variant="outline" iconLeft={<Power className="w-3.5 h-3.5" />} onClick={() => toggleActive(p)}>
                    {p.isActive ? "Deactivate" : "Activate"}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {editing && (
        <Modal isOpen onClose={() => setEditing(null)} title={editing.id ? `Edit payer` : "New payer"} subtitle="Standardized insurance company entry">
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-1.5 block">Name</label>
                <input
                  type="text"
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  className="w-full px-3.5 py-2.5 text-sm bg-white border border-stone-200 rounded-xl outline-none focus:border-indigo-500"
                  maxLength={120}
                  required
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-1.5 block">Code</label>
                <input
                  type="text"
                  value={editing.code}
                  onChange={(e) => setEditing({ ...editing, code: e.target.value.toUpperCase() })}
                  className="w-full px-3.5 py-2.5 text-sm font-mono bg-white border border-stone-200 rounded-xl outline-none focus:border-indigo-500"
                  maxLength={40}
                  placeholder="EFU-LIFE"
                  required
                />
                <p className="text-[10px] text-stone-400 mt-1">3-40 chars, uppercase + digits + hyphens.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-1.5 block">Contact email</label>
                <input
                  type="email"
                  value={editing.contactEmail}
                  onChange={(e) => setEditing({ ...editing, contactEmail: e.target.value })}
                  className="w-full px-3.5 py-2.5 text-sm bg-white border border-stone-200 rounded-xl outline-none focus:border-indigo-500"
                  maxLength={180}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-1.5 block">Claim submission email</label>
                <input
                  type="email"
                  value={editing.claimSubmissionEmail}
                  onChange={(e) => setEditing({ ...editing, claimSubmissionEmail: e.target.value })}
                  className="w-full px-3.5 py-2.5 text-sm bg-white border border-stone-200 rounded-xl outline-none focus:border-indigo-500"
                  maxLength={180}
                  placeholder="If different from contact"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-1.5 block">Phone</label>
              <input
                type="text"
                value={editing.contactPhone}
                onChange={(e) => setEditing({ ...editing, contactPhone: e.target.value })}
                className="w-full px-3.5 py-2.5 text-sm bg-white border border-stone-200 rounded-xl outline-none focus:border-indigo-500"
                maxLength={32}
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-1.5 block">Notes</label>
              <textarea
                value={editing.notes}
                onChange={(e) => setEditing({ ...editing, notes: e.target.value })}
                rows={3}
                className="w-full px-3.5 py-2.5 text-sm bg-white border border-stone-200 rounded-xl outline-none focus:border-indigo-500 resize-none"
                placeholder="Operational notes (optional)"
              />
            </div>

            {editing.id && (
              <label className="inline-flex items-center gap-2 text-sm text-stone-700">
                <input
                  type="checkbox"
                  checked={editing.isActive}
                  onChange={(e) => setEditing({ ...editing, isActive: e.target.checked })}
                  className="rounded border-stone-300"
                />
                Active (appears in pickers)
              </label>
            )}

            {error && <p className="text-xs text-red-600">{error}</p>}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setEditing(null)}>Cancel</Button>
              <Button size="sm" onClick={save} disabled={busy}>
                {busy ? "Saving…" : editing.id ? "Save" : "Create payer"}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
