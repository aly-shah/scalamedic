"use client";

/**
 * System Settings — admin tab
 *
 * Previously most fields were decorative — `defaultValue` inputs and
 * static `checked={true}` checkboxes with no save handler. The hero's
 * "Save Changes" button did nothing. The only thing that actually
 * persisted was the three Billing inputs.
 *
 * Rewritten so every field reads from + writes to /api/settings via a
 * single generic `useSetting` hook. Each field auto-saves on blur (or
 * on toggle for checkboxes) with a status chip — no global Save
 * Changes button to lie about. The same flat key/value/group store
 * already exists; we just stop ignoring it.
 *
 * Layout: vertical sidebar nav on lg+ (sticky-ish so the active
 * section stays visible while scrolling settings), pill chips on
 * narrower screens. Same five sections as before but each one is
 * actually wired now.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useModuleAccess } from "@/modules/core/hooks";
import {
  Bell, CreditCard, CalendarDays, Clock, Play, Loader2, ArrowLeft,
  SlidersHorizontal, Building2, Check, AlertCircle,
} from "lucide-react";
import { Card, Input, Checkbox, Select } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/ui/loading";
import { cn } from "@/lib/utils";
import { WhatsAppConnectionCard } from "@/components/whatsapp/whatsapp-connection-card";

// ─────────────────────────────────────────────────────────────────
// Settings store hook — fetches the whole settings table once and
// caches in-memory. Each useSetting() call gets a slice keyed by
// (group, key) and an auto-saving setter.
// ─────────────────────────────────────────────────────────────────

type SettingType = "string" | "number" | "boolean" | "json";
type Status = "idle" | "saving" | "saved" | "error";

interface SettingRow {
  key: string;
  value: string;
  group: string;
  label?: string;
  type?: SettingType;
}

// Module-level cache so the sidebar nav, the active section, and any
// subscriber on the page all see the same values without each one
// re-fetching. Refilled by SettingsProvider on mount.
const settingsCache: Record<string, SettingRow> = {};
const subscribers = new Set<() => void>();
function notifySubscribers() { for (const s of subscribers) s(); }

function useAllSettings() {
  // Tiny store-like hook: re-renders when settingsCache changes.
  const [, force] = useState(0);
  useEffect(() => {
    const s = () => force((n) => n + 1);
    subscribers.add(s);
    return () => { subscribers.delete(s); };
  }, []);
  return settingsCache;
}

function useSetting<T extends string | number | boolean>(
  group: string,
  key: string,
  defaultValue: T,
  type: SettingType = typeof defaultValue === "number" ? "number" : typeof defaultValue === "boolean" ? "boolean" : "string",
) {
  useAllSettings(); // subscribe to cache updates
  const raw = settingsCache[key]?.value;
  const value = useMemo<T>(() => {
    if (raw == null) return defaultValue;
    if (type === "number") return Number(raw) as T;
    if (type === "boolean") return (raw === "true") as T;
    return raw as T;
  }, [raw, type, defaultValue]);

  const [status, setStatus] = useState<Status>("idle");
  const statusTimer = useRef<NodeJS.Timeout | null>(null);

  const save = useCallback(async (next: T, label?: string) => {
    setStatus("saving");
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key,
          value: typeof next === "boolean" ? String(next) : String(next),
          group,
          label: label || key,
          type,
        }),
      });
      const d = await res.json();
      if (!d.success) throw new Error(d.error || "Save failed");
      // Update cache so other subscribers see the new value
      settingsCache[key] = {
        key, value: String(next), group, label: label || key, type,
      };
      notifySubscribers();
      setStatus("saved");
    } catch {
      setStatus("error");
    } finally {
      if (statusTimer.current) clearTimeout(statusTimer.current);
      statusTimer.current = setTimeout(() => setStatus("idle"), 1800);
    }
  }, [key, group, type]);

  return { value, save, status };
}

// One-shot fetch on mount that fills the cache. Returns loading state
// for the initial render. Re-uses cache on subsequent mounts so tab
// switches don't re-fetch.
function useLoadSettings() {
  const [loaded, setLoaded] = useState(Object.keys(settingsCache).length > 0);
  useEffect(() => {
    if (loaded) return;
    fetch("/api/settings", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        if (!d.success) return;
        for (const s of d.data as SettingRow[]) settingsCache[s.key] = s;
        notifySubscribers();
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return loaded;
}

// ─────────────────────────────────────────────────────────────────
// Generic field components — each wires through useSetting and shows
// a save-status chip beside the input. No global Save button.
// ─────────────────────────────────────────────────────────────────

function StatusChip({ status }: { status: Status }) {
  return (
    <span className={cn(
      "inline-flex items-center gap-1 text-[11px] font-medium transition-opacity",
      status === "idle" ? "opacity-0" : "opacity-100",
      status === "saving" ? "text-stone-400" :
      status === "saved" ? "text-emerald-600" :
      status === "error" ? "text-red-600" : "text-stone-400",
    )}>
      {status === "saving" && <Loader2 className="w-3 h-3 animate-spin" />}
      {status === "saved" && <Check className="w-3 h-3" />}
      {status === "error" && <AlertCircle className="w-3 h-3" />}
      {status === "saving" ? "Saving…" : status === "saved" ? "Saved" : status === "error" ? "Save failed" : ""}
    </span>
  );
}

function TextSetting({
  group, sKey, label, type = "string", helperText,
}: {
  group: string; sKey: string; label: string;
  type?: "string" | "number" | "time"; helperText?: string;
}) {
  const settingType: SettingType = type === "number" ? "number" : "string";
  const defaultVal: string | number = type === "number" ? 0 : "";
  const { value, save, status } = useSetting(group, sKey, defaultVal as string | number, settingType);
  const [local, setLocal] = useState<string>(String(value ?? ""));
  // Sync local when the cache value changes (initial load).
  useEffect(() => { setLocal(String(value ?? "")); }, [value]);
  const initialRef = useRef<string>(String(value ?? ""));
  useEffect(() => { initialRef.current = String(value ?? ""); }, [value]);

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-sm font-medium text-stone-700">{label}</label>
        <StatusChip status={status} />
      </div>
      <Input
        type={type === "time" ? "time" : type === "number" ? "number" : "text"}
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={() => {
          if (local !== initialRef.current) {
            initialRef.current = local;
            save(type === "number" ? Number(local) : local, label);
          }
        }}
      />
      {helperText && <p className="text-[11px] text-stone-400 mt-1">{helperText}</p>}
    </div>
  );
}

function ToggleSetting({
  group, sKey, label, helperText,
}: { group: string; sKey: string; label: string; helperText?: string }) {
  const { value, save, status } = useSetting<boolean>(group, sKey, false);
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0 flex-1">
        <Checkbox checked={value} onChange={(v) => save(v, label)} label={label} />
        {helperText && <p className="text-[11px] text-stone-400 mt-0.5 ml-7">{helperText}</p>}
      </div>
      <StatusChip status={status} />
    </div>
  );
}

function SelectSetting({
  group, sKey, label, options, defaultValue,
}: {
  group: string; sKey: string; label: string;
  options: { value: string; label: string }[]; defaultValue: string;
}) {
  const { value, save, status } = useSetting(group, sKey, defaultValue, "string");
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-sm font-medium text-stone-700">{label}</label>
        <StatusChip status={status} />
      </div>
      <Select
        value={value}
        onChange={(e) => save(e.target.value, label)}
        options={options}
      />
    </div>
  );
}

// Working-days pill row — stored as a JSON array of day codes.
function WorkingDaysSetting({ group, sKey }: { group: string; sKey: string }) {
  const { value, save, status } = useSetting<string>(group, sKey, "Mon,Tue,Wed,Thu,Fri,Sat", "string");
  const set = useMemo(() => new Set(value.split(",").map((d) => d.trim()).filter(Boolean)), [value]);
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  function toggle(day: string) {
    const next = new Set(set);
    if (next.has(day)) next.delete(day); else next.add(day);
    save(days.filter((d) => next.has(d)).join(","), "Working Days");
  }
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="text-sm font-medium text-stone-700">Working days</label>
        <StatusChip status={status} />
      </div>
      <div className="flex flex-wrap gap-2">
        {days.map((d) => {
          const on = set.has(d);
          return (
            <button
              key={d}
              type="button"
              onClick={() => toggle(d)}
              className={cn(
                "w-10 h-10 rounded-xl text-sm font-medium transition-colors cursor-pointer",
                on ? "bg-teal-500 text-white shadow-sm" : "bg-stone-100 text-stone-400 hover:bg-stone-200",
              )}
            >
              {d}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Section nav metadata
// ─────────────────────────────────────────────────────────────────

interface SectionMeta {
  value: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}

const SECTIONS: SectionMeta[] = [
  { value: "general",       label: "Clinic profile", description: "Name, contact, address",    icon: Building2 },
  { value: "notifications", label: "Notifications",  description: "Email + SMS triggers",      icon: Bell },
  { value: "billing",       label: "Billing",        description: "Tax, invoice format, methods", icon: CreditCard },
  { value: "appointments",  label: "Appointments",   description: "Slot length, working hours",icon: CalendarDays },
  { value: "reminders",     label: "Reminders",      description: "Auto-notifications + cron", icon: Clock },
];

// ─────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────

export default function AdminSettingsPage() {
  const access = useModuleAccess("MOD-BRANCH");
  const loaded = useLoadSettings();
  const [activeSection, setActiveSection] = useState("general");

  if (!access.canView) {
    return (
      <div className="flex items-center justify-center py-20 text-stone-500">
        You don&apos;t have access to this module.
      </div>
    );
  }

  return (
    <div className="space-y-5 sm:space-y-6 animate-fade-in" data-id="ADMIN-SETTINGS">
      {/* ===== HERO ===== */}
      <div className="relative overflow-hidden rounded-2xl border border-stone-100 bg-gradient-to-br from-slate-700 via-slate-800 to-stone-900 px-5 py-5 sm:px-7 sm:py-6 text-white">
        <div className="pointer-events-none absolute inset-0 opacity-25 [background:radial-gradient(circle_at_30%_30%,#fff_0,transparent_45%)]" />
        <div className="relative flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <Link href="/admin" className="inline-flex items-center gap-1 text-[11px] uppercase tracking-wider font-semibold opacity-90 hover:opacity-100">
                <ArrowLeft className="w-3 h-3" /> Admin
              </Link>
              <span className="opacity-60">/</span>
              <span className="text-[11px] uppercase tracking-wider font-semibold opacity-90">Settings</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-semibold leading-tight flex items-center gap-2">
              <SlidersHorizontal className="w-5 h-5" /> System settings
            </h1>
            <p className="text-sm opacity-90 mt-1 max-w-xl">
              Tax rates, invoice prefixes, reminder windows, and other clinic-wide defaults.
              Every change auto-saves — no Save button to remember.
            </p>
          </div>
        </div>
      </div>

      {!loaded ? (
        <div className="flex items-center justify-center py-20"><LoadingSpinner size="lg" /></div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-4 sm:gap-6">
          {/* ===== SECTION NAV ===== */}
          {/* Vertical card on lg+, horizontal pill scroll on smaller. */}
          <aside className="lg:sticky lg:top-20 lg:self-start">
            {/* Mobile: pill chips */}
            <div className="flex lg:hidden items-center gap-2 overflow-x-auto pb-1 -mb-1">
              {SECTIONS.map((s) => {
                const Icon = s.icon;
                const active = activeSection === s.value;
                return (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => setActiveSection(s.value)}
                    className={cn(
                      "shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-medium transition-colors cursor-pointer",
                      active ? "bg-slate-900 text-white shadow-sm" : "bg-stone-100 text-stone-600 hover:bg-stone-200",
                    )}
                  >
                    <Icon className="w-3.5 h-3.5" /> {s.label}
                  </button>
                );
              })}
            </div>

            {/* Desktop: vertical list with descriptions */}
            <div className="hidden lg:block bg-white rounded-2xl border border-stone-100 shadow-sm p-2">
              {SECTIONS.map((s) => {
                const Icon = s.icon;
                const active = activeSection === s.value;
                return (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => setActiveSection(s.value)}
                    className={cn(
                      "w-full text-left flex items-start gap-3 px-3 py-2.5 rounded-xl transition-colors cursor-pointer",
                      active ? "bg-slate-50" : "hover:bg-stone-50",
                    )}
                  >
                    <div className={cn(
                      "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors",
                      active ? "bg-slate-900 text-white" : "bg-stone-100 text-stone-500",
                    )}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <p className={cn("text-sm font-semibold", active ? "text-stone-900" : "text-stone-700")}>{s.label}</p>
                      <p className="text-[11px] text-stone-400 mt-0.5 truncate">{s.description}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </aside>

          {/* ===== ACTIVE SECTION ===== */}
          <div className="space-y-4 sm:space-y-5 min-w-0">
            {activeSection === "general"       && <GeneralSection />}
            {activeSection === "notifications" && <NotificationsSection />}
            {activeSection === "billing"       && <BillingSection />}
            {activeSection === "appointments"  && <AppointmentsSection />}
            {activeSection === "reminders"     && <RemindersSection />}
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Sections
// ─────────────────────────────────────────────────────────────────

function SectionCard({
  title, subtitle, children,
}: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <Card padding="lg" className="animate-fade-in">
      <div className="mb-4">
        <h2 className="text-base font-semibold text-stone-900">{title}</h2>
        {subtitle && <p className="text-xs text-stone-500 mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </Card>
  );
}

function GeneralSection() {
  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 sm:gap-5">
      <SectionCard title="Clinic information" subtitle="Shown on invoices, receipts, and the patient portal.">
        <div className="space-y-4">
          <TextSetting group="general" sKey="clinic_name"    label="Clinic name" />
          <TextSetting group="general" sKey="clinic_phone"   label="Phone" />
          <TextSetting group="general" sKey="clinic_email"   label="Email" />
          <TextSetting group="general" sKey="clinic_website" label="Website" />
        </div>
      </SectionCard>
      <SectionCard title="Address" subtitle="Used on receipts + the printed daily report header.">
        <div className="space-y-4">
          <TextSetting group="general" sKey="address_street"  label="Street address" />
          <TextSetting group="general" sKey="address_city"    label="City" />
          <TextSetting group="general" sKey="address_state"   label="State / province" />
          <TextSetting group="general" sKey="address_postcode" label="Postal code" />
        </div>
      </SectionCard>
    </div>
  );
}

function NotificationsSection() {
  return (
    <div className="space-y-4 sm:space-y-5">
      {/* WhatsApp connection lives at the top of Notifications since
          most outbound notifications route through it. */}
      <WhatsAppConnectionCard />
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 sm:gap-5">
      <SectionCard title="Email triggers" subtitle="Outbound notifications sent over email.">
        <div className="space-y-3">
          <ToggleSetting group="notifications" sKey="email_appointment_booked"    label="New appointment bookings" />
          <ToggleSetting group="notifications" sKey="email_appointment_cancelled" label="Appointment cancellations" />
          <ToggleSetting group="notifications" sKey="email_payment_received"      label="Payment received" />
          <ToggleSetting group="notifications" sKey="email_daily_summary"         label="Daily summary report"
            helperText="Sent every evening at the configured cron time." />
          <ToggleSetting group="notifications" sKey="email_patient_registered"    label="New patient registration" />
        </div>
      </SectionCard>
      <SectionCard title="SMS triggers" subtitle="Patient-facing SMS via the configured gateway.">
        <div className="space-y-3">
          <ToggleSetting group="notifications" sKey="sms_appointment_24h"  label="Appointment reminders (24h before)" />
          <ToggleSetting group="notifications" sKey="sms_appointment_1h"   label="Appointment reminders (1h before)" />
          <ToggleSetting group="notifications" sKey="sms_followup"         label="Follow-up reminders" />
          <ToggleSetting group="notifications" sKey="sms_birthday"         label="Birthday greetings" />
        </div>
      </SectionCard>
      </div>
    </div>
  );
}

function BillingSection() {
  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 sm:gap-5">
      <SectionCard title="Invoice defaults" subtitle="Applied to every new invoice unless overridden.">
        <div className="space-y-4">
          <TextSetting group="billing" sKey="tax_rate" label="Default tax rate (%)" type="number"
            helperText="Pre-fills the tax field on new invoices." />
          <TextSetting group="billing" sKey="invoice_prefix" label="Invoice number prefix"
            helperText="e.g. INV-2026 — auto-numbered after this prefix." />
          <TextSetting group="billing" sKey="payment_terms" label="Payment terms (days)" type="number"
            helperText="How many days a patient has to pay before an invoice is flagged overdue." />
        </div>
      </SectionCard>
      <SectionCard title="Accepted payment methods" subtitle="Toggles which methods reception sees in the payment dialog.">
        <div className="space-y-3">
          <ToggleSetting group="billing" sKey="method_cash"            label="Cash" />
          <ToggleSetting group="billing" sKey="method_card"            label="Credit / debit card" />
          <ToggleSetting group="billing" sKey="method_bank_transfer"   label="Bank transfer" />
          <ToggleSetting group="billing" sKey="method_digital_wallet"  label="Digital wallet" />
          <ToggleSetting group="billing" sKey="method_cheque"          label="Cheque" />
          <ToggleSetting group="billing" sKey="method_insurance"       label="Insurance" />
        </div>
      </SectionCard>
    </div>
  );
}

function AppointmentsSection() {
  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 sm:gap-5">
      <SectionCard title="Scheduling defaults" subtitle="Affect new appointments + the slot grid on the calendar.">
        <div className="space-y-4">
          <TextSetting group="appointments" sKey="slot_minutes"  label="Default slot duration (minutes)" type="number" />
          <TextSetting group="appointments" sKey="slot_buffer"   label="Buffer between appointments (minutes)" type="number"
            helperText="Padding added between back-to-back bookings." />
          <TextSetting group="appointments" sKey="advance_days"  label="Max advance booking (days)" type="number" />
        </div>
      </SectionCard>
      <SectionCard title="Working hours" subtitle="Applies to all branches unless a branch override exists.">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <TextSetting group="appointments" sKey="opens_at"  label="Opens at"  type="time" />
            <TextSetting group="appointments" sKey="closes_at" label="Closes at" type="time" />
          </div>
          <WorkingDaysSetting group="appointments" sKey="working_days" />
        </div>
      </SectionCard>
    </div>
  );
}

function RemindersSection() {
  // Manual cron trigger — kept as it was (already worked).
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);
  const handleRun = async () => {
    setRunning(true);
    setResult(null);
    try {
      const res = await fetch("/api/cron/reminders", { method: "POST" });
      const data = await res.json();
      setResult({
        success: res.ok,
        message: res.ok ? data.message || "Reminders processed." : data.error || "Failed to run reminders.",
      });
    } catch {
      setResult({ success: false, message: "Network error. Could not reach the server." });
    } finally {
      setRunning(false);
    }
  };

  return (
    <>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 sm:gap-5">
        <SectionCard title="Appointment reminders">
          <div className="space-y-4">
            <ToggleSetting group="reminders" sKey="appt_enabled" label="Enable appointment reminders" />
            <SelectSetting
              group="reminders" sKey="appt_lead_hours" label="Send reminder before appointment"
              defaultValue="24"
              options={[
                { value: "1", label: "1 hour before" },
                { value: "2", label: "2 hours before" },
                { value: "4", label: "4 hours before" },
                { value: "12", label: "12 hours before" },
                { value: "24", label: "24 hours before" },
              ]}
            />
          </div>
        </SectionCard>

        <SectionCard title="Follow-up reminders">
          <div className="space-y-4">
            <ToggleSetting group="reminders" sKey="followup_enabled" label="Auto-notify on overdue follow-ups" />
            <SelectSetting
              group="reminders" sKey="followup_lead_days" label="Notify when overdue by"
              defaultValue="3"
              options={[
                { value: "1", label: "1 day" },
                { value: "2", label: "2 days" },
                { value: "3", label: "3 days" },
                { value: "7", label: "7 days" },
              ]}
            />
          </div>
        </SectionCard>

        <SectionCard title="Package expiry">
          <div className="space-y-4">
            <ToggleSetting group="reminders" sKey="package_expiry_enabled" label="Alert when patient packages near expiry" />
            <SelectSetting
              group="reminders" sKey="package_expiry_lead_days" label="Alert before expiry"
              defaultValue="7"
              options={[
                { value: "3", label: "3 days before" },
                { value: "7", label: "7 days before" },
                { value: "14", label: "14 days before" },
                { value: "30", label: "30 days before" },
              ]}
            />
          </div>
        </SectionCard>

        <SectionCard title="Invoice reminders">
          <div className="space-y-4">
            <ToggleSetting group="reminders" sKey="invoice_auto_overdue"
              label="Auto-mark overdue invoices"
              helperText="Cron flips PENDING → OVERDUE once payment terms lapse." />
            <ToggleSetting group="reminders" sKey="invoice_past_due_alert"
              label="Alert reception when invoice goes past due" />
          </div>
        </SectionCard>
      </div>

      {/* Manual cron trigger */}
      <Card padding="lg" className="animate-fade-in">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-stone-900">Run reminders now</h2>
            <p className="text-xs text-stone-500 mt-0.5">
              Fires the same job the cron triggers — useful for testing or catching up after downtime.
            </p>
          </div>
          <Button
            onClick={handleRun}
            disabled={running}
            iconLeft={running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
          >
            {running ? "Running…" : "Run now"}
          </Button>
        </div>
        {result && (
          <div className={cn(
            "mt-4 px-4 py-3 rounded-xl text-sm border",
            result.success
              ? "bg-emerald-50 text-emerald-800 border-emerald-100"
              : "bg-red-50 text-red-700 border-red-100",
          )}>
            {result.message}
          </div>
        )}
      </Card>
    </>
  );
}
