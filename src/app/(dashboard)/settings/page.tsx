"use client";

/**
 * /settings — per-user account page (NOT clinic-wide settings).
 *
 * Clinic-wide settings (tax rate, working hours, billing prefixes,
 * etc) live at /admin/settings — this page is just "my account".
 * The user used to land here expecting clinic settings; now there's
 * a clear breadcrumb pointing to /admin/settings for admins, and
 * the page itself only shows what's actually editable per-user:
 *
 *   - Profile (read-only): name, email, role, branch — admins edit
 *     a user's profile via /admin/users, not here. Read-only sets
 *     the right expectation instead of fake save buttons.
 *   - Security (functional): change password — already worked, kept
 *     as the primary action.
 *
 * Dropped the old fake notification-toggle / theme-picker / "save
 * profile" surfaces. Per-user prefs aren't backed by anything yet
 * and showing decorative checkboxes that don't persist made the
 * whole page feel like a mockup.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import QRCode from "qrcode";
import {
  UserCircle, Shield, Loader2, ArrowRight, AlertCircle,
  CheckCircle2, Lock, Briefcase, Mail, Phone, Building2,
  ShieldCheck, KeyRound, Copy,
} from "lucide-react";
import { Button, Card, Input, Badge } from "@/components/ui";
import { LoadingSpinner } from "@/components/ui/loading";
import { useAuth } from "@/lib/auth-context";
import { api } from "@/lib/api";

const ROLE_LABEL: Record<string, string> = {
  SUPER_ADMIN: "Super Admin",
  ADMIN: "Admin",
  DOCTOR: "Doctor",
  RECEPTIONIST: "Receptionist",
  BILLING: "Billing",
  CALL_CENTER: "Call Center",
  ASSISTANT: "Assistant",
  AESTHETICIAN: "Aesthetician",
  OPERATOR: "Operator",
};

export default function MyAccountPage() {
  const { user, loading } = useAuth();
  const isAdmin = user?.role === "SUPER_ADMIN" || user?.role === "ADMIN";

  if (loading) {
    return <div className="flex items-center justify-center py-20"><LoadingSpinner size="lg" /></div>;
  }
  if (!user) {
    return (
      <div className="flex items-center justify-center py-20 text-stone-500">
        Sign in to view your account.
      </div>
    );
  }

  return (
    <div className="space-y-5 sm:space-y-6 animate-fade-in" data-id="USER-SETTINGS">
      {/* ===== HERO ===== */}
      <div className="relative overflow-hidden rounded-2xl border border-stone-100 bg-gradient-to-br from-teal-600 via-cyan-600 to-sky-600 px-5 py-5 sm:px-7 sm:py-6 text-white">
        <div className="pointer-events-none absolute inset-0 opacity-25 [background:radial-gradient(circle_at_30%_30%,#fff_0,transparent_45%)]" />
        <div className="relative flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-[11px] uppercase tracking-wider font-semibold opacity-90">My Account</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-semibold leading-tight flex items-center gap-2">
              <UserCircle className="w-5 h-5" /> {user.name}
            </h1>
            <p className="text-sm opacity-90 mt-1 max-w-xl">
              Your profile + password. Everything else lives in the admin area.
            </p>
          </div>
          {isAdmin && (
            <Link
              href="/admin/settings"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-white text-teal-700 hover:bg-stone-50 cursor-pointer"
            >
              <ShieldCheck className="w-3.5 h-3.5" /> System settings <ArrowRight className="w-3 h-3" />
            </Link>
          )}
        </div>
      </div>

      {/* ===== INFO BANNER (non-admins) ===== */}
      {!isAdmin && (
        <div className="flex items-start gap-3 p-3.5 rounded-xl bg-amber-50 border border-amber-100">
          <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
          <div className="text-sm text-amber-800">
            <p>Looking for clinic-wide settings (tax, working hours, etc)? Those are admin-only — ask your admin to update them under <span className="font-medium">/admin/settings</span>.</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5">
        {/* ===== PROFILE (read-only) ===== */}
        <Card padding="lg">
          <div className="mb-4">
            <h2 className="text-base font-semibold text-stone-900">Profile</h2>
            <p className="text-xs text-stone-500 mt-0.5">
              Read-only here — admins update profiles from{" "}
              <Link href="/admin/users" className="text-teal-600 hover:text-teal-700 underline-offset-2 hover:underline">/admin/users</Link>.
            </p>
          </div>
          <div className="space-y-3">
            <ProfileRow icon={<UserCircle className="w-4 h-4" />} label="Full name" value={user.name} />
            <ProfileRow icon={<Mail className="w-4 h-4" />} label="Email" value={user.email} mono />
            <ProfileRow
              icon={<Briefcase className="w-4 h-4" />}
              label="Role"
              value={
                <Badge variant={isAdmin ? "primary" : "default"}>
                  {ROLE_LABEL[user.role] || user.role}
                </Badge>
              }
            />
            <ProfileRow icon={<Building2 className="w-4 h-4" />} label="Branch" value={user.branchName || "—"} />
            <ProfileRow icon={<Phone className="w-4 h-4" />} label="User ID" value={user.id.slice(0, 8) + "…"} mono />
          </div>
        </Card>

        {/* ===== SECURITY (functional) ===== */}
        <Card padding="lg">
          <div className="mb-4">
            <h2 className="text-base font-semibold text-stone-900 flex items-center gap-2">
              <Shield className="w-4 h-4 text-stone-400" /> Security
            </h2>
            <p className="text-xs text-stone-500 mt-0.5">
              Change your password. New password must be at least 8 characters and different from the current one.
            </p>
          </div>
          <SecurityForm />
        </Card>
      </div>

      {/* ===== TWO-FACTOR (full-width) ===== */}
      <Card padding="lg">
        <div className="mb-4 flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-base font-semibold text-stone-900 flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-stone-400" /> Two-factor authentication
            </h2>
            <p className="text-xs text-stone-500 mt-0.5 max-w-prose">
              Add a 6-digit time-based code on top of your password. Required for clinics handling sensitive
              clinical data. Works with Google Authenticator, Authy, 1Password, Microsoft Authenticator.
            </p>
          </div>
        </div>
        <MfaPanel />
      </Card>
    </div>
  );
}

function ProfileRow({
  icon, label, value, mono,
}: { icon: React.ReactNode; label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-center gap-3 py-2 border-b border-stone-50 last:border-b-0">
      <div className="w-8 h-8 rounded-lg bg-stone-50 text-stone-400 flex items-center justify-center shrink-0">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] uppercase tracking-wider font-medium text-stone-400">{label}</p>
        <div className={`mt-0.5 text-sm ${mono ? "font-mono" : "font-medium"} text-stone-900 truncate`}>
          {value}
        </div>
      </div>
    </div>
  );
}

function MfaPanel() {
  // Status load — null until first GET resolves so we don't flash
  // an enable button at a user who's already enrolled.
  const [status, setStatus] = useState<{ enabled: boolean; enrolledAt: string | null } | null>(null);
  // When the user clicks Enable: enrollment payload from /enroll.
  // Holding it here means cancelling discards the staged secret —
  // because the secret only lives in the enrollment JWT, no DB
  // cleanup is needed.
  const [enroll, setEnroll] = useState<null | {
    secret: string; otpauthUrl: string; enrollmentToken: string; qrDataUrl: string;
  }>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  // For Disable.
  const [disablePwd, setDisablePwd] = useState("");
  const [disableOpen, setDisableOpen] = useState(false);

  const refresh = async () => {
    try {
      const res = await fetch("/api/auth/mfa/status", { credentials: "include" });
      const d = await res.json();
      if (d.success) setStatus({ enabled: !!d.data.mfaEnabled, enrolledAt: d.data.mfaEnrolledAt });
    } catch { /* silent — show loading state */ }
  };

  useEffect(() => { refresh(); }, []);

  const startEnroll = async () => {
    setBusy(true); setError(null); setOk(null);
    try {
      const res = await fetch("/api/auth/mfa/enroll", { method: "POST", credentials: "include" });
      const d = await res.json();
      if (!d.success) { setError(d.error || "Could not start enrollment"); return; }
      // Render the QR client-side so the otpauth:// URI (which
      // contains the secret) never leaves the browser.
      const qrDataUrl = await QRCode.toDataURL(d.data.otpauthUrl, { margin: 1, width: 220 });
      setEnroll({ ...d.data, qrDataUrl });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally { setBusy(false); }
  };

  const verifyEnroll = async () => {
    if (!enroll || code.length !== 6) return;
    setBusy(true); setError(null); setOk(null);
    try {
      const res = await fetch("/api/auth/mfa/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ enrollmentToken: enroll.enrollmentToken, code }),
      });
      const d = await res.json();
      if (!d.success) { setError(d.error || "Verification failed"); return; }
      setEnroll(null); setCode("");
      setOk("Two-factor authentication enabled.");
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally { setBusy(false); }
  };

  const disable = async () => {
    if (!disablePwd) { setError("Enter your password"); return; }
    setBusy(true); setError(null); setOk(null);
    try {
      const res = await fetch("/api/auth/mfa/disable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ password: disablePwd }),
      });
      const d = await res.json();
      if (!d.success) { setError(d.error || "Could not disable"); return; }
      setDisablePwd(""); setDisableOpen(false);
      setOk("Two-factor authentication disabled.");
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally { setBusy(false); }
  };

  if (status === null) {
    return <div className="flex items-center gap-2 text-sm text-stone-400"><Loader2 className="w-4 h-4 animate-spin" /> Loading status…</div>;
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="px-3 py-2 rounded-xl bg-red-50 border border-red-100 text-sm text-red-700 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /> {error}
        </div>
      )}
      {ok && (
        <div className="px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-100 text-sm text-emerald-800 flex items-start gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" /> {ok}
        </div>
      )}

      {/* Enabled state ── show status + disable affordance */}
      {status.enabled && !enroll && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-emerald-50 border border-emerald-100">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-200 flex items-center justify-center text-emerald-700">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <div>
                <p className="text-sm font-semibold text-emerald-900">Two-factor is on</p>
                <p className="text-[11px] text-emerald-700">
                  {status.enrolledAt ? `Enrolled ${new Date(status.enrolledAt).toLocaleDateString()}` : "Active"}
                </p>
              </div>
            </div>
            {!disableOpen ? (
              <Button variant="outline" onClick={() => setDisableOpen(true)} disabled={busy}>Disable</Button>
            ) : null}
          </div>
          {disableOpen && (
            <div className="p-3 rounded-xl border border-stone-200 space-y-2">
              <p className="text-xs text-stone-600">Confirm your password to disable two-factor.</p>
              <Input
                type="password"
                placeholder="Current password"
                value={disablePwd}
                onChange={(e) => setDisablePwd(e.target.value)}
              />
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => { setDisableOpen(false); setDisablePwd(""); setError(null); }}>Cancel</Button>
                <Button onClick={disable} disabled={busy} iconLeft={busy ? <Loader2 className="w-4 h-4 animate-spin" /> : undefined}>
                  {busy ? "Disabling…" : "Disable two-factor"}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Disabled state — initial CTA */}
      {!status.enabled && !enroll && (
        <div className="flex items-start justify-between gap-4 p-4 rounded-xl border border-amber-200 bg-amber-50">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-amber-200 flex items-center justify-center text-amber-700">
              <Shield className="w-4 h-4" />
            </div>
            <div>
              <p className="text-sm font-semibold text-amber-900">Two-factor is off</p>
              <p className="text-[11px] text-amber-800 max-w-prose">
                We strongly recommend enabling it on accounts that can read patient data or write prescriptions.
              </p>
            </div>
          </div>
          <Button onClick={startEnroll} disabled={busy} iconLeft={busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}>
            {busy ? "Starting…" : "Enable two-factor"}
          </Button>
        </div>
      )}

      {/* Enrollment in progress — QR + secret + code input */}
      {enroll && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 rounded-xl border border-stone-200 bg-stone-50">
          <div className="space-y-3">
            <p className="text-sm font-semibold text-stone-900">Step 1 — scan in your authenticator</p>
            <div className="bg-white rounded-xl border border-stone-200 p-3 inline-block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={enroll.qrDataUrl} alt="MFA QR code" width={220} height={220} />
            </div>
            <div className="text-xs text-stone-500 space-y-1">
              <p className="font-medium text-stone-700">Or enter this code manually:</p>
              <div className="flex items-center gap-2">
                <code className="px-2 py-1 bg-white border border-stone-200 rounded font-mono text-[11px] tracking-widest text-stone-700 break-all">
                  {enroll.secret}
                </code>
                <button
                  onClick={() => navigator.clipboard.writeText(enroll.secret)}
                  className="p-1.5 rounded-lg hover:bg-stone-100 text-stone-500 cursor-pointer"
                  title="Copy"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
              </div>
              <p>Issuer: <span className="font-medium">ScalaMedic</span></p>
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-sm font-semibold text-stone-900">Step 2 — enter the 6-digit code</p>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              placeholder="123 456"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))}
              className="w-full px-4 py-3 text-center text-xl tracking-[0.5em] font-mono bg-white border border-stone-200 rounded-xl text-stone-900 placeholder:text-stone-300 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
              maxLength={6}
            />
            <p className="text-[11px] text-stone-500">
              Once you enter a valid code, two-factor will be enabled. You&apos;ll be asked for a code on every
              future login.
            </p>
            <div className="flex items-center justify-end gap-2 pt-1">
              <Button variant="ghost" onClick={() => { setEnroll(null); setCode(""); setError(null); }}>Cancel</Button>
              <Button
                onClick={verifyEnroll}
                disabled={busy || code.length !== 6}
                iconLeft={busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              >
                {busy ? "Verifying…" : "Verify & enable"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SecurityForm() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  async function submit() {
    setError(null);
    setOk(false);
    if (!currentPassword) return setError("Enter your current password.");
    if (newPassword.length < 8) return setError("New password must be at least 8 characters.");
    if (newPassword !== confirm) return setError("New password and confirmation don't match.");
    if (newPassword === currentPassword) return setError("New password must differ from current.");

    setSubmitting(true);
    try {
      await api.account.changePassword(currentPassword, newPassword);
      setOk(true);
      setCurrentPassword(""); setNewPassword(""); setConfirm("");
      // Auto-clear the success banner after a moment so the form
      // doesn't keep boasting about an old change.
      setTimeout(() => setOk(false), 3500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to change password.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="px-3 py-2 rounded-xl bg-red-50 border border-red-100 text-sm text-red-700 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /> {error}
        </div>
      )}
      {ok && (
        <div className="px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-100 text-sm text-emerald-800 flex items-start gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" /> Password updated.
        </div>
      )}
      <Input
        label="Current password"
        type="password"
        placeholder="Enter your current password"
        value={currentPassword}
        onChange={(e) => setCurrentPassword(e.target.value)}
      />
      <Input
        label="New password"
        type="password"
        placeholder="At least 8 characters"
        value={newPassword}
        onChange={(e) => setNewPassword(e.target.value)}
      />
      <Input
        label="Confirm new password"
        type="password"
        placeholder="Re-enter the new password"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
      />
      <div className="flex justify-end pt-1">
        <Button
          onClick={submit}
          disabled={submitting}
          iconLeft={submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
        >
          {submitting ? "Updating…" : "Update password"}
        </Button>
      </div>
    </div>
  );
}

