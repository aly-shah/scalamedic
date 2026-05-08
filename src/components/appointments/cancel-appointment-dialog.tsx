"use client";

/**
 * CancelAppointmentDialog
 *
 * Replaces the native browser prompt() that the cancel-appointment flow
 * used to use. Captures a structured reason (preset chip + optional free
 * text) so the cancellationNote on the appointment is consistent across
 * staff — "Patient request" or "Doctor unavailable" search/group cleanly,
 * a free-text "she had a cold" doesn't.
 *
 * The composed note shape sent to the API is `{Preset}: {extra}` when
 * extra notes are typed, otherwise just `{Preset}`. "Other" requires a
 * typed reason since the preset alone carries no information.
 */
import { useState } from "react";
import { AlertTriangle, Loader2, XCircle } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface CancelAppointmentDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (cancellationNote: string) => Promise<void> | void;
  patientName: string;
  appointmentCode?: string;
  appointmentTime?: string;
  doctorName?: string;
}

const PRESET_REASONS = [
  "Patient request",
  "Doctor unavailable",
  "Rescheduled",
  "Emergency",
  "Payment issue",
  "Other",
] as const;

type Preset = (typeof PRESET_REASONS)[number];

export function CancelAppointmentDialog({
  isOpen,
  onClose,
  onConfirm,
  patientName,
  appointmentCode,
  appointmentTime,
  doctorName,
}: CancelAppointmentDialogProps) {
  const [preset, setPreset] = useState<Preset | null>(null);
  const [extra, setExtra] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset state whenever the dialog opens — derived-from-prop pattern,
  // same as BlockSlotPanel. Keeps reason from leaking between two
  // back-to-back cancellations.
  const [seenOpen, setSeenOpen] = useState(false);
  if (isOpen !== seenOpen) {
    setSeenOpen(isOpen);
    if (isOpen) {
      setPreset(null);
      setExtra("");
      setError(null);
      setSubmitting(false);
    }
  }

  const otherRequired = preset === "Other";
  const trimmedExtra = extra.trim();
  const canSubmit = preset !== null && (!otherRequired || trimmedExtra.length > 0);

  async function handleConfirm() {
    if (!preset) {
      setError("Pick a reason for the cancellation.");
      return;
    }
    if (otherRequired && !trimmedExtra) {
      setError("Add a short note explaining the cancellation.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const note = trimmedExtra ? `${preset}: ${trimmedExtra}` : preset;
      await onConfirm(note);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not cancel appointment.");
      setSubmitting(false);
    }
    // Don't reset submitting on success — the parent closes the dialog.
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={submitting ? () => {} : onClose}
      title="Cancel appointment"
      size="md"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Keep appointment
          </Button>
          <Button
            variant="danger"
            onClick={handleConfirm}
            disabled={!canSubmit || submitting}
            iconLeft={submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
          >
            {submitting ? "Cancelling..." : "Cancel appointment"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {/* Context — what's being cancelled */}
        <div className="flex items-start gap-3 p-3 rounded-xl bg-red-50/50 border border-red-100">
          <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-4 h-4 text-red-500" />
          </div>
          <div className="text-sm text-stone-700 min-w-0 flex-1">
            <p className="font-medium text-stone-900 truncate">{patientName}</p>
            <p className="text-xs text-stone-500 mt-0.5">
              {[appointmentCode, doctorName, appointmentTime].filter(Boolean).join(" · ")}
            </p>
            <p className="text-xs text-red-700 mt-1.5">
              The slot becomes free, the room is released, and the patient is removed from today&apos;s queue.
            </p>
          </div>
        </div>

        {/* Reason chips */}
        <div>
          <label className="text-sm font-medium text-stone-700 block mb-2">
            Reason <span className="text-red-400">*</span>
          </label>
          <div className="flex flex-wrap gap-2">
            {PRESET_REASONS.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => { setPreset(r); setError(null); }}
                disabled={submitting}
                className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-all cursor-pointer ${
                  preset === r
                    ? "bg-red-600 text-white border-red-600"
                    : "bg-white text-stone-600 border-stone-200 hover:border-stone-300 hover:bg-stone-50"
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        {/* Notes — required when "Other" is picked */}
        <Textarea
          label={otherRequired ? "Note" : "Add a note (optional)"}
          required={otherRequired}
          rows={3}
          placeholder={
            otherRequired
              ? "Briefly explain why the appointment is being cancelled..."
              : "Anything reception or the doctor should know..."
          }
          value={extra}
          onChange={(e) => setExtra(e.target.value)}
          disabled={submitting}
        />

        {error && (
          <div className="px-3 py-2 rounded-xl bg-red-50 border border-red-100 text-sm text-red-700">
            {error}
          </div>
        )}
      </div>
    </Modal>
  );
}
