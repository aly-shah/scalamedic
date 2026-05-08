"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, UserPlus, Loader2 } from "lucide-react";
import {
  Input,
  Select,
  Textarea,
  Button,
  Checkbox,
} from "@/components/ui";
import { SlidePanel } from "@/components/ui/slide-panel";
import { useModuleEmit } from "@/modules/core/hooks";
import { SystemEvents } from "@/modules/core/events";
import { useCreateLead } from "@/hooks/use-queries";

interface Prefill {
  name?: string;
  phone?: string;
  source?: string;
  notes?: string;
}

interface NewLeadModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Optional pre-fill (e.g. from a recent-call row click). Reapplied
   *  whenever the modal is reopened, so picking a different call
   *  swaps the form contents. */
  prefill?: Prefill;
}

export function NewLeadModal({ isOpen, onClose, prefill }: NewLeadModalProps) {
  const emit = useModuleEmit("MOD-COMMUNICATION");
  const createLead = useCreateLead();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [source, setSource] = useState("");
  const [interest, setInterest] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [callbackDate, setCallbackDate] = useState("");
  const [quickBook, setQuickBook] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Reset + apply prefill on each open. Tracking by isOpen is enough
  // since the parent only flips the prop when intentionally reopening.
  useEffect(() => {
    if (!isOpen) return;
    setName(prefill?.name ?? "");
    setPhone(prefill?.phone ?? "");
    setSource(prefill?.source ?? "");
    setInterest("");
    setEmail("");
    setNotes(prefill?.notes ?? "");
    setCallbackDate("");
    setQuickBook(false);
    setError(null);
    setSuccess(false);
  }, [isOpen, prefill]);

  const canSave = name.trim().length > 0 && phone.trim().length > 0 && source.length > 0;

  const handleSave = () => {
    if (!canSave) {
      setError("Name, phone, and source are required");
      return;
    }
    setError(null);
    createLead.mutate(
      {
        name: name.trim(),
        phone: phone.trim(),
        email: email.trim() || undefined,
        source,
        interest: interest || undefined,
        notes: notes.trim() || undefined,
        callbackDate: callbackDate || undefined,
        status: "NEW",
      },
      {
        onSuccess: () => {
          emit(SystemEvents.LEAD_CREATED, { name, phone, source });
          setSuccess(true);
          setTimeout(onClose, 900);
        },
        onError: (e) => setError(e instanceof Error ? e.message : "Could not save lead"),
      },
    );
  };

  return (
    <SlidePanel
      isOpen={isOpen}
      onClose={onClose}
      title="New Lead"
      subtitle="Capture an inbound enquiry so it shows on the pipeline."
      width="md"
      data-id="CALL-NEW-LEAD"
      footer={
        success ? undefined : (
          <>
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button
              onClick={handleSave}
              disabled={!canSave || createLead.isPending}
              iconLeft={createLead.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
            >
              {createLead.isPending ? "Saving…" : "Save lead"}
            </Button>
          </>
        )
      }
    >
      {success ? (
        <div className="flex flex-col items-center justify-center py-12 animate-fade-in">
          <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center mb-4">
            <CheckCircle2 className="w-8 h-8 text-emerald-500" />
          </div>
          <h3 className="text-lg font-semibold text-stone-900">Lead created</h3>
          <p className="text-sm text-stone-500 mt-1">{name || phone}</p>
        </div>
      ) : (
        <div className="space-y-5">
          {error && (
            <div className="bg-red-50 border border-red-100 text-red-700 text-sm rounded-xl px-3 py-2">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Name"
              placeholder="Full name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <Input
              label="Phone"
              placeholder="+92 300 0000000"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>

          <Input
            label="Email"
            type="email"
            placeholder="email@example.com (optional)"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Select
              label="Source"
              required
              placeholder="How did they reach us?"
              value={source}
              onChange={(e) => setSource(e.target.value)}
              options={[
                { value: "CALL",         label: "Phone call" },
                { value: "WALK_IN",      label: "Walk-in" },
                { value: "WEBSITE",      label: "Website" },
                { value: "SOCIAL_MEDIA", label: "Social media" },
                { value: "REFERRAL",     label: "Referral" },
              ]}
            />
            <Select
              label="Interest"
              placeholder="What are they asking about?"
              value={interest}
              onChange={(e) => setInterest(e.target.value)}
              options={[
                { value: "acne",          label: "Acne treatment" },
                { value: "anti-aging",    label: "Anti-aging" },
                { value: "laser",         label: "Laser treatment" },
                { value: "hair-loss",     label: "Hair loss" },
                { value: "chemical-peel", label: "Chemical peel" },
                { value: "hydrafacial",   label: "HydraFacial" },
                { value: "scar",          label: "Scar treatment" },
                { value: "skin-check",    label: "Skin check" },
                { value: "other",         label: "Other" },
              ]}
            />
          </div>

          <Textarea
            label="Notes"
            placeholder="What did they say? Anything to remember on follow-up?"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />

          <Input
            label="Callback Date"
            type="datetime-local"
            value={callbackDate}
            onChange={(e) => setCallbackDate(e.target.value)}
          />

          <div className="pt-3 border-t border-stone-100">
            <Checkbox
              checked={quickBook}
              onChange={setQuickBook}
              label="Quick book — open the booking modal after saving"
            />
            <p className="mt-1 text-[11px] text-stone-400 leading-snug">
              Coming soon: opens the appointment-create flow with this lead pre-filled. For now the lead saves and appears in the pipeline.
            </p>
          </div>
        </div>
      )}
    </SlidePanel>
  );
}
