/**
 * @system MediCore ERP — Public review form
 * @route /review/[token]
 *
 * Anonymous landing for patients who scan the receipt QR. No PII is
 * ever shown — the page only knows whether a review is currently
 * being collected for this token and renders one of three states:
 *
 *   ELIGIBLE          → review form (1-5 stars + comment + recommend)
 *   ALREADY_SUBMITTED → "thanks for your feedback"
 *   OUTSIDE_WINDOW    → generic "thank you for visiting"
 *   REVOKED/NOT_FOUND → falls through to OUTSIDE_WINDOW UI (don't
 *                       confirm or deny existence)
 */
"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

type State = "LOADING" | "ELIGIBLE" | "ALREADY_SUBMITTED" | "OUTSIDE_WINDOW" | "ERROR";

export default function ReviewPage() {
  const { token } = useParams<{ token: string }>();
  const [state, setState] = useState<State>("LOADING");
  // Default is the platform name; replaced with the real tenant.name
  // by the by-token loader as soon as the page mounts.
  const [clinicName, setClinicName] = useState("ScalaMedic");

  // Form state
  const [rating, setRating] = useState<number>(0);
  const [feedback, setFeedback] = useState("");
  const [wouldRecommend, setWouldRecommend] = useState<boolean | null>(null);
  const [pseudonym, setPseudonym] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/reviews/by-token/${token}`)
      .then((r) => r.json())
      .then((d: { success: boolean; state: string; clinicName?: string }) => {
        if (cancelled) return;
        if (d.clinicName) setClinicName(d.clinicName);
        if (d.state === "ELIGIBLE") setState("ELIGIBLE");
        else if (d.state === "ALREADY_SUBMITTED") setState("ALREADY_SUBMITTED");
        else setState("OUTSIDE_WINDOW");
      })
      .catch(() => { if (!cancelled) setState("ERROR"); });
    return () => { cancelled = true; };
  }, [token]);

  async function submit() {
    if (rating < 1 || rating > 5) {
      setSubmitError("Please pick a star rating");
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const r = await fetch(`/api/reviews/by-token/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rating,
          feedback: feedback.trim() || undefined,
          wouldRecommend,
          pseudonym: pseudonym.trim() || undefined,
        }),
      });
      const d = await r.json();
      if (d.success) {
        setState("ALREADY_SUBMITTED");
        return;
      }
      // Server may have flipped the state under us (e.g. window
      // expired between page load and submit). Reflect that.
      if (d.state === "ALREADY_SUBMITTED") setState("ALREADY_SUBMITTED");
      else if (d.state === "OUTSIDE_WINDOW" || d.state === "REVOKED") setState("OUTSIDE_WINDOW");
      else setSubmitError(d.error || "Could not submit. Please try again.");
    } catch {
      setSubmitError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-[100dvh] w-full bg-gradient-to-b from-teal-50 via-emerald-50 to-cyan-50 px-6 py-8 sm:px-12 sm:py-12 lg:px-20 lg:py-16">
      {/* Full-bleed surface — no centered card. The form content
          itself uses max-w-3xl so text doesn't sprawl edge-to-edge on
          ultrawide monitors, but the gradient background fills the
          viewport. */}
      <div className="mx-auto w-full max-w-3xl">
        {/* Brand strip */}
        <div className="text-center">
          <div className="w-20 h-20 sm:w-24 sm:h-24 mx-auto rounded-full bg-gradient-to-br from-teal-500 via-emerald-500 to-cyan-500 flex items-center justify-center shadow-xl shadow-teal-500/20">
            <Heart />
          </div>
          <p className="mt-4 text-xs sm:text-sm uppercase tracking-wider text-stone-500 font-semibold">
            {clinicName}
          </p>
        </div>

        {state === "LOADING" && (
          <div className="mt-6 flex justify-center">
            <Spinner />
          </div>
        )}

        {state === "ELIGIBLE" && (
          <>
            <h1 className="mt-6 text-3xl sm:text-4xl font-bold text-stone-900 text-center tracking-tight">
              How was your visit?
            </h1>
            <p className="mt-3 text-base sm:text-lg text-stone-500 text-center leading-relaxed max-w-md mx-auto">
              Your feedback helps us improve. It takes less than a minute.
            </p>

            {/* Star rating — the only required field. Bigger tap
                targets on mobile (44px+ apple HIG minimum). */}
            <div className="mt-6">
              <p className="text-xs uppercase tracking-wider text-stone-400 font-semibold mb-3 text-center">
                Rate the service <span className="text-red-400">*</span>
              </p>
              <div className="flex items-center justify-center gap-2 sm:gap-1.5">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setRating(n)}
                    aria-label={`${n} star${n > 1 ? "s" : ""}`}
                    className="p-2 sm:p-1 rounded-full transition-transform hover:scale-110 active:scale-95 cursor-pointer"
                  >
                    <Star filled={n <= rating} />
                  </button>
                ))}
              </div>
              <p className="mt-3 text-center text-sm sm:text-xs text-stone-500 min-h-[1.25em] font-medium">
                {rating > 0 ? RATING_LABELS[rating - 1] : "Tap a star"}
              </p>
            </div>

            {/* Pseudonym — optional display name. Privacy-first copy. */}
            <div className="mt-5">
              <label className="text-xs uppercase tracking-wider text-stone-400 font-semibold">
                Display name <span className="font-normal lowercase tracking-normal text-stone-300">(optional)</span>
              </label>
              <input
                type="text"
                value={pseudonym}
                onChange={(e) => setPseudonym(e.target.value.slice(0, 60))}
                placeholder="A nickname or initials — anything you like"
                maxLength={60}
                className="mt-1.5 w-full rounded-xl border border-stone-200 px-4 py-3 sm:py-2 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
              <p className="mt-1.5 text-xs sm:text-[10px] text-stone-400 leading-relaxed">
                You don&apos;t need to use your real name. Leave blank to stay anonymous.
              </p>
            </div>

            <div className="mt-5">
              <label className="text-xs uppercase tracking-wider text-stone-400 font-semibold">
                Tell us about your experience <span className="font-normal lowercase tracking-normal text-stone-300">(optional)</span>
              </label>
              <textarea
                value={feedback}
                onChange={(e) => setFeedback(e.target.value.slice(0, 2000))}
                placeholder="What did we do well? Anything we can improve?"
                rows={4}
                className="mt-1.5 w-full rounded-xl border border-stone-200 px-4 py-3 sm:py-2 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none"
              />
              <p className="mt-1 text-[10px] text-stone-300 text-right">
                {feedback.length}/2000
              </p>
            </div>

            <div className="mt-5">
              <p className="text-xs uppercase tracking-wider text-stone-400 font-semibold mb-2">
                Would you recommend us?
              </p>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { v: true, label: "Yes" },
                  { v: false, label: "No" },
                ].map((opt) => (
                  <button
                    key={String(opt.v)}
                    type="button"
                    onClick={() => setWouldRecommend(opt.v)}
                    className={`px-3 py-3 sm:py-2 rounded-xl text-base sm:text-sm font-semibold border transition-colors active:scale-[0.98] cursor-pointer ${
                      wouldRecommend === opt.v
                        ? "bg-teal-600 text-white border-teal-600"
                        : "bg-white text-stone-700 border-stone-200 hover:border-stone-300"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {submitError && (
              <p className="mt-4 text-sm sm:text-xs text-red-600 text-center">{submitError}</p>
            )}

            <button
              onClick={submit}
              disabled={submitting || rating < 1}
              className="mt-6 w-full px-4 py-3.5 sm:py-3 rounded-xl bg-gradient-to-r from-teal-600 via-emerald-600 to-cyan-600 text-white text-base sm:text-sm font-semibold shadow-lg shadow-teal-500/20 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.99] cursor-pointer"
            >
              {submitting ? "Submitting…" : "Submit review"}
            </button>
          </>
        )}

        {state === "ALREADY_SUBMITTED" && (
          <ThankYouBlock
            title="Thank you for your feedback"
            body="We really appreciate you taking the time to share your experience."
          />
        )}

        {(state === "OUTSIDE_WINDOW" || state === "ERROR") && (
          <ThankYouBlock
            title="Thank you for your payment"
            body={`We appreciate you choosing ${clinicName}.`}
          />
        )}
      </div>
    </main>
  );
}

const RATING_LABELS = ["Poor", "Fair", "Good", "Great", "Excellent"];

function ThankYouBlock({ title, body }: { title: string; body: string }) {
  return (
    <>
      <h1 className="mt-4 text-xl sm:text-2xl font-bold text-stone-900 text-center">{title}</h1>
      <p className="mt-2 text-sm sm:text-base text-stone-500 text-center leading-relaxed">{body}</p>
    </>
  );
}

function Star({ filled }: { filled: boolean }) {
  // Generous, proportional to the new full-screen layout: 44px mobile,
  // 56px tablet+.
  return (
    <svg viewBox="0 0 24 24" className="w-11 h-11 sm:w-14 sm:h-14" fill={filled ? "#f59e0b" : "none"} stroke={filled ? "#f59e0b" : "#d6d3d1"} strokeWidth="1.6">
      <path strokeLinejoin="round" strokeLinecap="round" d="M12 2l2.95 6.6 7.05.85-5.2 4.85 1.4 7.05L12 18l-6.2 3.35 1.4-7.05L2 9.45l7.05-.85L12 2z" />
    </svg>
  );
}

function Heart() {
  return (
    <svg viewBox="0 0 24 24" width={28} height={28} fill="white" stroke="white" strokeWidth="0">
      <path d="M12 21s-7-4.55-9.33-9.13C1.34 8.66 3.27 5 6.74 5c2.05 0 3.5 1.08 4.4 2.32C12.06 6.08 13.5 5 15.55 5 19.02 5 20.95 8.66 19.61 11.87 17.28 16.45 12 21 12 21z" />
    </svg>
  );
}

function Spinner() {
  return (
    <svg viewBox="0 0 24 24" className="w-6 h-6 animate-spin text-teal-600" fill="none" stroke="currentColor" strokeWidth="3">
      <path strokeLinecap="round" d="M21 12a9 9 0 11-9-9" />
    </svg>
  );
}

