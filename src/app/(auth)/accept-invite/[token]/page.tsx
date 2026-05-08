"use client";

/**
 * /accept-invite/[token] — patient invite redemption.
 *
 * Public page (no session required). Validates the invite via
 * GET /api/patient-invites/[token], then collects an email + new
 * password and POSTs to /accept. On success, redirects to /login
 * with the email prefilled.
 *
 * Token is the plaintext base64url string the admin handed to the
 * patient out-of-band (SMS / email / WhatsApp). The server hashes
 * it and matches against `patient_invites.tokenHash`.
 */
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Sparkles, AlertCircle, CheckCircle2, Loader2, Eye, EyeOff,
} from "lucide-react";

interface InviteShape {
  patient: { firstName: string; lastName: string };
  expiresAt: string;
}

export default function AcceptInvitePage() {
  const router = useRouter();
  const params = useParams<{ token: string }>();
  const token = params?.token as string | undefined;

  const [invite, setInvite] = useState<InviteShape | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/patient-invites/${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((d) => {
        if (!d.success) { setLoadError(d.error || "Invalid invite"); return; }
        setInvite(d.data as InviteShape);
      })
      .catch((e) => setLoadError(e instanceof Error ? e.message : "Network error"))
      .finally(() => setLoading(false));
  }, [token]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    if (!token) return;
    if (password.length < 8) {
      setSubmitError("Password must be at least 8 characters");
      return;
    }
    if (password !== confirm) {
      setSubmitError("Passwords don't match");
      return;
    }
    setSubmitting(true);
    try {
      const r = await fetch(`/api/patient-invites/${encodeURIComponent(token)}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, email: email.trim() || undefined }),
      });
      const d = await r.json();
      if (!d.success) { setSubmitError(d.error || "Failed to redeem"); return; }
      setDone(true);
      // Auto-redirect to login after a short delay so the user can
      // see the success state.
      setTimeout(() => router.push(`/login?email=${encodeURIComponent(d.data.email)}`), 1800);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Network error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-500 via-cyan-600 to-sky-700 flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-6 sm:p-8">
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-teal-50 text-teal-700 rounded-full text-xs font-semibold">
            <Sparkles className="w-3 h-3" /> Patient portal
          </div>
          <h1 className="text-2xl font-bold text-stone-900 mt-3">Set up your account</h1>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-10 text-stone-500">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Checking your invite…
          </div>
        ) : loadError || !invite ? (
          <div className="text-center py-6">
            <div className="w-12 h-12 mx-auto rounded-2xl bg-red-50 flex items-center justify-center mb-3">
              <AlertCircle className="w-6 h-6 text-red-600" />
            </div>
            <p className="text-sm font-semibold text-stone-900">This invite isn&apos;t valid.</p>
            <p className="text-xs text-stone-500 mt-1">{loadError || "It may have been revoked, expired, or already used."}</p>
            <p className="text-xs text-stone-400 mt-4">
              Need a new invite? Contact the clinic and ask them to issue a fresh link.
            </p>
            <Link href="/login" className="inline-block mt-4 text-sm text-teal-600 font-medium">Sign in instead →</Link>
          </div>
        ) : done ? (
          <div className="text-center py-6">
            <div className="w-12 h-12 mx-auto rounded-2xl bg-emerald-50 flex items-center justify-center mb-3">
              <CheckCircle2 className="w-6 h-6 text-emerald-600" />
            </div>
            <p className="text-sm font-semibold text-stone-900">Account created.</p>
            <p className="text-xs text-stone-500 mt-1">Taking you to sign in…</p>
          </div>
        ) : (
          <>
            <p className="text-sm text-stone-600 mb-4">
              Hi <span className="font-semibold text-stone-900">{invite.patient.firstName}</span> — set a password
              to access your records, appointments, and prescriptions.
            </p>
            <p className="text-[11px] text-stone-400 mb-6">
              Invite expires {new Date(invite.expiresAt).toLocaleString()}.
            </p>

            {submitError && (
              <div className="flex items-start gap-2 p-3 mb-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /> {submitError}
              </div>
            )}

            <form onSubmit={submit} className="space-y-4">
              <div>
                <label className="text-xs font-medium text-stone-600 mb-1 block">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="(use the email on file, or leave blank to use the clinic's)"
                  className="w-full px-3 py-2 text-sm bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
                <p className="text-[10px] text-stone-400 mt-1">If your patient record already has an email on file, you can leave this blank.</p>
              </div>
              <div>
                <label className="text-xs font-medium text-stone-600 mb-1 block">New password</label>
                <div className="relative">
                  <input
                    type={showPwd ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 8 characters"
                    minLength={8}
                    required
                    className="w-full px-3 py-2 pr-10 text-sm bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPwd((s) => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600"
                    tabIndex={-1}
                  >
                    {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-stone-600 mb-1 block">Confirm password</label>
                <input
                  type={showPwd ? "text" : "password"}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="Re-enter the same password"
                  minLength={8}
                  required
                  className="w-full px-3 py-2 text-sm bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3 bg-teal-600 text-white rounded-xl font-semibold hover:bg-teal-700 transition-colors disabled:opacity-50 inline-flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Creating account…
                  </>
                ) : (
                  "Create account"
                )}
              </button>
            </form>

            <p className="text-center text-xs text-stone-400 mt-6">
              Already set up? <Link href="/login" className="text-teal-600 font-medium">Sign in</Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
