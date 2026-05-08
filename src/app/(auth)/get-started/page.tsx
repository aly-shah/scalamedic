"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Sparkles, AlertCircle, ArrowRight, Building2, User as UserIcon, Globe } from "lucide-react";

interface FormState {
  // Step 1
  tenantName: string;
  slug: string;
  hostname: string;
  // Step 2
  adminName: string;
  adminEmail: string;
  adminPassword: string;
  // Step 3
  branchName: string;
  branchAddress: string;
  branchPhone: string;
  // Optional
  inviteToken: string;
}

const EMPTY: FormState = {
  tenantName: "", slug: "", hostname: "",
  adminName: "", adminEmail: "", adminPassword: "",
  branchName: "", branchAddress: "", branchPhone: "",
  inviteToken: "",
};

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 60);
}

export default function GetStartedPage() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Live-update slug from tenant name as long as user hasn't manually
  // edited it. Once they touch the slug field, stop overwriting.
  const [slugDirty, setSlugDirty] = useState(false);
  function setTenantName(v: string) {
    setForm((f) => ({ ...f, tenantName: v, slug: slugDirty ? f.slug : slugify(v) }));
  }

  function nextStep() {
    setError("");
    if (step === 1) {
      if (!form.tenantName.trim()) return setError("Clinic name is required");
      if (!form.slug.match(/^[a-z0-9](?:[a-z0-9-]{0,58}[a-z0-9])?$/)) {
        return setError("Slug must be 3-60 chars, lowercase letters/numbers/hyphens only.");
      }
      setStep(2);
      return;
    }
    if (step === 2) {
      if (!form.adminName.trim()) return setError("Your name is required");
      if (!form.adminEmail.match(/^[^@]+@[^@]+\.[^@]+$/)) return setError("Valid email required");
      if (form.adminPassword.length < 8) return setError("Password must be at least 8 characters");
      setStep(3);
      return;
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/tenant/onboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantName: form.tenantName,
          slug: form.slug,
          hostname: form.hostname || null,
          adminName: form.adminName,
          adminEmail: form.adminEmail,
          adminPassword: form.adminPassword,
          branchName: form.branchName || undefined,
          branchAddress: form.branchAddress || undefined,
          branchPhone: form.branchPhone || undefined,
          inviteToken: form.inviteToken || undefined,
        }),
      });
      const d = await res.json();
      if (!d.success) {
        setError(d.error || "Failed to create workspace");
        setLoading(false);
        return;
      }
      router.push("/dashboard");
    } catch {
      setError("Network error");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex" data-id="AUTH-GET-STARTED">
      {/* Left hero */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-gradient-to-br from-violet-500 via-violet-600 to-fuchsia-600">
        <div className="absolute inset-0">
          <div className="absolute top-[-10%] right-[-10%] w-[500px] h-[500px] bg-white/10 rounded-full blur-3xl" />
          <div className="absolute bottom-[-10%] left-[-5%] w-[400px] h-[400px] bg-fuchsia-400/20 rounded-full blur-3xl" />
        </div>
        <div className="relative z-10 flex flex-col justify-between p-12 text-white w-full">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center">
              <Sparkles className="w-5 h-5" />
            </div>
            <span className="text-xl font-bold">ScalaMedic</span>
          </div>
          <div className="max-w-md">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-white/10 backdrop-blur-sm rounded-full text-sm mb-6">
              <Sparkles className="w-4 h-4" />
              <span>Stand up your clinic in minutes</span>
            </div>
            <h1 className="text-4xl font-bold leading-tight mb-4">A new workspace,<br />ready to see patients.</h1>
            <p className="text-lg text-white/80 leading-relaxed">
              Create your tenant, your admin account, and your first branch. The full clinical workspace — patients, scheduling, billing, prescriptions — is set up before you finish your coffee.
            </p>
          </div>
          <div className="flex gap-8">
            <div><p className="text-2xl font-bold">3 steps</p><p className="text-sm text-white/60">Clinic, admin, branch</p></div>
            <div><p className="text-2xl font-bold">FREE</p><p className="text-sm text-white/60">To start</p></div>
            <div><p className="text-2xl font-bold">No CC</p><p className="text-sm text-white/60">Required</p></div>
          </div>
        </div>
      </div>

      {/* Right form */}
      <div className="flex-1 flex items-center justify-center px-6 lg:px-16 bg-white">
        <div className="w-full max-w-md">
          {/* Progress */}
          <div className="flex items-center gap-2 mb-8">
            {[1, 2, 3].map((n) => (
              <div key={n} className="flex-1 h-1.5 rounded-full bg-stone-100 overflow-hidden">
                <div className={"h-full transition-all " + (step >= n ? "bg-violet-600" : "bg-transparent") } style={{ width: step >= n ? "100%" : "0%" }} />
              </div>
            ))}
          </div>

          {error && (
            <div className="flex items-start gap-2 p-3 mb-5 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            {step === 1 && (
              <>
                <h2 className="text-2xl font-bold text-stone-900 mb-1 flex items-center gap-2">
                  <Building2 className="w-6 h-6 text-violet-600" /> Your clinic
                </h2>
                <p className="text-stone-500 mb-6">What should we call your workspace?</p>

                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-stone-700">Clinic name</label>
                  <input value={form.tenantName} onChange={(e) => setTenantName(e.target.value)}
                    placeholder="e.g. Bright Skin Aesthetics"
                    className="w-full px-4 py-3 text-sm bg-stone-50 border border-stone-200 rounded-xl text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 focus:bg-white transition-all"
                    required maxLength={150} autoFocus />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-stone-700">URL slug</label>
                  <div className="flex items-center gap-2 px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus-within:ring-2 focus-within:ring-violet-500/20 focus-within:border-violet-500 focus-within:bg-white transition-all">
                    <span className="text-sm text-stone-400">scalamedic.com/t/</span>
                    <input value={form.slug} onChange={(e) => { setSlugDirty(true); setForm({ ...form, slug: slugify(e.target.value) }); }}
                      placeholder="bright-skin"
                      className="flex-1 bg-transparent outline-none text-sm text-stone-900 placeholder:text-stone-400" required minLength={3} maxLength={60} />
                  </div>
                  <p className="text-xs text-stone-500">Lowercase letters, numbers, hyphens. 3-60 characters.</p>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-stone-700 flex items-center gap-1.5">
                    <Globe className="w-3.5 h-3.5" /> Custom hostname <span className="text-stone-400 font-normal">(optional)</span>
                  </label>
                  <input value={form.hostname} onChange={(e) => setForm({ ...form, hostname: e.target.value.toLowerCase() })}
                    placeholder="clinic.yourdomain.com"
                    className="w-full px-4 py-3 text-sm bg-stone-50 border border-stone-200 rounded-xl text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 focus:bg-white transition-all"
                    maxLength={120} />
                  <p className="text-xs text-stone-500">Skip this if you don&apos;t have a domain set up yet — you can add it later in settings.</p>
                </div>
              </>
            )}

            {step === 2 && (
              <>
                <h2 className="text-2xl font-bold text-stone-900 mb-1 flex items-center gap-2">
                  <UserIcon className="w-6 h-6 text-violet-600" /> Your admin account
                </h2>
                <p className="text-stone-500 mb-6">You&apos;ll be the first admin on this workspace.</p>

                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-stone-700">Your name</label>
                  <input value={form.adminName} onChange={(e) => setForm({ ...form, adminName: e.target.value })}
                    placeholder="Dr. Jane Doe"
                    className="w-full px-4 py-3 text-sm bg-stone-50 border border-stone-200 rounded-xl text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 focus:bg-white transition-all"
                    required maxLength={200} autoFocus />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-stone-700">Email</label>
                  <input type="email" value={form.adminEmail} onChange={(e) => setForm({ ...form, adminEmail: e.target.value })}
                    placeholder="you@clinic.com"
                    className="w-full px-4 py-3 text-sm bg-stone-50 border border-stone-200 rounded-xl text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 focus:bg-white transition-all"
                    required maxLength={200} />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-stone-700">Password</label>
                  <div className="relative">
                    <input type={showPassword ? "text" : "password"} value={form.adminPassword} onChange={(e) => setForm({ ...form, adminPassword: e.target.value })}
                      placeholder="At least 8 characters"
                      className="w-full px-4 py-3 pr-11 text-sm bg-stone-50 border border-stone-200 rounded-xl text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 focus:bg-white transition-all"
                      required minLength={8} maxLength={128} />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 cursor-pointer">
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </>
            )}

            {step === 3 && (
              <>
                <h2 className="text-2xl font-bold text-stone-900 mb-1 flex items-center gap-2">
                  <Building2 className="w-6 h-6 text-violet-600" /> Your first branch
                </h2>
                <p className="text-stone-500 mb-6">All optional — you can fill these in later from settings.</p>

                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-stone-700">Branch name</label>
                  <input value={form.branchName} onChange={(e) => setForm({ ...form, branchName: e.target.value })}
                    placeholder="Main Clinic"
                    className="w-full px-4 py-3 text-sm bg-stone-50 border border-stone-200 rounded-xl text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 focus:bg-white transition-all"
                    maxLength={120} />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-stone-700">Address</label>
                  <input value={form.branchAddress} onChange={(e) => setForm({ ...form, branchAddress: e.target.value })}
                    placeholder="Street, City"
                    className="w-full px-4 py-3 text-sm bg-stone-50 border border-stone-200 rounded-xl text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 focus:bg-white transition-all"
                    maxLength={400} />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-stone-700">Phone</label>
                  <input value={form.branchPhone} onChange={(e) => setForm({ ...form, branchPhone: e.target.value })}
                    placeholder="+92 300 0000000"
                    className="w-full px-4 py-3 text-sm bg-stone-50 border border-stone-200 rounded-xl text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 focus:bg-white transition-all"
                    maxLength={32} />
                </div>

                {/* Invite token only renders when there's a value already
                    typed — keeps the form clean for open-signup deployments
                    while still letting gated deployments paste a code in. */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-stone-700">Invite code <span className="text-stone-400 font-normal">(if you have one)</span></label>
                  <input value={form.inviteToken} onChange={(e) => setForm({ ...form, inviteToken: e.target.value })}
                    placeholder=""
                    className="w-full px-4 py-3 text-sm bg-stone-50 border border-stone-200 rounded-xl text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 focus:bg-white transition-all"
                    maxLength={200} />
                </div>
              </>
            )}

            <div className="flex items-center gap-2 pt-2">
              {step > 1 && (
                <button type="button" onClick={() => { setError(""); setStep((s) => (s - 1) as 1 | 2 | 3); }}
                  className="py-3 px-4 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-xl font-medium transition-all cursor-pointer">
                  Back
                </button>
              )}
              {step < 3 ? (
                <button type="button" onClick={nextStep}
                  className="flex-1 py-3 bg-violet-600 text-white rounded-xl font-medium hover:bg-violet-700 transition-all cursor-pointer shadow-sm shadow-violet-200 active:scale-[0.98] inline-flex items-center justify-center gap-2">
                  Continue <ArrowRight className="w-4 h-4" />
                </button>
              ) : (
                <button type="submit" disabled={loading}
                  className="flex-1 py-3 bg-violet-600 text-white rounded-xl font-medium hover:bg-violet-700 transition-all disabled:opacity-50 cursor-pointer shadow-sm shadow-violet-200 active:scale-[0.98]">
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Creating workspace…
                    </span>
                  ) : "Create workspace"}
                </button>
              )}
            </div>
          </form>

          <p className="text-center text-sm text-stone-500 mt-8">
            Already have a workspace? <Link href="/login" className="text-violet-600 font-medium hover:text-violet-700">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
