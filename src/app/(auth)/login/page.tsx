"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff, Sparkles, AlertCircle, ShieldCheck, ArrowLeft } from "lucide-react";
import { useAuth } from "@/lib/auth-context";

interface TenantBrand {
  name: string;
  shortName: string | null;
  legalName: string | null;
  logoUrl: string | null;
  isDemo?: boolean;
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPageInner />
    </Suspense>
  );
}

function LoginPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login, verifyMfa } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  // Prefill email from `?email=` (used by the patient invite-redeem
  // flow which redirects here on success).
  const [form, setForm] = useState({ email: searchParams?.get("email") ?? "", password: "" });

  // Tenant brand — pre-auth fetch (public endpoint). Hero uses
  // logoUrl + name; mobile-only top-bar uses shortName + name.
  // Falls back to platform-style placeholders if the fetch fails.
  const [tenant, setTenant] = useState<TenantBrand | null>(null);
  useEffect(() => {
    fetch("/api/tenant/current")
      .then((r) => r.json())
      .then((d) => { if (d.success && d.data) setTenant(d.data as TenantBrand); })
      .catch(() => {});
  }, []);
  const brandName  = tenant?.name      || "ScalaMedic";
  const brandShort = tenant?.shortName || tenant?.name || "ScalaMedic";
  const brandLogo  = tenant?.logoUrl   || null;

  // MFA second-factor state. When the password step returns a
  // challenge token we swap the form view to a 6-digit code input.
  // Cancel returns to the password form (same email retained).
  const [mfa, setMfa] = useState<{ challengeToken: string; email: string } | null>(null);
  const [mfaCode, setMfaCode] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const result = await login(form.email, form.password);

    if (result.success && result.mfaRequired && result.challengeToken) {
      setMfa({ challengeToken: result.challengeToken, email: result.email || form.email });
      setLoading(false);
      return;
    }

    if (result.success) {
      router.push("/dashboard");
    } else {
      setError(result.error || "Login failed");
      setLoading(false);
    }
  };

  const handleMfaSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mfa) return;
    setError("");
    setLoading(true);
    const result = await verifyMfa(mfa.challengeToken, mfaCode.trim());
    if (result.success) {
      router.push("/dashboard");
    } else {
      setError(result.error || "Verification failed");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex" data-id="AUTH-LOGIN">
      {/* Left hero */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-gradient-to-br from-teal-500 via-teal-600 to-emerald-600">
        <div className="absolute inset-0">
          <div className="absolute top-[-10%] right-[-10%] w-[500px] h-[500px] bg-white/10 rounded-full blur-3xl" />
          <div className="absolute bottom-[-10%] left-[-5%] w-[400px] h-[400px] bg-emerald-400/20 rounded-full blur-3xl" />
        </div>
        <div className="relative z-10 flex flex-col justify-between p-12 text-white w-full">
          <div className="flex items-center gap-3">
            {brandLogo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={brandLogo} alt={brandName} className="h-10 w-auto bg-white/95 rounded-xl p-1.5 object-contain" />
            ) : (
              <div className="w-10 h-10 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center">
                <span className="text-lg font-bold">{brandShort.charAt(0).toUpperCase()}</span>
              </div>
            )}
            <span className="text-xl font-bold">{brandName}</span>
          </div>
          <div className="max-w-md">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-white/10 backdrop-blur-sm rounded-full text-sm mb-6">
              <Sparkles className="w-4 h-4" />
              <span>AI-Powered Clinic Workspace</span>
            </div>
            <h1 className="text-4xl font-bold leading-tight mb-4">Your skin clinic,<br />beautifully managed.</h1>
            <p className="text-lg text-white/80 leading-relaxed">A focused workspace for {brandName}. Less clutter, more care.</p>
          </div>
          <div className="flex gap-8">
            {[{ value: "2min", label: "Avg check-in time" }, { value: "98%", label: "Staff satisfaction" }, { value: "1-click", label: "Key actions" }].map((s) => (
              <div key={s.label}><p className="text-2xl font-bold">{s.value}</p><p className="text-sm text-white/60">{s.label}</p></div>
            ))}
          </div>
        </div>
      </div>

      {/* Right form */}
      <div className="flex-1 flex items-center justify-center px-6 lg:px-16 bg-white">
        <div className="w-full max-w-sm">
          <div className="lg:hidden flex items-center gap-2.5 mb-10">
            {brandLogo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={brandLogo} alt={brandName} className="h-10 w-auto rounded-xl p-1 object-contain" />
            ) : (
              <div className="w-10 h-10 gradient-warm rounded-xl flex items-center justify-center shadow-sm">
                <span className="text-lg font-bold text-white">{brandShort.charAt(0).toUpperCase()}</span>
              </div>
            )}
            <span className="text-xl font-bold text-stone-900">{brandShort}</span>
          </div>

          {mfa ? (
            <>
              <h2 className="text-2xl font-bold text-stone-900 mb-1 flex items-center gap-2">
                <ShieldCheck className="w-6 h-6 text-teal-600" /> Two-factor code
              </h2>
              <p className="text-stone-500 mb-8">
                Enter the 6-digit code from your authenticator app for{" "}
                <span className="font-medium text-stone-700">{mfa.email}</span>.
              </p>

              {error && (
                <div className="flex items-center gap-2 p-3 mb-5 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {error}
                </div>
              )}

              <form onSubmit={handleMfaSubmit} className="space-y-5">
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-stone-700">Verification code</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    autoFocus
                    placeholder="123 456"
                    value={mfaCode}
                    onChange={(e) => setMfaCode(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))}
                    className="w-full px-4 py-3 text-center text-xl tracking-[0.5em] font-mono bg-stone-50 border border-stone-200 rounded-xl text-stone-900 placeholder:text-stone-300 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 focus:bg-white transition-all"
                    required
                    minLength={6}
                    maxLength={6}
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading || mfaCode.length !== 6}
                  className="w-full py-3 bg-teal-600 text-white rounded-xl font-medium hover:bg-teal-700 transition-all disabled:opacity-50 cursor-pointer shadow-sm shadow-teal-200 active:scale-[0.98]"
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Verifying…
                    </span>
                  ) : "Verify"}
                </button>
                <button
                  type="button"
                  onClick={() => { setMfa(null); setMfaCode(""); setError(""); }}
                  className="w-full inline-flex items-center justify-center gap-1.5 text-sm text-stone-500 hover:text-stone-800 cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" /> Use a different account
                </button>
              </form>
            </>
          ) : (
            <>
              <h2 className="text-2xl font-bold text-stone-900 mb-1">Welcome back</h2>
              <p className="text-stone-500 mb-8">Sign in to your clinic workspace</p>

              {error && (
                <div className="flex items-center gap-2 p-3 mb-5 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-stone-700">Email</label>
                  <input type="email" placeholder="you@clinic.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="w-full px-4 py-3 text-sm bg-stone-50 border border-stone-200 rounded-xl text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 focus:bg-white transition-all" required />
                </div>
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-stone-700">Password</label>
                  </div>
                  <div className="relative">
                    <input type={showPassword ? "text" : "password"} placeholder="Enter your password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}
                      className="w-full px-4 py-3 pr-11 text-sm bg-stone-50 border border-stone-200 rounded-xl text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 focus:bg-white transition-all" required minLength={4} />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 cursor-pointer">
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <button type="submit" disabled={loading}
                  className="w-full py-3 bg-teal-600 text-white rounded-xl font-medium hover:bg-teal-700 transition-all disabled:opacity-50 cursor-pointer shadow-sm shadow-teal-200 active:scale-[0.98]">
                  {loading ? <span className="flex items-center justify-center gap-2"><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Signing in...</span> : "Sign in"}
                </button>
              </form>

              {tenant?.isDemo && (
                <div className="mt-6 p-4 rounded-xl border border-amber-200 bg-amber-50/70">
                  <p className="text-xs font-medium text-amber-900 mb-2 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5" /> Demo workspace
                  </p>
                  <p className="text-xs text-amber-800/90 mb-3">
                    Try the product with fictional sample data. The demo dataset resets on demand.
                  </p>
                  <button
                    type="button"
                    disabled={loading}
                    onClick={async () => {
                      setError("");
                      setLoading(true);
                      const result = await login("admin@demo.scalamedic.com", "demo1234");
                      if (result.success && !result.mfaRequired) {
                        router.push("/dashboard");
                      } else {
                        setError(result.error || "Demo sign-in failed. Try resetting the demo first.");
                        setLoading(false);
                      }
                    }}
                    className="w-full py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 disabled:opacity-50 cursor-pointer"
                  >
                    Try the demo as admin
                  </button>
                </div>
              )}

              <p className="text-center text-sm text-stone-500 mt-8">
                New to MediCore? <Link href="/signup" className="text-teal-600 font-medium hover:text-teal-700">Create an account</Link>
              </p>
              <p className="text-center text-xs text-stone-400 mt-2">
                Setting up a new clinic? <Link href="/get-started" className="text-violet-600 font-medium hover:text-violet-700">Create a workspace</Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
