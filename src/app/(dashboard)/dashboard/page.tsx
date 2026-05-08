"use client";

import { lazy, Suspense } from "react";
import { useAuth } from "@/lib/auth-context";
import { LoadingSpinner } from "@/components/ui/loading";
import { useModuleAccess } from "@/modules/core/hooks";
import { useModuleContext } from "@/modules/core/provider";

// Lazy-load role dashboards — only the active role's bundle is downloaded
const AdminDashboard = lazy(() => import("@/components/dashboard/admin-dashboard").then((m) => ({ default: m.AdminDashboard })));
const DoctorDashboard = lazy(() => import("@/components/dashboard/doctor-dashboard").then((m) => ({ default: m.DoctorDashboard })));
const ReceptionistDashboard = lazy(() => import("@/components/dashboard/receptionist-dashboard").then((m) => ({ default: m.ReceptionistDashboard })));
const BillingDashboard = lazy(() => import("@/components/dashboard/billing-dashboard").then((m) => ({ default: m.BillingDashboard })));
const CallCenterDashboard = lazy(() => import("@/components/dashboard/callcenter-dashboard").then((m) => ({ default: m.CallCenterDashboard })));
const AssistantDashboard = lazy(() => import("@/components/dashboard/assistant-dashboard").then((m) => ({ default: m.AssistantDashboard })));

const dashboardMap: Record<string, React.LazyExoticComponent<React.ComponentType>> = {
  SUPER_ADMIN: AdminDashboard,
  ADMIN: AdminDashboard,
  DOCTOR: DoctorDashboard,
  RECEPTIONIST: ReceptionistDashboard,
  BILLING: BillingDashboard,
  CALL_CENTER: CallCenterDashboard,
  ASSISTANT: AssistantDashboard,
  // Aesthetician shares the doctor dashboard — both work the patient
  // schedule + procedures surface. Operator gets the assistant view
  // — they need room status + the queue, not clinical write access.
  AESTHETICIAN: DoctorDashboard,
  OPERATOR: AssistantDashboard,
};

export default function DashboardPage() {
  const { user, loading } = useAuth();
  const { ready } = useModuleContext();
  const access = useModuleAccess("MOD-DASHBOARD");

  if (loading || !ready) {
    return <div className="flex items-center justify-center py-20"><LoadingSpinner size="lg" /></div>;
  }

  if (!access.canView) {
    return <div className="flex items-center justify-center py-20 text-stone-500">You don&apos;t have access to the dashboard.</div>;
  }

  const Dashboard = dashboardMap[user?.role || "ADMIN"] || AdminDashboard;
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20"><LoadingSpinner size="lg" /></div>}>
      <Dashboard />
    </Suspense>
  );
}
