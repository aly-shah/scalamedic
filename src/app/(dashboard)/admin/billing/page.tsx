"use client";

/**
 * /admin/billing — current plan tier + feature comparison matrix.
 *
 * Reads from /api/admin/billing (which already returns the full
 * cross-plan matrix). SUPER_ADMIN gets a "switch plan" affordance
 * for testing; in production this would be driven by a billing
 * provider webhook.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft, CreditCard, CheckCircle2, X, Loader2, AlertCircle, Sparkles,
} from "lucide-react";
import { Card, Badge, Button } from "@/components/ui";
import { useAuth } from "@/lib/auth-context";

type Plan = "FREE" | "PRO" | "ENTERPRISE";
interface MatrixRow {
  plan: Plan;
  label: string;
  tagline: string;
  tone: string;
  features: string[];
  limits: { maxBranches: number | null; maxStaff: number | null; aiCallsPerMonth: number | null };
}
interface Payload {
  tenantId: string;
  tenantName: string;
  plan: Plan;
  rawPlan: Plan;
  planValidUntil: string | null;
  matrix: MatrixRow[];
  labels: Record<string, string>;
}

const PLAN_TONE: Record<Plan, string> = {
  FREE: "border-stone-200 bg-stone-50",
  PRO: "border-teal-300 bg-teal-50",
  ENTERPRISE: "border-violet-300 bg-violet-50",
};
const PLAN_BADGE: Record<Plan, "default" | "primary" | "purple"> = {
  FREE: "default",
  PRO: "primary",
  ENTERPRISE: "purple",
};

export default function BillingPage() {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === "SUPER_ADMIN";
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/admin/billing", { credentials: "include" });
      const d = await r.json();
      if (!d.success) { setErr(d.error || "Failed"); return; }
      setData(d.data); setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const switchPlan = async (next: Plan) => {
    if (!isSuperAdmin) return;
    if (!confirm(`Switch tenant to ${next}? This affects every staff member's available features.`)) return;
    setSaving(true);
    try {
      const r = await fetch("/api/admin/billing", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: next }),
      });
      const d = await r.json();
      if (!d.success) { alert(d.error || "Failed"); return; }
      load();
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 text-teal-600 animate-spin" />
      </div>
    );
  }
  if (err || !data) {
    return (
      <Card padding="md" className="border-l-4 border-l-red-400 bg-red-50 text-red-800 text-sm">
        <AlertCircle className="w-4 h-4 inline mr-2" /> {err || "No data"}
      </Card>
    );
  }

  // Union of all features so each row in the matrix shows ✓/✕ per
  // plan. Order = ENTERPRISE features (the longest list) so the
  // table top-aligns the most expressive plan.
  const allFeatures = [...new Set(data.matrix.flatMap((m) => m.features))];

  return (
    <div className="space-y-5">
      <div>
        <Link href="/dashboard" className="text-xs text-stone-500 hover:text-teal-600 inline-flex items-center gap-1">
          <ArrowLeft className="w-3 h-3" /> Dashboard
        </Link>
        <h1 className="text-2xl font-bold text-stone-900 mt-1 flex items-center gap-2">
          <CreditCard className="w-5 h-5 text-teal-600" /> Billing & Plan
        </h1>
        <p className="text-sm text-stone-500">
          {data.tenantName} is currently on <span className="font-semibold">{data.plan}</span>
          {data.planValidUntil && (
            <span className="text-stone-400"> · expires {new Date(data.planValidUntil).toLocaleDateString()}</span>
          )}.
        </p>
      </div>

      {/* Current-plan banner */}
      <Card padding="md" className={`border-l-4 ${PLAN_TONE[data.plan]}`}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <Badge variant={PLAN_BADGE[data.plan]} className="text-[10px] uppercase">{data.plan}</Badge>
            <p className="text-sm font-semibold text-stone-900 mt-1.5">
              {data.matrix.find((m) => m.plan === data.plan)?.tagline}
            </p>
          </div>
          {data.rawPlan !== data.plan && (
            <p className="text-xs text-amber-700 inline-flex items-center gap-1">
              <Sparkles className="w-3 h-3" /> Plan expired — degraded to FREE until renewed.
            </p>
          )}
        </div>
      </Card>

      {/* Comparison matrix */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {data.matrix.map((row) => {
          const active = row.plan === data.plan;
          return (
            <Card key={row.plan} padding="md" className={active ? `${PLAN_TONE[row.plan]} border-2` : ""}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <Badge variant={PLAN_BADGE[row.plan]} className="text-[10px] uppercase">{row.label}</Badge>
                  <p className="text-xs text-stone-500 mt-1.5 max-w-[200px]">{row.tagline}</p>
                </div>
                {active && <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />}
              </div>
              <ul className="mt-3 space-y-1">
                {allFeatures.map((f) => {
                  const has = row.features.includes(f);
                  return (
                    <li key={f} className="flex items-center gap-1.5 text-[12px]">
                      {has
                        ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        : <X className="w-3.5 h-3.5 text-stone-300 shrink-0" />}
                      <span className={has ? "text-stone-700" : "text-stone-400 line-through"}>
                        {data.labels[f] ?? f}
                      </span>
                    </li>
                  );
                })}
              </ul>
              <div className="mt-3 pt-3 border-t border-stone-100 text-[11px] text-stone-500 space-y-0.5">
                <p>Branches: <span className="font-mono text-stone-700">{row.limits.maxBranches ?? "∞"}</span></p>
                <p>Staff: <span className="font-mono text-stone-700">{row.limits.maxStaff ?? "∞"}</span></p>
                <p>AI calls / mo: <span className="font-mono text-stone-700">{row.limits.aiCallsPerMonth?.toLocaleString() ?? "∞"}</span></p>
              </div>
              {isSuperAdmin && !active && (
                <Button
                  variant="outline"
                  className="w-full mt-3"
                  disabled={saving}
                  onClick={() => switchPlan(row.plan)}
                >
                  Switch to {row.label}
                </Button>
              )}
            </Card>
          );
        })}
      </div>

      {!isSuperAdmin && (
        <p className="text-xs text-stone-400 italic">
          Plan changes are super-admin only. Contact ScalaMedic billing to upgrade.
        </p>
      )}
    </div>
  );
}
