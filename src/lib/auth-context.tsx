"use client";

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  branchId: string;
  branchName?: string;
}

// Public-safe tenant view exposed by /api/auth/me. Matches the
// TenantBrand shape from lib/tenant.ts so the React shell can
// render the clinic logo, name, footer line, AND its current plan
// tier without a second round-trip.
export type TenantPlan = "FREE" | "PRO" | "ENTERPRISE";
export interface TenantBrand {
  id: string;
  slug: string;
  name: string;
  legalName: string | null;
  shortName: string | null;
  logoUrl: string | null;
  faviconUrl: string | null;
  mfaIssuer: string | null;
  poweredByLine: string | null;
  primaryColor: string | null;
  plan: TenantPlan;
  planValidUntil: string | null;
}

interface LoginResult {
  success: boolean;
  error?: string;
  // When the user has MFA enabled, the password step succeeds but
  // doesn't issue a session — instead we get a challenge token that
  // the second-factor input exchanges for the real session.
  mfaRequired?: boolean;
  challengeToken?: string;
  email?: string;
}

interface AuthContextType {
  user: User | null;
  // Tenant brand attached to the current session. Null until the
  // first /me resolves; consumers should fall back to platform
  // defaults if they need to render before this hydrates.
  tenant: TenantBrand | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<LoginResult>;
  // Second-factor exchange: trades the MFA challenge token for a
  // session cookie. Same shape as login() return.
  verifyMfa: (challengeToken: string, code: string) => Promise<LoginResult>;
  signup: (name: string, email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  tenant: null,
  loading: true,
  login: async () => ({ success: false }),
  verifyMfa: async () => ({ success: false }),
  signup: async () => ({ success: false }),
  logout: async () => {},
  refreshUser: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [tenant, setTenant] = useState<TenantBrand | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me");
      if (res.ok) {
        const data = await res.json();
        // /api/auth/me now returns { data: { user, tenant } }.
        // The auth-context hydrates both — consumers read
        // useAuth().user and useAuth().tenant.
        setUser(data.data?.user ?? null);
        setTenant(data.data?.tenant ?? null);
      } else {
        setUser(null);
        setTenant(null);
      }
    } catch {
      setUser(null);
      setTenant(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  const login = async (email: string, password: string): Promise<LoginResult> => {
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!data.success) {
        return { success: false, error: data.error };
      }
      // MFA-enabled accounts: the password step succeeded but the
      // server didn't issue a session. Surface the challenge token
      // so the UI can prompt for the 6-digit code.
      if (data.data?.mfaRequired) {
        return {
          success: true,
          mfaRequired: true,
          challengeToken: data.data.challengeToken,
          email: data.data.email,
        };
      }
      // Plain (non-MFA) login: session cookie is set, user landed.
      setUser(data.data.user);
      // Re-fetch /me to hydrate tenant alongside the user (login
      // response only carries user; /me returns both).
      refreshUser();
      return { success: true };
    } catch {
      return { success: false, error: "Network error" };
    }
  };

  const verifyMfa = async (challengeToken: string, code: string): Promise<LoginResult> => {
    try {
      const res = await fetch("/api/auth/login/mfa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challengeToken, code }),
      });
      const data = await res.json();
      if (!data.success) {
        return { success: false, error: data.error };
      }
      setUser(data.data.user);
      refreshUser();
      return { success: true };
    } catch {
      return { success: false, error: "Network error" };
    }
  };

  const signup = async (name: string, email: string, password: string) => {
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });
      const data = await res.json();
      if (data.success) {
        setUser(data.data.user);
        refreshUser();
        return { success: true };
      }
      return { success: false, error: data.error };
    } catch {
      return { success: false, error: "Network error" };
    }
  };

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, tenant, loading, login, verifyMfa, signup, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);

// ─── Client-side feature gate ─────────────────────────────────
// Mirror of server-side requireFeature() so UI elements can hide
// when the tenant's plan doesn't include the feature. Server is
// always authoritative; this is purely cosmetic (avoids showing
// buttons the user can't use).
type Feature =
  | "PATIENTS" | "APPOINTMENTS" | "BILLING" | "PHARMACY"
  | "AI_TRANSCRIPTION" | "AI_BRIEFING" | "PROCEDURE_PROTOCOLS"
  | "COLLABORATION" | "WHATSAPP" | "DOCTOR_REVENUE"
  | "VITALS_TRENDS" | "TIMELINE"
  | "AI_AMBIENT_SCRIBE" | "MULTI_BRANCH" | "AUDIT_EXPORT"
  | "CUSTOM_BRANDING" | "AI_AUDIT_DASHBOARD" | "ERROR_LOG_READER";

const FEATURES_BY_PLAN: Record<TenantPlan, Set<Feature>> = {
  FREE: new Set(["PATIENTS", "APPOINTMENTS", "BILLING", "PHARMACY"] as Feature[]),
  PRO: new Set([
    "PATIENTS", "APPOINTMENTS", "BILLING", "PHARMACY",
    "AI_TRANSCRIPTION", "AI_BRIEFING", "PROCEDURE_PROTOCOLS",
    "COLLABORATION", "WHATSAPP", "DOCTOR_REVENUE",
    "VITALS_TRENDS", "TIMELINE",
  ] as Feature[]),
  ENTERPRISE: new Set([
    "PATIENTS", "APPOINTMENTS", "BILLING", "PHARMACY",
    "AI_TRANSCRIPTION", "AI_BRIEFING", "PROCEDURE_PROTOCOLS",
    "COLLABORATION", "WHATSAPP", "DOCTOR_REVENUE",
    "VITALS_TRENDS", "TIMELINE",
    "AI_AMBIENT_SCRIBE", "MULTI_BRANCH", "AUDIT_EXPORT",
    "CUSTOM_BRANDING", "AI_AUDIT_DASHBOARD", "ERROR_LOG_READER",
  ] as Feature[]),
};

/** Returns true when the current tenant's plan includes `feature`.
 *  Defaults to true if tenant hasn't loaded yet — better to flash
 *  a feature briefly than to flash an upgrade prompt over what
 *  should be there. */
export function useFeature(feature: Feature): boolean {
  const { tenant } = useAuth();
  if (!tenant) return true;
  return FEATURES_BY_PLAN[tenant.plan]?.has(feature) ?? false;
}
