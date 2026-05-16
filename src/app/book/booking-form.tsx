"use client";

/**
 * Multi-step public booking wizard.
 *
 * Step 1: pick a doctor (card grid; consultation fee, speciality, branch)
 * Step 2: pick a date (next 21 days) + a slot (3-col grid)
 * Step 3: patient details (first/last/phone required; email/dob/reason optional)
 * Step 4: confirmation (appointment code + patient code + summary)
 *
 * No external state libs — useState only, no react-query (matches
 * the doctor-app pattern). All API calls go to /api/public/booking/*
 * which are anonymous, Host-resolved, IP-rate-limited.
 *
 * Slot-conflict handling: if POST /create returns 409 SLOT_TAKEN,
 * we kick the user back to step 2 with a banner and refetch
 * availability so the freshly-booked slot drops out.
 */
import { useCallback, useEffect, useMemo, useState } from "react";

interface Doctor {
  id: string;
  name: string;
  speciality: string | null;
  avatar: string | null;
  consultationFee: number | null;
  branchId: string | null;
  branchName: string | null;
}

interface Slot {
  startTime: string;
  endTime: string;
}

interface AvailabilityResponse {
  success: boolean;
  error?: string;
  data?: { slots: Slot[]; reason?: string };
}

interface CreateResponse {
  success: boolean;
  error?: string;
  code?: string;
  data?: {
    appointmentId: string;
    appointmentCode: string;
    patientCode: string;
    date: string;
    startTime: string;
    endTime: string;
  };
}

type Step = "doctor" | "slot" | "details" | "done";

const STEPS: Step[] = ["doctor", "slot", "details", "done"];

function formatFee(amount: number | null, currency: string, locale: string): string {
  if (amount == null) return "";
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: currency === "PKR" ? 0 : 2,
    maximumFractionDigits: currency === "PKR" ? 0 : 2,
  }).format(amount);
}

function toDateValue(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function next21Days(): Array<{ value: string; label: string; weekday: string }> {
  const out: Array<{ value: string; label: string; weekday: string }> = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = 0; i < 21; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    out.push({
      value: toDateValue(d),
      label: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      weekday: d.toLocaleDateString("en-US", { weekday: "short" }),
    });
  }
  return out;
}

export default function BookingForm({
  tenantName,
  currency,
  locale,
}: {
  tenantName: string;
  currency: string;
  locale: string;
}) {
  const [step, setStep] = useState<Step>("doctor");

  // Step 1 state
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [doctorsLoading, setDoctorsLoading] = useState(true);
  const [doctorsError, setDoctorsError] = useState<string | null>(null);
  const [doctor, setDoctor] = useState<Doctor | null>(null);

  // Step 2 state
  const dates = useMemo(() => next21Days(), []);
  const [date, setDate] = useState<string>(dates[0]?.value ?? "");
  const [slots, setSlots] = useState<Slot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsError, setSlotsError] = useState<string | null>(null);
  const [slotsReason, setSlotsReason] = useState<string | null>(null);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [conflictBanner, setConflictBanner] = useState<string | null>(null);

  // Step 3 state
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [gender, setGender] = useState<"MALE" | "FEMALE" | "OTHER" | "">("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Step 4 state
  const [confirmation, setConfirmation] = useState<CreateResponse["data"] | null>(null);

  // Load doctors on mount.
  useEffect(() => {
    let cancelled = false;
    setDoctorsLoading(true);
    fetch("/api/public/booking/doctors")
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (!d.success) {
          setDoctorsError(d.error || "Failed to load doctors");
          return;
        }
        setDoctors(d.data as Doctor[]);
      })
      .catch(() => { if (!cancelled) setDoctorsError("Network error loading doctors"); })
      .finally(() => { if (!cancelled) setDoctorsLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // Load slots whenever doctor or date changes.
  const loadSlots = useCallback(async (doctorId: string, dateStr: string) => {
    setSlotsLoading(true);
    setSlotsError(null);
    setSlotsReason(null);
    setSlot(null);
    try {
      const res = await fetch(`/api/public/booking/availability?doctorId=${encodeURIComponent(doctorId)}&date=${encodeURIComponent(dateStr)}`);
      const json = (await res.json()) as AvailabilityResponse;
      if (!json.success) {
        setSlotsError(json.error || "Failed to load slots");
        setSlots([]);
        return;
      }
      setSlots(json.data?.slots ?? []);
      setSlotsReason(json.data?.reason ?? null);
    } catch {
      setSlotsError("Network error loading slots");
      setSlots([]);
    } finally {
      setSlotsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (step === "slot" && doctor && date) {
      loadSlots(doctor.id, date);
    }
  }, [step, doctor, date, loadSlots]);

  async function submit() {
    if (!doctor || !slot) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch("/api/public/booking/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          doctorId: doctor.id,
          date,
          startTime: slot.startTime,
          durationMinutes: 30,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          phone: phone.trim(),
          email: email.trim() || undefined,
          dateOfBirth: dateOfBirth || undefined,
          gender: gender || undefined,
          reason: reason.trim() || undefined,
        }),
      });
      const json = (await res.json()) as CreateResponse;
      if (!json.success || !json.data) {
        if (json.code === "SLOT_TAKEN") {
          setConflictBanner("That slot was just taken. Pick another.");
          setSlot(null);
          setStep("slot");
          if (doctor) await loadSlots(doctor.id, date);
        } else {
          setSubmitError(json.error || "Booking failed");
        }
        return;
      }
      setConfirmation(json.data);
      setStep("done");
    } catch {
      setSubmitError("Network error — try again");
    } finally {
      setSubmitting(false);
    }
  }

  const stepIndex = STEPS.indexOf(step);

  return (
    <section className="max-w-2xl mx-auto px-4 sm:px-6 pb-12">
      {/* Step indicator */}
      <ol className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-stone-500 mb-6">
        {(["doctor","slot","details","done"] as const).map((s, i) => (
          <li key={s} className="flex items-center gap-2">
            <span
              className={
                "inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold " +
                (i < stepIndex ? "bg-teal-600 text-white" :
                 i === stepIndex ? "bg-stone-900 text-white" :
                 "bg-stone-200 text-stone-500")
              }
            >
              {i + 1}
            </span>
            <span className={i === stepIndex ? "text-stone-900 font-semibold" : ""}>
              {s === "doctor" ? "Doctor" : s === "slot" ? "Slot" : s === "details" ? "You" : "Done"}
            </span>
            {i < 3 && <span className="text-stone-300">→</span>}
          </li>
        ))}
      </ol>

      {conflictBanner && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {conflictBanner}
        </div>
      )}

      {/* Step 1 — Doctor */}
      {step === "doctor" && (
        <div className="space-y-3">
          {doctorsLoading && <div className="text-sm text-stone-500">Loading doctors…</div>}
          {doctorsError && <div className="text-sm text-red-600">{doctorsError}</div>}
          {!doctorsLoading && !doctorsError && doctors.length === 0 && (
            <div className="text-sm text-stone-500">No doctors available right now.</div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {doctors.map((d) => (
              <button
                key={d.id}
                onClick={() => { setDoctor(d); setStep("slot"); }}
                className={
                  "text-left rounded-2xl border bg-white p-4 transition shadow-sm hover:shadow-md " +
                  (doctor?.id === d.id ? "border-teal-500 ring-2 ring-teal-200" : "border-stone-200")
                }
              >
                <div className="flex items-start gap-3">
                  {d.avatar ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={d.avatar} alt={d.name} className="w-12 h-12 rounded-full object-cover" />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-teal-500 to-cyan-600 text-white flex items-center justify-center font-bold">
                      {d.name.split(" ").slice(-1)[0]?.charAt(0) ?? "D"}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="font-bold text-stone-900 truncate">{d.name}</p>
                    {d.speciality && <p className="text-xs text-stone-500 truncate">{d.speciality}</p>}
                    {d.branchName && <p className="text-[11px] text-stone-400 truncate mt-0.5">{d.branchName}</p>}
                    {d.consultationFee != null && (
                      <p className="text-xs font-semibold text-teal-700 mt-1.5">{formatFee(d.consultationFee, currency, locale)} consultation</p>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Step 2 — Slot */}
      {step === "slot" && doctor && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-stone-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-wider text-stone-500">With</p>
                <p className="font-bold text-stone-900">{doctor.name}</p>
                {doctor.speciality && <p className="text-xs text-stone-500">{doctor.speciality}</p>}
              </div>
              <button onClick={() => setStep("doctor")} className="text-sm text-teal-700 font-semibold">Change</button>
            </div>
          </div>

          <div>
            <p className="text-xs uppercase tracking-wider text-stone-500 font-semibold mb-2">Pick a date</p>
            <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 snap-x">
              {dates.map((d) => (
                <button
                  key={d.value}
                  onClick={() => setDate(d.value)}
                  className={
                    "snap-start shrink-0 w-16 rounded-xl border px-2 py-2 text-center transition " +
                    (date === d.value
                      ? "border-teal-500 bg-teal-50 text-teal-900"
                      : "border-stone-200 bg-white text-stone-700 hover:border-stone-300")
                  }
                >
                  <p className="text-[10px] uppercase tracking-wider">{d.weekday}</p>
                  <p className="font-bold text-sm mt-0.5">{d.label}</p>
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs uppercase tracking-wider text-stone-500 font-semibold mb-2">Available slots</p>
            {slotsLoading && <div className="text-sm text-stone-500">Loading…</div>}
            {slotsError && <div className="text-sm text-red-600">{slotsError}</div>}
            {!slotsLoading && !slotsError && slots.length === 0 && (
              <div className="rounded-xl border border-stone-200 bg-white px-4 py-6 text-center text-sm text-stone-500">
                {slotsReason === "ON_LEAVE"
                  ? "Doctor is on leave that day. Try another date."
                  : slotsReason === "PAST_DATE"
                  ? "Cannot book in the past. Pick a later date."
                  : "No free slots that day — try another date."}
              </div>
            )}
            <div className="grid grid-cols-3 gap-2">
              {slots.map((s) => (
                <button
                  key={s.startTime}
                  onClick={() => { setSlot(s); setStep("details"); }}
                  className={
                    "rounded-xl border px-3 py-3 text-sm font-semibold transition " +
                    (slot?.startTime === s.startTime
                      ? "border-teal-500 bg-teal-50 text-teal-900"
                      : "border-stone-200 bg-white text-stone-800 hover:border-stone-300")
                  }
                >
                  {s.startTime}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Step 3 — Details */}
      {step === "details" && doctor && slot && (
        <form
          onSubmit={(e) => { e.preventDefault(); submit(); }}
          className="space-y-4"
        >
          <div className="rounded-2xl border border-stone-200 bg-white p-4 space-y-1">
            <p className="text-xs uppercase tracking-wider text-stone-500">Booking</p>
            <p className="font-bold text-stone-900">{doctor.name}</p>
            <p className="text-sm text-stone-600">{date} · {slot.startTime} – {slot.endTime}</p>
            <button type="button" onClick={() => setStep("slot")} className="text-sm text-teal-700 font-semibold mt-1">Change slot</button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-semibold text-stone-600">First name</span>
              <input required value={firstName} onChange={(e) => setFirstName(e.target.value)} className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2.5 text-sm" placeholder="First" />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-stone-600">Last name</span>
              <input required value={lastName} onChange={(e) => setLastName(e.target.value)} className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2.5 text-sm" placeholder="Last" />
            </label>
          </div>

          <label className="block">
            <span className="text-xs font-semibold text-stone-600">Phone</span>
            <input required value={phone} onChange={(e) => setPhone(e.target.value)} className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2.5 text-sm" placeholder="+92 300 0000000" inputMode="tel" />
          </label>

          <label className="block">
            <span className="text-xs font-semibold text-stone-600">Email <span className="text-stone-400 font-normal">(optional)</span></span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2.5 text-sm" placeholder="you@example.com" />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-semibold text-stone-600">Date of birth <span className="text-stone-400 font-normal">(optional)</span></span>
              <input type="date" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2.5 text-sm" />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-stone-600">Gender <span className="text-stone-400 font-normal">(optional)</span></span>
              <select value={gender} onChange={(e) => setGender(e.target.value as "MALE" | "FEMALE" | "OTHER" | "")} className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2.5 text-sm bg-white">
                <option value="">—</option>
                <option value="FEMALE">Female</option>
                <option value="MALE">Male</option>
                <option value="OTHER">Other</option>
              </select>
            </label>
          </div>

          <label className="block">
            <span className="text-xs font-semibold text-stone-600">Reason for visit <span className="text-stone-400 font-normal">(optional)</span></span>
            <textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2.5 text-sm" placeholder="e.g. acne follow-up, melasma consultation, …" />
          </label>

          {submitError && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{submitError}</div>
          )}

          <button
            type="submit"
            disabled={submitting || !firstName.trim() || !lastName.trim() || !phone.trim()}
            className="w-full rounded-xl bg-teal-600 text-white font-semibold py-3 disabled:bg-stone-300 disabled:cursor-not-allowed hover:bg-teal-700 transition"
          >
            {submitting ? "Booking…" : "Confirm booking"}
          </button>
          <p className="text-[11px] text-stone-400 text-center">
            By confirming you agree to be contacted about this visit. No password required — your phone is your identifier.
          </p>
        </form>
      )}

      {/* Step 4 — Confirmation */}
      {step === "done" && confirmation && doctor && (
        <div className="rounded-3xl border border-emerald-200 bg-white p-6 sm:p-8 shadow-sm">
          <div className="w-14 h-14 rounded-full bg-emerald-500 text-white flex items-center justify-center mx-auto">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="w-7 h-7">
              <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <h2 className="mt-4 text-xl sm:text-2xl font-bold text-stone-900 text-center">Booked!</h2>
          <p className="mt-1 text-sm text-stone-600 text-center">
            We&apos;ve saved your slot at {tenantName}.
          </p>
          <dl className="mt-6 grid grid-cols-1 gap-2 text-sm">
            <div className="flex justify-between border-b border-stone-100 pb-2"><dt className="text-stone-500">Appointment</dt><dd className="font-mono font-bold text-stone-900">{confirmation.appointmentCode}</dd></div>
            <div className="flex justify-between border-b border-stone-100 pb-2"><dt className="text-stone-500">Patient</dt><dd className="font-mono font-bold text-stone-900">{confirmation.patientCode}</dd></div>
            <div className="flex justify-between border-b border-stone-100 pb-2"><dt className="text-stone-500">Doctor</dt><dd className="font-semibold text-stone-900">{doctor.name}</dd></div>
            <div className="flex justify-between border-b border-stone-100 pb-2"><dt className="text-stone-500">Date</dt><dd className="font-semibold text-stone-900">{confirmation.date}</dd></div>
            <div className="flex justify-between pb-2"><dt className="text-stone-500">Time</dt><dd className="font-semibold text-stone-900">{confirmation.startTime} – {confirmation.endTime}</dd></div>
          </dl>
          <p className="mt-6 text-xs text-stone-400 text-center">
            Please arrive 10 minutes early. Take a screenshot of this confirmation.
          </p>
          <button
            onClick={() => {
              setStep("doctor"); setDoctor(null); setSlot(null);
              setFirstName(""); setLastName(""); setPhone(""); setEmail("");
              setDateOfBirth(""); setGender(""); setReason("");
              setConfirmation(null); setConflictBanner(null);
            }}
            className="mt-6 w-full rounded-xl border border-stone-300 bg-white text-stone-900 font-semibold py-3 hover:bg-stone-50"
          >
            Book another
          </button>
        </div>
      )}
    </section>
  );
}
