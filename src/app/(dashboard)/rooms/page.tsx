"use client";

import { useState } from "react";
import {
  DoorOpen,
  User,
  Stethoscope,
  Clock,
  Wrench,
  Sparkles,
  Plus,
  Pencil,
  Trash2,
  Loader2,
} from "lucide-react";
import {
  Card,
  Badge,
  StatCard,
  Avatar,
  Button,
  Input,
  Select,
} from "@/components/ui";
import { SlidePanel } from "@/components/ui/slide-panel";
import { RoomStatus, RoomType, UserRole } from "@/types";
import { formatTime } from "@/lib/utils";
import { useModuleAccess } from "@/modules/core/hooks";
import { useRooms, useBranches } from "@/hooks/use-queries";
import { useAuth } from "@/lib/auth-context";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { LoadingSpinner } from "@/components/ui/loading";

const statusConfig: Record<string, { label: string; dotColor: string; bgColor: string; variant: "success" | "danger" | "warning" | "default" }> = {
  [RoomStatus.AVAILABLE]: { label: "Available", dotColor: "bg-emerald-400", bgColor: "bg-emerald-50 border-emerald-100", variant: "success" },
  [RoomStatus.OCCUPIED]: { label: "Occupied", dotColor: "bg-red-400", bgColor: "bg-red-50 border-red-100", variant: "danger" },
  [RoomStatus.CLEANING]: { label: "Cleaning", dotColor: "bg-amber-400", bgColor: "bg-amber-50 border-amber-100", variant: "warning" },
  [RoomStatus.MAINTENANCE]: { label: "Maintenance", dotColor: "bg-stone-400", bgColor: "bg-stone-50 border-stone-200", variant: "default" },
};

const typeIcons: Record<string, React.ReactNode> = {
  [RoomType.CONSULTATION]: <Stethoscope className="w-5 h-5" />,
  [RoomType.PROCEDURE]: <Sparkles className="w-5 h-5" />,
  [RoomType.WAITING]: <Clock className="w-5 h-5" />,
  [RoomType.RECOVERY]: <User className="w-5 h-5" />,
};

type RoomRow = {
  id: string;
  name: string;
  number?: string | null;
  floor?: number | null;
  branchId: string;
  status: string;
  type: string;
  capacity: number;
  equipment?: string | null;
  isAvailable?: boolean;
  currentPatientName?: string;
  currentDoctorName?: string;
  occupiedSince?: string;
};

const emptyForm = {
  name: "",
  number: "",
  floor: "",
  branchId: "",
  type: RoomType.CONSULTATION as string,
  status: RoomStatus.AVAILABLE as string,
  capacity: "1",
  equipment: "",
};

export default function RoomsPage() {
  const access = useModuleAccess("MOD-ROOMS");
  const { user } = useAuth();
  const isAdmin = user?.role === UserRole.SUPER_ADMIN || user?.role === UserRole.ADMIN;
  const qc = useQueryClient();
  const [activeBranch, setActiveBranch] = useState("all");
  const [editing, setEditing] = useState<RoomRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: roomsResponse, isLoading: isLoadingRooms } = useRooms();
  const rooms = (roomsResponse?.data || []) as RoomRow[];

  const { data: branchesResponse, isLoading: isLoadingBranches } = useBranches();
  const branches = (branchesResponse?.data || []) as Array<{ id: string; name: string; isActive: boolean }>;

  function openCreate() {
    const defaultBranch = activeBranch !== "all" ? activeBranch : branches[0]?.id ?? "";
    setForm({ ...emptyForm, branchId: defaultBranch });
    setError(null);
    setCreating(true);
  }
  function openEdit(r: RoomRow) {
    setForm({
      name: r.name ?? "",
      number: r.number ?? "",
      floor: r.floor != null ? String(r.floor) : "",
      branchId: r.branchId,
      type: r.type,
      status: r.status,
      capacity: String(r.capacity ?? 1),
      equipment: r.equipment ?? "",
    });
    setError(null);
    setEditing(r);
  }
  function closePanels() {
    setCreating(false);
    setEditing(null);
    setError(null);
  }

  async function submit() {
    if (!form.name.trim()) { setError("Name is required."); return; }
    if (!form.branchId) { setError("Pick a branch."); return; }
    setSubmitting(true);
    setError(null);
    try {
      const payload = {
        name: form.name.trim(),
        number: form.number.trim() || null,
        floor: form.floor ? parseInt(form.floor, 10) : null,
        branchId: form.branchId,
        type: form.type,
        status: form.status,
        capacity: Math.max(1, parseInt(form.capacity || "1", 10)),
        equipment: form.equipment.trim() || null,
      };
      if (editing) await api.rooms.update(editing.id, payload);
      else await api.rooms.create(payload);
      qc.invalidateQueries({ queryKey: ["rooms"] });
      closePanels();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed.");
    } finally {
      setSubmitting(false);
    }
  }

  async function deleteRoom(r: RoomRow) {
    if (!confirm(`Delete room "${r.name}"? This can't be undone.`)) return;
    try {
      await api.rooms.delete(r.id);
      qc.invalidateQueries({ queryKey: ["rooms"] });
    } catch (e) {
      // 409 from API gives a clean message about appointment FKs.
      alert(e instanceof Error ? e.message : "Failed to delete.");
    }
  }

  const filteredRooms = activeBranch === "all"
    ? rooms
    : rooms.filter((r) => r.branchId === activeBranch);

  const available = rooms.filter((r) => r.status === RoomStatus.AVAILABLE).length;
  const occupied = rooms.filter((r) => r.status === RoomStatus.OCCUPIED).length;

  if (isLoadingRooms || isLoadingBranches) {
    return <div className="flex items-center justify-center py-20"><LoadingSpinner size="lg" /></div>;
  }

  if (!access.canView) {
    return (
      <div className="flex items-center justify-center py-20 text-stone-500">
        You don&apos;t have access to this module.
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6 animate-fade-in" data-id="APPT-ROOM-ALLOCATE">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-teal-50 flex items-center justify-center">
            <DoorOpen className="w-5 h-5 text-teal-600" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-semibold text-stone-900">Rooms</h1>
            <p className="text-sm text-stone-400 mt-0.5">Manage clinic rooms, availability, and assignments</p>
          </div>
        </div>
        {isAdmin && (
          <Button iconLeft={<Plus className="w-4 h-4" />} onClick={openCreate}>Add Room</Button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
        <StatCard label="Total Rooms" value={rooms.length} icon={<DoorOpen className="w-6 h-6" />} color="primary" />
        <StatCard label="Available" value={available} icon={<DoorOpen className="w-6 h-6" />} color="success" />
        <StatCard label="Occupied" value={occupied} icon={<DoorOpen className="w-6 h-6" />} color="danger" />
      </div>

      {/* Branch Filter */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setActiveBranch("all")}
          className={`px-4 py-2 text-sm font-medium rounded-full transition-all cursor-pointer ${
            activeBranch === "all"
              ? "bg-teal-600 text-white shadow-sm"
              : "bg-stone-100 text-stone-600 hover:bg-stone-200"
          }`}
        >
          All Branches
        </button>
        {branches.filter((b) => b.isActive).map((branch) => (
          <button
            key={branch.id}
            onClick={() => setActiveBranch(branch.id)}
            className={`px-4 py-2 text-sm font-medium rounded-full transition-all cursor-pointer ${
              activeBranch === branch.id
                ? "bg-teal-600 text-white shadow-sm"
                : "bg-stone-100 text-stone-600 hover:bg-stone-200"
            }`}
          >
            {branch.name.replace("MediCore ", "")}
          </button>
        ))}
      </div>

      {/* Room Cards Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
        {filteredRooms.map((room) => {
          const config = statusConfig[room.status];
          const branch = branches.find((b) => b.id === room.branchId);

          return (
            <Card
              key={room.id}
              hover
              padding="lg"
              className={`animate-fade-in border ${config.bgColor}`}
            >
              <div className="flex flex-col gap-3">
                {/* Header */}
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-xl bg-white/80 flex items-center justify-center text-stone-600">
                      {typeIcons[room.type] || <DoorOpen className="w-5 h-5" />}
                    </div>
                    <div>
                      <p className="font-semibold text-stone-800 text-sm truncate min-w-0">{room.name}</p>
                      <p className="text-xs text-stone-400">{branch?.name.replace("MediCore ", "") || "Unknown"}</p>
                    </div>
                  </div>
                  {/* Status Dot */}
                  <div className="flex items-center gap-1.5">
                    <span className={`w-3 h-3 rounded-full ${config.dotColor} animate-pulse`} />
                  </div>
                </div>

                {/* Status Badge */}
                <Badge variant={config.variant} dot>{config.label}</Badge>

                {/* Occupied Info */}
                {room.status === RoomStatus.OCCUPIED && room.currentPatientName && (
                  <div className="space-y-2 pt-3 border-t border-stone-200/50">
                    <div className="flex items-center gap-2">
                      <Avatar name={room.currentPatientName} size="sm" />
                      <div>
                        <p className="text-sm font-medium text-stone-700">{room.currentPatientName}</p>
                        <p className="text-xs text-stone-400">Patient</p>
                      </div>
                    </div>
                    {room.currentDoctorName && (
                      <div className="flex items-center gap-2">
                        <Avatar name={room.currentDoctorName} size="sm" />
                        <div>
                          <p className="text-sm font-medium text-stone-700">{room.currentDoctorName}</p>
                          <p className="text-xs text-stone-400">Doctor</p>
                        </div>
                      </div>
                    )}
                    {room.occupiedSince && (
                      <div className="flex items-center gap-1.5 text-xs text-stone-400">
                        <Clock className="w-3.5 h-3.5" />
                        <span>Since {formatTime(room.occupiedSince)}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Maintenance info */}
                {room.status === RoomStatus.MAINTENANCE && (
                  <div className="flex items-center gap-2 pt-3 border-t border-stone-200/50 text-sm text-stone-500">
                    <Wrench className="w-4 h-4" />
                    <span>Under maintenance</span>
                  </div>
                )}

                {/* Cleaning info */}
                {room.status === RoomStatus.CLEANING && (
                  <div className="flex items-center gap-2 pt-3 border-t border-stone-200/50 text-sm text-stone-500">
                    <Sparkles className="w-4 h-4" />
                    <span>Being cleaned</span>
                  </div>
                )}

                {/* Capacity */}
                <div className="text-xs text-stone-400">
                  Capacity: {room.capacity} {room.capacity === 1 ? "person" : "people"}
                </div>

                {/* Admin actions */}
                {isAdmin && (
                  <div className="flex items-center gap-1.5 pt-2 border-t border-stone-200/50">
                    <button
                      onClick={() => openEdit(room)}
                      title="Edit room"
                      className="flex items-center gap-1 text-xs text-stone-500 hover:text-teal-600 px-2 py-1 rounded-lg hover:bg-white/60 cursor-pointer"
                    >
                      <Pencil className="w-3 h-3" /> Edit
                    </button>
                    <button
                      onClick={() => deleteRoom(room)}
                      title="Delete room"
                      className="flex items-center gap-1 text-xs text-stone-500 hover:text-red-600 px-2 py-1 rounded-lg hover:bg-white/60 cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3" /> Delete
                    </button>
                  </div>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      {/* Create / Edit slide panel — admins only */}
      <SlidePanel
        isOpen={creating || !!editing}
        onClose={closePanels}
        title={editing ? "Edit room" : "Add room"}
        subtitle={editing ? editing.name : "Create a new clinic room"}
        width="md"
        footer={
          <>
            <Button variant="ghost" onClick={closePanels}>Cancel</Button>
            <Button onClick={submit} disabled={submitting}>
              {submitting ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Saving…</> : (editing ? "Save changes" : "Create room")}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-100 rounded-xl px-3 py-2 text-sm text-red-700">{error}</div>
          )}
          <Input label="Name" required placeholder="e.g. Procedure Room A"
            value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Number (optional)" placeholder="e.g. 101"
              value={form.number} onChange={(e) => setForm({ ...form, number: e.target.value })} />
            <Input label="Floor (optional)" type="number" placeholder="e.g. 1"
              value={form.floor} onChange={(e) => setForm({ ...form, floor: e.target.value })} />
          </div>
          <Select label="Branch" required value={form.branchId}
            placeholder="Select branch"
            onChange={(e) => setForm({ ...form, branchId: e.target.value })}
            options={branches.filter((b) => b.isActive).map((b) => ({ value: b.id, label: b.name }))} />
          <div className="grid grid-cols-2 gap-3">
            <Select label="Type" value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value })}
              options={Object.values(RoomType).map((t) => ({ value: t, label: t }))} />
            <Select label="Status" value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
              options={Object.values(RoomStatus).map((s) => ({ value: s, label: s }))} />
          </div>
          <Input label="Capacity" type="number" placeholder="e.g. 1"
            value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} />
          <Input label="Equipment (optional)" placeholder="e.g. ECG, ultrasound"
            value={form.equipment} onChange={(e) => setForm({ ...form, equipment: e.target.value })} />
        </div>
      </SlidePanel>
    </div>
  );
}
