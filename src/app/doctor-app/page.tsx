"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  Stethoscope, Calendar, Clock, Users, Search,
  ChevronRight, ArrowLeft, LogOut, CheckCircle,
  FileText, Pill,
  Phone, Activity, Play, Timer, RefreshCw,
  ClipboardList, Plus, Thermometer,
  AlertTriangle, Mic, Square, X, Sparkles,
  Camera, ImagePlus,
  FlaskConical, CalendarClock, Check, MessageSquare,
  Package,
} from "lucide-react";
import { getClinicToday, CLINIC_TZ } from "@/lib/utils";
import { checkRxGuards, type GuardWarning } from "@/lib/drug-guards";
import { computeQueueEta, formatEta, etaTone } from "@/lib/queue-eta";
import { Sparkline } from "@/components/ui/sparkline";

// ---- Types ----
type Screen = "home" | "schedule" | "patients" | "patient-detail" | "consultation" | "prescribe" | "voice-note" | "lab" | "follow-up" | "timeline" | "procedure" | "team";
type ToastKind = "success" | "error" | "info";
interface Toast { id: number; kind: ToastKind; text: string }

interface AllergyInfo { id: string; allergen: string; severity?: string; reaction?: string }
interface MedicationInfo { id: string; name: string; dosage?: string; frequency?: string; isActive?: boolean }

interface PatientInfo {
  id: string; firstName: string; lastName: string; patientCode: string;
  phone: string; email?: string; gender?: string; dateOfBirth?: string;
  bloodType?: string; profileImage?: string;
  allergies?: AllergyInfo[];
  medications?: MedicationInfo[];
  medicalHistory?: { conditions?: string[]; notes?: string } | null;
  assignedDoctor?: { name?: string } | null;
}

interface AppointmentInfo {
  id: string; date: string; startTime: string; endTime: string;
  status: string; type: string; workflowStage?: string;
  patientId: string; doctorId: string; notes?: string;
  checkInAt?: string; createdAt?: string;
  patient?: { firstName?: string; lastName?: string; patientCode?: string; phone?: string };
  doctor?: { name?: string };
}

interface VitalsInfo {
  temperature?: number; systolicBP?: number; diastolicBP?: number;
  heartRate?: number; weight?: number; height?: number;
  oxygenSaturation?: number; painLevel?: number;
  createdAt?: string;
}

interface NoteInfo {
  id: string; chiefComplaint?: string; diagnosis?: string;
  treatmentPlan?: string; isSigned?: boolean; createdAt?: string;
}

interface RxInfo {
  id: string; notes?: string; createdAt?: string;
  items?: Array<{ id: string; medicineName: string; dosage?: string; frequency?: string; duration?: string; route?: string }>;
  doctor?: { name?: string };
}

interface PhotoDoc {
  id: string; name: string; type: string;
  fileUrl: string; mimeType?: string; notes?: string;
  createdAt?: string;
  uploadedBy?: { id: string; name?: string };
}

// History records — all three feed the "Patient history" sections
// at the bottom of the patient-detail screen. Optional fields use
// the same liberal typing as NoteInfo et al — server may return more
// keys but the UI only reads these.
interface ProcedureInfo {
  id: string;
  performedAt?: string;
  notes?: string;
  outcome?: string;
  treatment?: { id: string; name: string };
  doctor?: { id: string; name: string };
}
interface LabResultRow {
  id: string;
  analyte: string;
  value: string;
  valueNumeric?: number | string | null;
  unit?: string | null;
  referenceLow?: number | string | null;
  referenceHigh?: number | string | null;
  referenceText?: string | null;
  isAbnormal?: boolean;
  flag?: string | null;
}
interface LabTestInfo {
  id: string;
  testName: string;
  testCode?: string | null;
  status?: string;
  priority?: string;
  notes?: string | null;
  createdAt?: string;
  completedAt?: string | null;
  doctor?: { id: string; name: string };
  resultRows?: LabResultRow[];
}
interface SkinHistoryInfo {
  id: string;
  condition: string;
  affectedArea: string;
  severity?: string;
  notes?: string;
  treatmentHistory?: string;
  createdAt?: string;
}

type PhotoKind = "before" | "after";
function photoKind(name?: string): PhotoKind | "other" {
  if (!name) return "other";
  const n = name.toUpperCase();
  if (n.startsWith("BEFORE")) return "before";
  if (n.startsWith("AFTER")) return "after";
  return "other";
}

// Dermatology lab presets
const LAB_PRESETS: Array<{ name: string; code?: string; note?: string }> = [
  { name: "Skin biopsy", code: "BIOPSY", note: "Punch/excisional as indicated" },
  { name: "KOH mount", code: "KOH", note: "Fungal microscopy" },
  { name: "Patch test", code: "PATCH", note: "Standard series allergens" },
  { name: "Wood's lamp exam", code: "WOOD" },
  { name: "Dermatoscopy", code: "DERM" },
  { name: "CBC", code: "CBC" },
  { name: "LFT", code: "LFT", note: "Pre-isotretinoin baseline" },
  { name: "Lipid profile", code: "LIPID" },
  { name: "TSH / T3 / T4", code: "TSH" },
  { name: "ANA", code: "ANA" },
  { name: "Pregnancy test (β-hCG)", code: "HCG", note: "Pre-isotretinoin" },
  { name: "HIV / HBsAg / HCV", code: "VIRAL" },
];

const FOLLOWUP_PRESETS = [
  { label: "1 week", days: 7 },
  { label: "2 weeks", days: 14 },
  { label: "1 month", days: 30 },
  { label: "6 weeks", days: 42 },
  { label: "3 months", days: 90 },
];

// ---- API helper ----
async function api<T = unknown>(path: string, opts?: RequestInit): Promise<{ success: boolean; data?: T; error?: string }> {
  try {
    const res = await fetch(path, { credentials: "include", ...opts });
    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("application/json")) {
      return { success: false, error: `Server error ${res.status}` };
    }
    return await res.json();
  } catch {
    return { success: false, error: "Network error" };
  }
}
const apiPost = (p: string, d: Record<string, unknown>) =>
  api(p, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(d) });
const apiPut = (p: string, d: Record<string, unknown>) =>
  api(p, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(d) });

// ---- Helpers ----
function aptPatientName(a: AppointmentInfo): string {
  return a.patient ? `${a.patient.firstName || ""} ${a.patient.lastName || ""}`.trim() : "Patient";
}
function statusColor(s: string): string {
  const m: Record<string, string> = {
    SCHEDULED: "bg-blue-100 text-blue-700", CONFIRMED: "bg-blue-100 text-blue-700",
    CHECKED_IN: "bg-teal-100 text-teal-700", WAITING: "bg-amber-100 text-amber-700",
    IN_PROGRESS: "bg-purple-100 text-purple-700", COMPLETED: "bg-green-100 text-green-700",
    CANCELLED: "bg-stone-100 text-stone-500", NO_SHOW: "bg-red-100 text-red-700",
  };
  return m[s] || "bg-stone-100 text-stone-600";
}
function timeLabel(): string {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}
function ageFromDob(dob?: string): number | null {
  if (!dob) return null;
  const d = new Date(dob);
  if (isNaN(d.getTime())) return null;
  const diff = Date.now() - d.getTime();
  return Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000));
}
function minutesSince(iso?: string): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (isNaN(t)) return null;
  return Math.max(0, Math.floor((Date.now() - t) / 60000));
}
function waitColor(mins: number | null): string {
  if (mins == null) return "bg-stone-100 text-stone-500";
  if (mins >= 30) return "bg-red-100 text-red-700";
  if (mins >= 15) return "bg-amber-100 text-amber-700";
  return "bg-emerald-100 text-emerald-700";
}

// ---- Dermatology templates ----
const NOTE_TEMPLATES: Array<{ label: string; fill: { complaint?: string; examination?: string; diagnosis?: string; plan?: string; advice?: string } }> = [
  {
    label: "Acne (routine)",
    fill: {
      complaint: "Facial acne, ongoing papules and comedones.",
      examination: "Inflammatory papules and comedones on cheeks/forehead. No cystic lesions.",
      diagnosis: "Acne vulgaris, moderate.",
      plan: "Start topical adapalene 0.1% nightly + benzoyl peroxide 2.5% AM. Review in 6 weeks.",
      advice: "Gentle cleansing twice daily. Non-comedogenic sunscreen SPF 30+. Avoid picking.",
    },
  },
  {
    label: "Melasma",
    fill: {
      complaint: "Pigmentation on cheeks, worsening in sun.",
      examination: "Symmetrical hyperpigmented macules on malar areas, light-brown, well-defined.",
      diagnosis: "Melasma, epidermal pattern.",
      plan: "Triple combination cream nightly x 8 weeks. Strict photoprotection.",
      advice: "Broad-spectrum SPF 50+ every 2 hrs outdoors. Avoid heat exposure and fragranced products.",
    },
  },
  {
    label: "Eczema",
    fill: {
      complaint: "Itchy dry rash on flexures.",
      examination: "Erythematous lichenified patches on antecubital and popliteal fossae. Excoriations noted.",
      diagnosis: "Atopic dermatitis, flare.",
      plan: "Topical steroid (moderate potency) BD x 10 days + daily emollient. Antihistamine PRN.",
      advice: "Bathe short, lukewarm. Moisturize within 3 mins of bath. Avoid wool, strong soaps.",
    },
  },
  {
    label: "Follow-up (stable)",
    fill: {
      complaint: "Routine follow-up, improving.",
      examination: "Lesions reduced in count and severity. Tolerating treatment well.",
      diagnosis: "Previous condition, responding to therapy.",
      plan: "Continue current regimen. Review in 6 weeks.",
      advice: "Maintain skincare routine and photoprotection.",
    },
  },
];

// Dermatology-focused Rx kits. Names match common pharmacy SKU
// labels at the clinic so applyRxTemplate() can auto-link items by
// name to a stocked product (and the row gets a green stock pill
// instead of "Custom"). When in doubt about strength/duration the
// doctor still tweaks on the row before saving — this is just a
// one-tap starter, not a final prescription.
const RX_TEMPLATES: Record<string, Array<{ name: string; dosage: string; frequency: string; duration: string; route: string }>> = {
  // ─── Acne — escalating ladder ──────────────────────────────
  "Acne — mild": [
    { name: "Adapalene 0.1% gel", dosage: "Pea-sized", frequency: "HS", duration: "2 months", route: "Topical" },
    { name: "Benzoyl peroxide 2.5%", dosage: "Thin layer", frequency: "OD", duration: "2 months", route: "Topical" },
    { name: "Sunscreen SPF 50+", dosage: "2 finger units", frequency: "OD", duration: "Ongoing", route: "Topical" },
  ],
  "Acne — moderate": [
    { name: "Adapalene 0.3% gel", dosage: "Pea-sized", frequency: "HS", duration: "3 months", route: "Topical" },
    { name: "Clindamycin 1% gel", dosage: "Thin layer", frequency: "BD", duration: "1 month", route: "Topical" },
    { name: "Doxycycline 100mg", dosage: "1 cap", frequency: "OD", duration: "1 month", route: "Oral" },
    { name: "Sunscreen SPF 50+", dosage: "2 finger units", frequency: "OD", duration: "Ongoing", route: "Topical" },
  ],
  "Acne — severe / nodulocystic": [
    { name: "Isotretinoin 20mg", dosage: "1 cap", frequency: "OD", duration: "Ongoing", route: "Oral" },
    { name: "Ceramide moisturizer", dosage: "Generous", frequency: "BD", duration: "Ongoing", route: "Topical" },
    { name: "Lip balm (paraben-free)", dosage: "Apply", frequency: "PRN", duration: "Ongoing", route: "Topical" },
    { name: "Sunscreen SPF 50+", dosage: "2 finger units", frequency: "OD", duration: "Ongoing", route: "Topical" },
  ],

  // ─── Pigmentation / sun damage ─────────────────────────────
  "Melasma": [
    { name: "Hydroquinone 4%", dosage: "Thin layer", frequency: "HS", duration: "2 months", route: "Topical" },
    { name: "Tretinoin 0.025%", dosage: "Pea-sized", frequency: "HS", duration: "2 months", route: "Topical" },
    { name: "Vitamin C serum", dosage: "3-4 drops", frequency: "OD", duration: "Ongoing", route: "Topical" },
    { name: "Sunscreen SPF 50+ (tinted)", dosage: "2 finger units", frequency: "TDS", duration: "Ongoing", route: "Topical" },
  ],
  "Anti-aging routine": [
    { name: "Tretinoin 0.025%", dosage: "Pea-sized", frequency: "HS", duration: "Ongoing", route: "Topical" },
    { name: "Niacinamide 5% serum", dosage: "3-4 drops", frequency: "OD", duration: "Ongoing", route: "Topical" },
    { name: "Ceramide moisturizer", dosage: "Generous", frequency: "BD", duration: "Ongoing", route: "Topical" },
    { name: "Sunscreen SPF 50+", dosage: "2 finger units", frequency: "OD", duration: "Ongoing", route: "Topical" },
  ],

  // ─── Inflammatory dermatoses ──────────────────────────────
  "Eczema / atopic": [
    { name: "Mometasone 0.1% cream", dosage: "Thin layer", frequency: "BD", duration: "10 days", route: "Topical" },
    { name: "Tacrolimus 0.03% ointment", dosage: "Thin layer", frequency: "BD", duration: "2 weeks", route: "Topical" },
    { name: "Cetirizine 10mg", dosage: "1 tab", frequency: "HS", duration: "2 weeks", route: "Oral" },
    { name: "Ceramide moisturizer", dosage: "Generous", frequency: "BD", duration: "Ongoing", route: "Topical" },
  ],
  "Rosacea": [
    { name: "Metronidazole 0.75% gel", dosage: "Thin layer", frequency: "BD", duration: "2 months", route: "Topical" },
    { name: "Ivermectin 1% cream", dosage: "Thin layer", frequency: "OD", duration: "2 months", route: "Topical" },
    { name: "Doxycycline 40mg MR", dosage: "1 cap", frequency: "OD", duration: "1 month", route: "Oral" },
    { name: "Mineral sunscreen SPF 50+", dosage: "2 finger units", frequency: "OD", duration: "Ongoing", route: "Topical" },
  ],
  "Seborrheic dermatitis": [
    { name: "Ketoconazole 2% shampoo", dosage: "Lather", frequency: "BD", duration: "2 weeks", route: "Topical" },
    { name: "Hydrocortisone 1% cream", dosage: "Thin layer", frequency: "BD", duration: "5 days", route: "Topical" },
    { name: "Ketoconazole 2% cream", dosage: "Thin layer", frequency: "OD", duration: "2 weeks", route: "Topical" },
  ],
  "Urticaria / hives": [
    { name: "Fexofenadine 180mg", dosage: "1 tab", frequency: "OD", duration: "2 weeks", route: "Oral" },
    { name: "Levocetirizine 5mg", dosage: "1 tab", frequency: "HS", duration: "2 weeks", route: "Oral" },
    { name: "Prednisolone 10mg", dosage: "Tapering", frequency: "OD", duration: "5 days", route: "Oral" },
  ],

  // ─── Infections ───────────────────────────────────────────
  "Tinea / fungal": [
    { name: "Terbinafine 1% cream", dosage: "Thin layer", frequency: "BD", duration: "2 weeks", route: "Topical" },
    { name: "Terbinafine 250mg", dosage: "1 tab", frequency: "OD", duration: "2 weeks", route: "Oral" },
    { name: "Antifungal dusting powder", dosage: "Generous", frequency: "BD", duration: "2 weeks", route: "Topical" },
  ],

  // ─── Procedure aftercare ──────────────────────────────────
  "Post-laser / post-peel": [
    { name: "Mupirocin 2% ointment", dosage: "Thin layer", frequency: "BD", duration: "5 days", route: "Topical" },
    { name: "Ceramide moisturizer", dosage: "Generous", frequency: "TDS", duration: "1 month", route: "Topical" },
    { name: "Mineral sunscreen SPF 50+", dosage: "2 finger units", frequency: "OD", duration: "Ongoing", route: "Topical" },
    { name: "Paracetamol 500mg", dosage: "1 tab", frequency: "PRN", duration: "3 days", route: "Oral" },
  ],

  // ─── Hair ─────────────────────────────────────────────────
  "Hair loss (M)": [
    { name: "Minoxidil 5% solution", dosage: "1 ml", frequency: "BD", duration: "Ongoing", route: "Topical" },
    { name: "Finasteride 1mg", dosage: "1 tab", frequency: "OD", duration: "Ongoing", route: "Oral" },
    { name: "Biotin 5mg", dosage: "1 tab", frequency: "OD", duration: "3 months", route: "Oral" },
  ],
  "Hair loss (F)": [
    { name: "Minoxidil 2% solution", dosage: "1 ml", frequency: "BD", duration: "Ongoing", route: "Topical" },
    { name: "Iron + Vit C tablet", dosage: "1 tab", frequency: "OD", duration: "3 months", route: "Oral" },
    { name: "Biotin 5mg", dosage: "1 tab", frequency: "OD", duration: "3 months", route: "Oral" },
  ],
};

// Pharmacy product as returned by /api/products. The prescribe
// screen typeahead consumes these; doctors see real stock + brand
// instead of the old hardcoded common-meds list.
interface PharmacyItem {
  id: string;
  name: string;
  sku?: string | null;
  brand?: string | null;
  category?: string | null;
  quantity: number;
  unit?: string | null;
}

interface RxItem {
  name: string;
  dosage: string;
  frequency: string;
  duration: string;
  route: string;
  // Soft FK to a pharmacy product; not persisted on the server (the
  // schema is name-only for now), but kept in state so the row can
  // render a stock pill and we can default route by category.
  productId?: string | null;
}

const EMPTY_CONSULT = { complaint: "", examination: "", diagnosis: "", plan: "", advice: "", internal: "" };

// v55 — ICD-10 master row shape (subset of fields the UI cares about).
interface Icd10Row {
  code: string;
  description: string;
  category: string | null;
  isCommon?: boolean;
}
const EMPTY_RX_ITEM: RxItem = { name: "", dosage: "", frequency: "BD", duration: "7 days", route: "Oral", productId: null };

// Default Route based on a product's pharmacy category. Mirror of the
// patient-profile prescription panel so doctors get the same one-tap
// UX in either entry point.
function defaultRouteFor(category: string | null | undefined): string | null {
  if (!category) return null;
  if (category === "SUPPLEMENT") return "Oral";
  if (["CLEANSER", "MOISTURIZER", "SUNSCREEN", "SERUM", "TREATMENT", "SKIN"].includes(category)) return "Topical";
  return null;
}

// ============================================================
// MAIN DOCTOR APP
// ============================================================
export default function DoctorApp() {
  // Tenant brand — hydrated from /api/auth/me alongside the user.
  // Drives the logo + clinic name on login screen and home header.
  // Falls back to platform defaults if the tenant fetch failed
  // (e.g. middle of a deploy) so the UI never crashes.
  interface TenantView {
    name: string;
    shortName: string | null;
    logoUrl: string | null;
  }
  const [tenant, setTenant] = useState<TenantView | null>(null);
  // No fallback logo — better to render no mark than a stale Nakhoda
  // PNG on a tenant that doesn't own it. Consumers check tenantLogo
  // for null and render a text-only header.
  const tenantLogo = tenant?.logoUrl || null;
  const tenantName = tenant?.name || "ScalaMedic";
  const tenantShort = tenant?.shortName || "ScalaMedic";

  // Auth state
  const [loggedIn, setLoggedIn] = useState(false);
  const [user, setUser] = useState<{ id: string; name: string; role: string; branchId: string } | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  // MFA challenge state — issued by /api/auth/login when the
  // account has TOTP enabled. We swap the form view to a 6-digit
  // input; submit posts to /api/auth/login/mfa to exchange for a
  // session cookie (same flow as the desktop login).
  const [mfaChallenge, setMfaChallenge] = useState<{ token: string; email: string } | null>(null);
  const [mfaCode, setMfaCode] = useState("");

  // Navigation
  const [screen, setScreen] = useState<Screen>("home");
  const [refreshKey, setRefreshKey] = useState(0);

  // Data
  const [appointments, setAppointments] = useState<AppointmentInfo[]>([]);
  const [patients, setPatients] = useState<PatientInfo[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);

  // Detail views
  const [selectedPatient, setSelectedPatient] = useState<PatientInfo | null>(null);
  const [selectedAppointment, setSelectedAppointment] = useState<AppointmentInfo | null>(null);
  const [vitals, setVitals] = useState<VitalsInfo | null>(null);
  // Vitals history (oldest → newest) drives the sparkline trends
  // on the patient-detail screen. Bounded to ~12 entries client-
  // side; the server returns more but the chart fits ~12 readings
  // before sample density obscures the line.
  const [vitalsHistory, setVitalsHistory] = useState<VitalsInfo[]>([]);
  const [notes, setNotes] = useState<NoteInfo[]>([]);
  const [prescriptions, setPrescriptions] = useState<RxInfo[]>([]);
  const [patientAppointments, setPatientAppointments] = useState<AppointmentInfo[]>([]);
  const [photos, setPhotos] = useState<PhotoDoc[]>([]);
  const [photoViewer, setPhotoViewer] = useState<PhotoDoc | null>(null);
  // Before/After compare modal — opens with the most recent
  // BEFORE and AFTER photos pre-selected; doctor can swap either
  // side from the photo grid below.
  const [compareOpen, setCompareOpen] = useState(false);
  const [procedures, setProcedures] = useState<ProcedureInfo[]>([]);
  const [labTests, setLabTests] = useState<LabTestInfo[]>([]);
  const [skinHistory, setSkinHistory] = useState<SkinHistoryInfo[]>([]);
  // Continuity briefing — 1-2 sentence AI summary of recent
  // clinical activity. Loaded in parallel with the rest of the
  // patient detail fetches.
  const [briefing, setBriefing] = useState<string | null>(null);

  // ─── Multi-doctor collaboration (threads + mentions) ──────────
  // Per-patient threaded notes. Loaded when the user opens the
  // Team chat surface; refreshed after each post. The mention-
  // unread badge polls /api/mentions/unread every 60s alongside
  // the existing /admin/updates badge.
  interface ThreadMention {
    id: string;
    userId: string;
    user: { id: string; name: string };
    readAt: string | null;
  }
  interface ThreadComment {
    id: string;
    body: string;
    createdAt: string;
    editedAt: string | null;
    parentCommentId: string | null;
    author: { id: string; name: string };
    mentions: ThreadMention[];
  }
  interface ThreadRow {
    id: string;
    title: string | null;
    isResolved: boolean;
    createdAt: string;
    updatedAt: string;
    createdBy: { id: string; name: string } | null;
    comments: ThreadComment[];
  }
  const [threads, setThreads] = useState<ThreadRow[]>([]);
  const [threadInput, setThreadInput] = useState("");
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [unreadMentions, setUnreadMentions] = useState<number>(0);

  const loadThreads = useCallback(async (patientId: string) => {
    const r = await api<ThreadRow[]>(`/api/patients/${patientId}/threads`);
    if (r.success && Array.isArray(r.data)) {
      setThreads(r.data);
      // If there's an existing thread, default to it; otherwise
      // composer creates a new one on first send.
      if (r.data.length > 0 && !activeThreadId) setActiveThreadId(r.data[0].id);
    }
  }, [activeThreadId]);

  const loadUnreadMentions = useCallback(async () => {
    const r = await api<{ rows: unknown[]; total: number }>("/api/mentions/unread");
    if (r.success && r.data) setUnreadMentions(r.data.total);
  }, []);

  // Poll mentions every 60s; resets to 0 immediately if the user
  // opens Team chat (the screen marks them all read on mount).
  useEffect(() => {
    if (!loggedIn) return;
    loadUnreadMentions();
    const id = setInterval(loadUnreadMentions, 60_000);
    return () => clearInterval(id);
  }, [loggedIn, loadUnreadMentions]);

  const sendThreadComment = async () => {
    if (!selectedPatient) return;
    const text = threadInput.trim();
    if (!text) { toast("Type something first", "error"); return; }
    setLoading(true);
    try {
      if (activeThreadId) {
        const res = await apiPost(`/api/threads/${activeThreadId}/comments`, { body: text });
        if (!res.success) { toast(res.error || "Failed to send", "error"); return; }
      } else {
        // First message → create the thread with the body.
        const res = await apiPost(`/api/patients/${selectedPatient.id}/threads`, { body: text });
        if (!res.success) { toast(res.error || "Failed to create thread", "error"); return; }
      }
      setThreadInput("");
      await loadThreads(selectedPatient.id);
    } finally {
      setLoading(false);
    }
  };

  // Procedure protocols — fetched on first open of the Procedure
  // screen. The picker filters to active protocols in the user's
  // tenant; the API also accepts ?treatmentId= for narrowing once a
  // treatment is chosen, but v1 just shows all and lets the doctor
  // pick. Snapshot is computed server-side at save time.
  interface ProtocolRow {
    id: string;
    name: string;
    description: string | null;
    treatmentId: string | null;
    treatment: { id: string; name: string } | null;
    consentTemplate: string | null;
    requiredBeforePhotos: string[];
    requiredAfterPhotos: string[];
    machineSettings: Record<string, unknown> | null;
    aftercareInstructions: string | null;
    suggestedFollowUpDays: number | null;
    rxKitName: string | null;
    estimatedDurationMinutes: number | null;
    version: number;
  }
  const [protocols, setProtocols] = useState<ProtocolRow[]>([]);
  const [selectedProtocolId, setSelectedProtocolId] = useState<string | null>(null);
  const [procTreatmentId, setProcTreatmentId] = useState<string>("");
  const [procConsent, setProcConsent] = useState(false);
  const [procSettingsText, setProcSettingsText] = useState("");
  const [procNotes, setProcNotes] = useState("");
  const [procAreas, setProcAreas] = useState("");

  const loadProtocols = useCallback(async () => {
    const res = await api<ProtocolRow[]>("/api/admin/procedure-protocols");
    if (res.success && Array.isArray(res.data)) setProtocols(res.data);
  }, []);

  // When the doctor picks a protocol, copy the protocol's defaults
  // into the form. The doctor edits anything that changes; the
  // server-side route freezes the snapshot at save.
  const applyProtocol = (id: string | null) => {
    setSelectedProtocolId(id);
    if (!id) return;
    const p = protocols.find((x) => x.id === id);
    if (!p) return;
    if (p.treatmentId) setProcTreatmentId(p.treatmentId);
    setProcSettingsText(p.machineSettings ? JSON.stringify(p.machineSettings, null, 2) : "");
  };

  const resetProcedureForm = () => {
    setSelectedProtocolId(null);
    setProcTreatmentId("");
    setProcConsent(false);
    setProcSettingsText("");
    setProcNotes("");
    setProcAreas("");
  };

  const saveProcedure = async () => {
    if (!selectedPatient || !selectedAppointment || !user) {
      toast("Open a patient with an active appointment first", "error");
      return;
    }
    const treatmentId = procTreatmentId || protocols.find((p) => p.id === selectedProtocolId)?.treatmentId;
    if (!treatmentId) {
      toast("Pick a treatment or protocol first", "error");
      return;
    }
    let machineSettings: Record<string, unknown> | null = null;
    if (procSettingsText.trim()) {
      try {
        const parsed = JSON.parse(procSettingsText);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("must be a JSON object");
        machineSettings = parsed;
      } catch (e) {
        toast(`Settings: ${e instanceof Error ? e.message : "invalid JSON"}`, "error");
        return;
      }
    }
    const areas = procAreas.split(",").map((s) => s.trim()).filter((s) => s.length > 0);

    setLoading(true);
    const res = await apiPost(`/api/patients/${selectedPatient.id}/procedures`, {
      appointmentId: selectedAppointment.id,
      treatmentId,
      protocolId: selectedProtocolId,
      doctorId: user.id,
      areasTreated: areas,
      settings: machineSettings,
      notes: procNotes.trim() || undefined,
      consentSigned: procConsent,
    });
    setLoading(false);
    if (!res.success) {
      toast(res.error || "Failed to record procedure", "error");
      return;
    }
    toast("Procedure recorded", "success");
    resetProcedureForm();
    if (selectedPatient) await loadPatientDetail(selectedPatient.id);
    setScreen("patient-detail");
  };

  // Timeline feed — flattened journey of every clinical event.
  // Loaded lazily when the doctor opens the Timeline screen so
  // the patient-detail open path stays cheap.
  interface TimelineEntry {
    id: string;
    kind: "VISIT" | "NOTE" | "PRESCRIPTION" | "PROCEDURE" | "LAB_ORDERED" | "LAB_COMPLETED" | "FOLLOWUP" | "PHOTO";
    at: string;
    payload: Record<string, unknown>;
  }
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const loadTimeline = useCallback(async (patientId: string) => {
    setTimelineLoading(true);
    const r = await api<TimelineEntry[]>(`/api/patients/${patientId}/timeline`);
    setTimelineLoading(false);
    if (r.success && Array.isArray(r.data)) setTimeline(r.data);
  }, []);
  const [uploadingPhoto, setUploadingPhoto] = useState<PhotoKind | null>(null);
  const beforeFileRef = useRef<HTMLInputElement | null>(null);
  const afterFileRef = useRef<HTMLInputElement | null>(null);

  // Voice note (standalone — not consultation dictation)
  const [voiceText, setVoiceText] = useState("");
  const [voiceTag, setVoiceTag] = useState<"observation" | "plan" | "progress">("observation");

  // Lab order flow
  const [labSelected, setLabSelected] = useState<Array<{ name: string; code?: string; note?: string }>>([]);
  const [labCustom, setLabCustom] = useState("");
  const [labPriority, setLabPriority] = useState<"NORMAL" | "URGENT" | "EMERGENCY">("NORMAL");

  // Follow-up flow
  const [followDays, setFollowDays] = useState<number>(14);
  const [followReason, setFollowReason] = useState("");
  const [followNotes, setFollowNotes] = useState("");

  // Audio level for waveform
  const [audioLevel, setAudioLevel] = useState(0);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const [toggleRecord, setToggleRecord] = useState(false); // true = toggle-mode (tap to start/stop)

  // Consultation
  const [consultNote, setConsultNote] = useState(EMPTY_CONSULT);
  // v55 — Selected ICD-10 codes for the current consultation. First
  // entry is the primary diagnosis. Persisted on save → consultation_notes.icd10Codes.
  const [icdCodes, setIcdCodes] = useState<Icd10Row[]>([]);

  // Prescription
  const [rxItems, setRxItems] = useState<RxItem[]>([{ ...EMPTY_RX_ITEM }]);
  const [rxNotes, setRxNotes] = useState("");
  const [medAutocompleteIdx, setMedAutocompleteIdx] = useState<number | null>(null);
  // Drug-guard acknowledgements — set of warning ids the doctor has
  // explicitly clicked through. Reset whenever the rx items change
  // so an edited Rx re-prompts.
  const [ackedGuards, setAckedGuards] = useState<Set<string>>(new Set());
  useEffect(() => {
    // New medicine → reset acks; doctor must re-confirm.
    setAckedGuards(new Set());
  }, [rxItems]);

  // Ambient AI suggestions surfaced on the consultation screen.
  // The transcribe response returns one row per AI-extracted
  // proposal (medications, labs, follow-ups) with a server-side id;
  // each chip routes through /api/ai/suggestions/[id]/accept|reject.
  // Accepting a MEDICATION ALSO drops the proposal into rxItems so
  // the doctor finishes the prescription as usual.
  interface AmbientChip {
    id: string;
    kind: "MEDICATION" | "LAB" | "FOLLOWUP";
    payload: Record<string, unknown>;
  }
  const [aiProposals, setAiProposals] = useState<AmbientChip[]>([]);

  // Pharmacy catalog — fed to the Rx typeahead. Loaded once after
  // login; refetched on pull-to-refresh of the home screen since
  // stock counts change. Empty list is fine — the dropdown just
  // shows a hint and free-text typing still works.
  const [pharmacy, setPharmacy] = useState<PharmacyItem[]>([]);
  const loadPharmacy = useCallback(async () => {
    const res = await api<PharmacyItem[]>("/api/products");
    if (res.success && Array.isArray(res.data)) setPharmacy(res.data);
  }, []);

  // Doctor scope — drives the appointments query. For DOCTOR role
  // we always pin to the logged-in user's id. For ADMIN/SUPER_ADMIN
  // we fetch the doctor list and let the user pick which doctor's
  // schedule to view ("All" shows every doctor's appointments). The
  // historical query was hardcoded to `doctorId=user.id` which left
  // admins seeing nothing because they're not booked into appointments.
  interface DoctorOption { id: string; name: string; speciality?: string | null }
  const [doctors, setDoctors] = useState<DoctorOption[]>([]);
  // "" = no filter (show all doctors). Otherwise = doctor id.
  const [selectedDoctorId, setSelectedDoctorId] = useState<string>("");
  const loadDoctors = useCallback(async () => {
    const res = await api<DoctorOption[]>("/api/users?role=DOCTOR");
    if (res.success && Array.isArray(res.data)) setDoctors(res.data);
  }, []);

  // Quick patient search on the home screen — debounced so we don't
  // hammer /api/patients on every keystroke. Selecting a result jumps
  // straight into the patient-detail screen, same as tapping a row in
  // the Patients tab.
  const [homeSearch, setHomeSearch] = useState("");
  const [homeResults, setHomeResults] = useState<PatientInfo[]>([]);
  const [homeSearchOpen, setHomeSearchOpen] = useState(false);
  const homeSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (homeSearchTimer.current) clearTimeout(homeSearchTimer.current);
    const q = homeSearch.trim();
    if (q.length < 2) { setHomeResults([]); return; }
    homeSearchTimer.current = setTimeout(async () => {
      const res = await api<PatientInfo[]>(`/api/patients?search=${encodeURIComponent(q)}&limit=8`);
      if (res.success && Array.isArray(res.data)) setHomeResults(res.data);
    }, 220);
    return () => { if (homeSearchTimer.current) clearTimeout(homeSearchTimer.current); };
  }, [homeSearch]);

  // Pending sign-off feed — unsigned consultation notes from this
  // doctor over the last 14 days. "Sign" here calls the existing
  // /api/consultation-notes/[id]/sign endpoint and we splice the row
  // out of the local list so the card collapses without a full
  // refetch.
  interface PendingNote {
    id: string;
    chiefComplaint?: string | null;
    diagnosis?: string | null;
    createdAt: string;
    patient: { id: string; firstName: string; lastName: string; patientCode: string };
    doctor?: { id: string; name: string };
  }
  const [pendingNotes, setPendingNotes] = useState<PendingNote[]>([]);
  const loadPendingNotes = useCallback(async () => {
    const res = await api<PendingNote[]>("/api/consultation-notes/pending?limit=20");
    if (res.success && Array.isArray(res.data)) setPendingNotes(res.data);
  }, []);
  const signPendingNote = async (noteId: string) => {
    // Optimistic: remove the row immediately, restore on failure.
    const before = pendingNotes;
    setPendingNotes((cur) => cur.filter((n) => n.id !== noteId));
    const res = await apiPost(`/api/consultation-notes/${noteId}/sign`, {});
    if (!res.success) {
      setPendingNotes(before);
      toast(res.error || "Sign failed", "error");
      return;
    }
    toast("Note signed", "success");
  };

  // Pick a pharmacy product into one of the Rx rows. Fills name with
  // "Name — Brand", links productId, and seeds a sensible Route by
  // category if the doctor hasn't already overridden it.
  const pickPharmacyItem = (idx: number, p: PharmacyItem) => {
    setRxItems((prev) => prev.map((row, i) => {
      if (i !== idx) return row;
      const seededRoute = defaultRouteFor(p.category);
      return {
        ...row,
        name: [p.name, p.brand].filter(Boolean).join(" — "),
        productId: p.id,
        // Only seed route if the doctor hasn't picked one. The
        // EMPTY_RX_ITEM seeds Oral as a benign default; treat that
        // as "untouched" so we can override to Topical for skin
        // products without surprising the doctor.
        route: row.route && row.route !== "Oral" ? row.route : (seededRoute ?? row.route),
      };
    }));
    setMedAutocompleteIdx(null);
  };

  // Toasts
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toast = useCallback((text: string, kind: ToastKind = "info") => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, kind, text }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3200);
  }, []);

  // Voice recording
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  // Confirm dialog
  const [confirm, setConfirm] = useState<{ title: string; body: string; onYes: () => void } | null>(null);

  // Ticker for wait-time display (re-render every 30s)
  const [, setTick] = useState(0);
  useEffect(() => {
    const i = setInterval(() => setTick(t => t + 1), 30000);
    return () => clearInterval(i);
  }, []);

  // ─── Offline cache (Phase 2.5) ──────────────────────────────
  // Service worker caches GETs for the doctor-app shell + the
  // patient-detail bundle. On network failure the SW serves the
  // last-good copy with X-From-Cache: 1; the UI surfaces an
  // "offline · cached data" pill so the doctor knows the data
  // they're seeing might be stale. Writes always pass through
  // (no offline write queue in v1).
  const [isOnline, setIsOnline] = useState(true);
  useEffect(() => {
    if (typeof window === "undefined") return;
    setIsOnline(navigator.onLine);
    const onOn = () => setIsOnline(true);
    const onOff = () => setIsOnline(false);
    window.addEventListener("online", onOn);
    window.addEventListener("offline", onOff);
    // Register the SW. Scoped to "/" because /api/* lives at root
    // and the SW's pattern-matching handles narrowing.
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
    }
    return () => {
      window.removeEventListener("online", onOn);
      window.removeEventListener("offline", onOff);
    };
  }, []);

  // ---- Auth ----
  useEffect(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem("doctor-app-email") : null;
    if (saved) setEmail(saved);
    api<{ user: { id: string; name: string; role: string; branchId: string }; tenant?: TenantView }>("/api/auth/me").then(res => {
      if (res.success && res.data?.user) {
        const u = res.data.user;
        if (res.data.tenant) setTenant(res.data.tenant);
        if (u.role === "DOCTOR" || u.role === "ADMIN" || u.role === "SUPER_ADMIN") {
          setUser(u);
          setLoggedIn(true);
          loadPharmacy();
          // Doctors see only their own schedule; admins land on
          // "All doctors" and get a picker chip strip.
          if (u.role === "DOCTOR") setSelectedDoctorId(u.id);
          else loadDoctors();
        } else {
          setLoginError("This app is for doctors only");
        }
      }
    });
  }, [loadPharmacy, loadDoctors]);

  // Shared "session is good, finish bootstrap" path. Used by both
  // the password login (no MFA) and the MFA challenge exchange.
  const completeLogin = (u: { id: string; name: string; role: string; branchId: string }) => {
    localStorage.setItem("doctor-app-email", email);
    setUser(u);
    setLoggedIn(true);
    loadPharmacy();
    api<{ user: unknown; tenant?: TenantView }>("/api/auth/me").then((r) => {
      if (r.success && r.data?.tenant) setTenant(r.data.tenant);
    });
    if (u.role === "DOCTOR") setSelectedDoctorId(u.id);
    else loadDoctors();
  };

  const handleLogin = async () => {
    if (!email || !password) return;
    setLoginLoading(true);
    setLoginError("");
    const res = await apiPost("/api/auth/login", { email, password }) as {
      success: boolean;
      data?: {
        user?: { id: string; name: string; role: string; branchId: string };
        mfaRequired?: boolean;
        challengeToken?: string;
        email?: string;
      };
      error?: string;
    };
    if (res.success && res.data?.mfaRequired && res.data.challengeToken) {
      // First factor cleared; pivot to the 6-digit prompt.
      setMfaChallenge({ token: res.data.challengeToken, email: res.data.email || email });
      setMfaCode("");
      setLoginLoading(false);
      return;
    }
    if (res.success && res.data?.user) {
      const u = res.data.user;
      if (u.role !== "DOCTOR" && u.role !== "ADMIN" && u.role !== "SUPER_ADMIN") {
        setLoginError("This app is for doctors only");
        await api("/api/auth/logout", { method: "POST" });
      } else {
        completeLogin(u);
      }
    } else {
      setLoginError(res.error || "Login failed");
    }
    setLoginLoading(false);
  };

  const handleMfaSubmit = async () => {
    if (!mfaChallenge || mfaCode.length !== 6) return;
    setLoginLoading(true);
    setLoginError("");
    const res = await apiPost("/api/auth/login/mfa", {
      challengeToken: mfaChallenge.token,
      code: mfaCode,
    }) as { success: boolean; data?: { user: { id: string; name: string; role: string; branchId: string } }; error?: string };
    if (res.success && res.data?.user) {
      const u = res.data.user;
      if (u.role !== "DOCTOR" && u.role !== "ADMIN" && u.role !== "SUPER_ADMIN") {
        setLoginError("This app is for doctors only");
        await api("/api/auth/logout", { method: "POST" });
        setMfaChallenge(null);
      } else {
        setMfaChallenge(null);
        completeLogin(u);
      }
    } else {
      setLoginError(res.error || "Invalid code");
    }
    setLoginLoading(false);
  };

  const handleLogout = async () => {
    await api("/api/auth/logout", { method: "POST" });
    // Clear the SW cache before another user signs in on the same
    // browser. Without this, cached patient detail bundles from
    // user A could be served to user B — a real privacy leak in
    // shared clinic devices.
    if (typeof window !== "undefined" && "caches" in window) {
      try {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      } catch { /* best-effort */ }
    }
    setLoggedIn(false);
    setUser(null);
    setScreen("home");
  };

  // ---- Data loading ----
  const loadAppointments = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const today = getClinicToday();
    // Drop the doctorId filter when admin picks "All". For doctors
    // selectedDoctorId is always pinned to their own id.
    const qs = selectedDoctorId
      ? `?date=${today}&doctorId=${selectedDoctorId}`
      : `?date=${today}`;
    const res = await api<AppointmentInfo[]>(`/api/appointments${qs}`);
    if (res.success) {
      setAppointments((res.data || []).sort((a, b) => (a.startTime || "").localeCompare(b.startTime || "")));
    }
    setLoading(false);
  }, [user, selectedDoctorId]);

  const loadPatients = useCallback(async (q?: string) => {
    setSearching(true);
    const qs = q ? `?search=${encodeURIComponent(q)}&limit=20` : "?limit=20";
    const res = await api<PatientInfo[]>(`/api/patients${qs}`);
    if (res.success) setPatients(res.data || []);
    setSearching(false);
  }, []);

  const loadPatientDetail = useCallback(async (patientId: string) => {
    // Reset the briefing first so the previous patient's text
    // doesn't flash for the new one. The /continuity-briefing
    // call may take 1-2 seconds (AI round-trip); we show a soft
    // skeleton in the meantime via briefing===null state.
    setBriefing(null);
    const [pRes, vRes, nRes, aRes, rxRes, phRes, procRes, labRes, skinRes, briefingRes] = await Promise.all([
      api<PatientInfo>(`/api/patients/${patientId}`),
      api<VitalsInfo[]>(`/api/patients/${patientId}/triage`),
      api<NoteInfo[]>(`/api/patients/${patientId}/notes?limit=5`),
      api<AppointmentInfo[]>(`/api/patients/${patientId}/appointments?limit=10`),
      api<RxInfo[]>(`/api/patients/${patientId}/prescriptions`),
      api<PhotoDoc[]>(`/api/patients/${patientId}/documents?type=BEFORE_AFTER`),
      // History feeds — surfaced as the new "Patient history" cards.
      api<ProcedureInfo[]>(`/api/patients/${patientId}/procedures`),
      api<LabTestInfo[]>(`/api/patients/${patientId}/lab-tests`),
      api<SkinHistoryInfo[]>(`/api/patients/${patientId}/skin-history`),
      api<{ briefing: string | null }>(`/api/patients/${patientId}/continuity-briefing`),
    ]);
    if (pRes.success && pRes.data) setSelectedPatient(pRes.data);
    const vArr = Array.isArray(vRes.data) ? (vRes.data as VitalsInfo[]) : [];
    setVitals(vArr.length > 0 ? vArr[0] : null);
    // The triage endpoint returns DESC by createdAt; reverse for
    // the sparkline (oldest → newest) and cap at the most recent
    // 12 readings so the chart density stays readable.
    setVitalsHistory(vArr.slice(0, 12).slice().reverse());
    setNotes(Array.isArray(nRes.data) ? nRes.data : []);
    setPatientAppointments(Array.isArray(aRes.data) ? aRes.data : []);
    setPrescriptions(Array.isArray(rxRes.data) ? rxRes.data : []);
    setPhotos(Array.isArray(phRes.data) ? phRes.data : []);
    setProcedures(Array.isArray(procRes.data) ? procRes.data : []);
    setLabTests(Array.isArray(labRes.data) ? labRes.data : []);
    setSkinHistory(Array.isArray(skinRes.data) ? skinRes.data : []);
    setBriefing(briefingRes.success ? (briefingRes.data?.briefing ?? null) : null);
  }, []);

  useEffect(() => {
    if (!loggedIn || !user) return;
    const timer = setTimeout(() => {
      loadAppointments();
      loadPendingNotes();
    }, 0);
    return () => clearTimeout(timer);
  }, [loggedIn, user, refreshKey, loadAppointments, loadPendingNotes]);

  const refresh = () => setRefreshKey(k => k + 1);

  // Debounced patient search
  useEffect(() => {
    if (screen !== "patients") return;
    if (searchQuery.length === 0) { loadPatients(); return; }
    if (searchQuery.length < 2) return;
    const t = setTimeout(() => loadPatients(searchQuery), 300);
    return () => clearTimeout(t);
  }, [searchQuery, screen, loadPatients]);

  // ---- Actions ----
  const startConsultation = async (apt: AppointmentInfo) => {
    setLoading(true);
    const res = await apiPut(`/api/appointments/${apt.id}`, { status: "IN_PROGRESS", workflowStage: "CONSULT" });
    if (!res.success) {
      toast(res.error || "Failed to start consultation", "error");
      setLoading(false);
      return;
    }
    setSelectedAppointment({ ...apt, status: "IN_PROGRESS" });
    await loadPatientDetail(apt.patientId);
    setConsultNote(EMPTY_CONSULT);
    setIcdCodes([]);
    setScreen("consultation");
    setLoading(false);
    refresh();
    toast("Consultation started", "success");
  };

  const saveConsultation = async () => {
    if (!selectedAppointment || !selectedPatient) return;
    if (!consultNote.complaint && !consultNote.diagnosis && !consultNote.plan) {
      toast("Add complaint, diagnosis or plan first", "error");
      return;
    }
    setLoading(true);
    const res = await apiPost(`/api/patients/${selectedPatient.id}/notes`, {
      appointmentId: selectedAppointment.id,
      patientId: selectedPatient.id,
      doctorId: user?.id,
      chiefComplaint: consultNote.complaint,
      examination: consultNote.examination,
      diagnosis: consultNote.diagnosis,
      icd10Codes: icdCodes.map((c) => c.code),
      treatmentPlan: consultNote.plan,
      advice: consultNote.advice,
      internalNotes: consultNote.internal,
    });
    setLoading(false);
    if (!res.success) {
      toast(res.error || "Failed to save note", "error");
      return;
    }
    toast("Consultation saved", "success");
    if (selectedPatient) await loadPatientDetail(selectedPatient.id);
    setScreen("patient-detail");
  };

  const completeAppointment = (apt: AppointmentInfo) => {
    setConfirm({
      title: "Complete visit?",
      body: "This will mark the appointment as completed and send the patient to checkout.",
      onYes: async () => {
        setConfirm(null);
        setLoading(true);
        const res = await apiPut(`/api/appointments/${apt.id}`, { status: "COMPLETED", workflowStage: "CHECKOUT" });
        setLoading(false);
        if (!res.success) {
          toast(res.error || "Failed to complete", "error");
          return;
        }
        toast("Visit completed", "success");
        setSelectedAppointment(null);
        refresh();
        setScreen("home");
      },
    });
  };

  // Accept an AI proposal. Routes to /accept which:
  //   - For LAB / FOLLOWUP: creates the artifact server-side
  //   - For MEDICATION: just resolves the suggestion (we drop the
  //     payload into rxItems client-side; the prescription save is
  //     where the artifact actually lands)
  const acceptProposal = async (chip: AmbientChip) => {
    setAiProposals(prev => prev.filter(p => p.id !== chip.id));
    try {
      const res = await fetch(`/api/ai/suggestions/${chip.id}/accept`, {
        method: "POST",
        credentials: "include",
      });
      const d = await res.json();
      if (!d.success) {
        toast(d.error || "Could not accept", "error");
        // Restore the chip on failure so the doctor can retry
        setAiProposals(prev => [...prev, chip]);
        return;
      }
      if (chip.kind === "MEDICATION") {
        const p = chip.payload as { medicineName?: string; dosage?: string; frequency?: string; duration?: string; route?: string };
        const newItem: RxItem = {
          name: p.medicineName || "",
          dosage: p.dosage || "",
          frequency: p.frequency || "BD",
          duration: p.duration || "7 days",
          route: p.route || "Oral",
          productId: pharmacy.find(x => x.name.toLowerCase() === (p.medicineName || "").toLowerCase())?.id ?? null,
        };
        // Replace the leading empty row if any; otherwise append.
        setRxItems(prev => {
          const blank = prev.findIndex(r => !r.name.trim());
          if (blank >= 0) {
            const next = [...prev];
            next[blank] = newItem;
            return next;
          }
          return [...prev, newItem];
        });
        toast(`${newItem.name} added to Rx`, "success");
      } else if (chip.kind === "LAB") {
        toast("Lab order created", "success");
      } else if (chip.kind === "FOLLOWUP") {
        toast("Follow-up scheduled", "success");
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : "Network error", "error");
      setAiProposals(prev => [...prev, chip]);
    }
  };

  // Repeat last Rx — load the most recent prescription's items
  // into rxItems and jump to the prescribe screen. The doctor
  // edits any deltas (dose tweaks, drop one, add one) and saves.
  // Drug-guard banner re-runs against the loaded items so a
  // teratogen on a pre-pregnant patient still surfaces.
  const repeatLastRx = () => {
    const last = prescriptions[0];
    if (!last) {
      toast("No previous Rx to repeat", "error");
      return;
    }
    const items = (last.items || []).map<RxItem>((i) => {
      const linked = pharmacy.find((p) => p.name.toLowerCase() === i.medicineName.toLowerCase());
      return {
        name: i.medicineName,
        dosage: i.dosage || "",
        frequency: i.frequency || "BD",
        duration: i.duration || "7 days",
        route: i.route || "Oral",
        productId: linked?.id ?? null,
      };
    });
    if (items.length === 0) {
      toast("Last Rx had no items", "error");
      return;
    }
    setRxItems(items);
    setRxNotes("");
    setAckedGuards(new Set());
    setScreen("prescribe");
    toast(`Loaded ${items.length} medicine${items.length > 1 ? "s" : ""} from last Rx`, "info");
  };

  const rejectProposal = async (chip: AmbientChip) => {
    setAiProposals(prev => prev.filter(p => p.id !== chip.id));
    try {
      await fetch(`/api/ai/suggestions/${chip.id}/reject`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
    } catch { /* fire-and-forget reject */ }
  };

  const savePrescription = async () => {
    if (!selectedPatient) return;
    const validItems = rxItems.filter(i => i.name.trim());
    if (validItems.length === 0) {
      toast("Add at least one medicine", "error");
      return;
    }
    // Drug guards: every "danger" warning must be acknowledged
    // before save. "warning" tier is informational and doesn't
    // block. Allergy/teratogen hits are danger; informational
    // ones (retinoid in pregnancy, steroid overlap) are warning.
    const warnings = checkRxGuards(
      validItems.map(i => ({ name: i.name, route: i.route })),
      { gender: selectedPatient.gender, allergies: selectedPatient.allergies, medications: selectedPatient.medications },
    );
    const blocking = warnings.filter(w => w.severity === "danger" && !ackedGuards.has(w.id));
    if (blocking.length > 0) {
      toast("Acknowledge the safety warnings above to continue", "error");
      return;
    }
    setLoading(true);
    const res = await apiPost(`/api/patients/${selectedPatient.id}/prescriptions`, {
      patientId: selectedPatient.id,
      doctorId: user?.id,
      appointmentId: selectedAppointment?.id,
      notes: rxNotes,
      items: validItems.map(i => ({
        medicineName: i.name, dosage: i.dosage,
        frequency: i.frequency, duration: i.duration, route: i.route,
      })),
    });
    setLoading(false);
    if (!res.success) {
      toast(res.error || "Failed to save Rx", "error");
      return;
    }
    toast(`${validItems.length} medicine${validItems.length > 1 ? "s" : ""} prescribed`, "success");
    setRxItems([{ ...EMPTY_RX_ITEM }]);
    setRxNotes("");
    if (selectedPatient) await loadPatientDetail(selectedPatient.id);
    setScreen("patient-detail");
  };

  // ---- Photo upload ----
  const uploadPhoto = async (file: File, kind: PhotoKind) => {
    if (!selectedPatient || !user) return;
    if (!file.type.startsWith("image/")) { toast("Please choose an image", "error"); return; }
    if (file.size > 10 * 1024 * 1024) { toast("Image too large (max 10MB)", "error"); return; }
    setUploadingPhoto(kind);
    try {
      const form = new FormData();
      form.append("file", file);
      const upRes = await fetch("/api/upload", { method: "POST", credentials: "include", body: form });
      const upData = await upRes.json();
      if (!upData.success) { toast(upData.error || "Upload failed", "error"); return; }

      const label = kind === "before" ? "BEFORE" : "AFTER";
      const dateStr = new Date().toLocaleDateString("en-PK", { timeZone: CLINIC_TZ, month: "short", day: "numeric" });
      const docRes = await apiPost(`/api/patients/${selectedPatient.id}/documents`, {
        name: `${label}: ${dateStr}`,
        type: "BEFORE_AFTER",
        fileUrl: upData.data.url,
        fileSize: upData.data.size,
        mimeType: upData.data.mimeType,
        uploadedById: user.id,
      });
      if (!docRes.success) { toast(docRes.error || "Failed to save photo", "error"); return; }
      toast(`${kind === "before" ? "Before" : "After"} photo uploaded`, "success");
      await loadPatientDetail(selectedPatient.id);
    } catch {
      toast("Network error uploading photo", "error");
    } finally {
      setUploadingPhoto(null);
    }
  };

  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>, kind: PhotoKind) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) await uploadPhoto(file, kind);
  };

  // ---- Voice dictation (shared across consultation + standalone voice-note screens) ----
  const startRecording = async (mode: "consult" | "note" = "consult") => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunksRef.current = [];
      // Pick the best mimeType the browser will give us. Order
      // matters: Whisper handles all of these but Safari/iOS only
      // supports audio/mp4 so we fall back to that before letting
      // the browser default ("" → whatever it pleases).
      const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
      const supported = candidates.find((c) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(c)) || "";
      const mr = supported ? new MediaRecorder(stream, { mimeType: supported }) : new MediaRecorder(stream);
      mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        stopAudioMeter();
        const actualMime = mr.mimeType || supported || "audio/webm";
        const blob = new Blob(chunksRef.current, { type: actualMime });
        if (blob.size < 1000) { toast("Recording too short", "error"); return; }
        await sendForTranscription(blob, mode);
      };
      mr.start();
      mediaRef.current = mr;
      setIsRecording(true);
      startAudioMeter(stream);
    } catch {
      toast("Microphone access denied", "error");
    }
  };

  const stopRecording = () => {
    if (mediaRef.current && mediaRef.current.state !== "inactive") {
      mediaRef.current.stop();
    }
    setIsRecording(false);
  };

  const startAudioMeter = (stream: MediaStream) => {
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AC();
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      src.connect(analyser);
      audioCtxRef.current = ctx;
      analyserRef.current = analyser;
      const buf = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) {
          const v = (buf[i] - 128) / 128;
          sum += v * v;
        }
        setAudioLevel(Math.min(1, Math.sqrt(sum / buf.length) * 3));
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch {
      /* meter is non-critical; silent failure */
    }
  };

  const stopAudioMeter = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    analyserRef.current = null;
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    setAudioLevel(0);
  };

  const sendForTranscription = async (blob: Blob, mode: "consult" | "note" = "consult") => {
    setIsTranscribing(true);
    try {
      // Whisper detects audio format from the file extension. If we
      // hardcode ".webm" but the blob is actually mp4 (Safari/iOS),
      // it errors. Pick the extension from the blob's mimeType.
      const ext = (blob.type.includes("mp4") || blob.type.includes("aac")) ? "m4a"
        : blob.type.includes("ogg") ? "ogg"
        : "webm";
      const form = new FormData();
      form.append("audio", blob, `note.${ext}`);
      if (selectedAppointment?.id) form.append("appointmentId", selectedAppointment.id);
      if (selectedPatient?.id) form.append("patientId", selectedPatient.id);
      if (user?.id) form.append("doctorId", user.id);
      const res = await fetch("/api/ai/transcribe", { method: "POST", credentials: "include", body: form });
      const data = await res.json();
      if (!data.success) {
        toast(data.error || "Transcription failed", "error");
        return;
      }
      const s = data.data?.structuredNote || {};
      const raw = data.data?.rawTranscript || "";

      if (mode === "note") {
        // Standalone voice note screen: dump raw + structured into the editable field
        const pieces = [
          s.chiefComplaint && `Complaint: ${s.chiefComplaint}`,
          s.findings && `Findings: ${s.findings}`,
          s.diagnosis && `Diagnosis: ${s.diagnosis}`,
          s.plan && `Plan: ${s.plan}`,
        ].filter(Boolean).join("\n");
        const text = pieces || raw;
        setVoiceText(prev => appendLine(prev, text));
      } else {
        // Consultation screen: distribute into the structured form fields
        setConsultNote(prev => ({
          complaint: s.chiefComplaint ? appendLine(prev.complaint, s.chiefComplaint) : prev.complaint,
          examination: s.findings ? appendLine(prev.examination, s.findings) : prev.examination,
          diagnosis: s.diagnosis ? appendLine(prev.diagnosis, s.diagnosis) : prev.diagnosis,
          plan: s.plan ? appendLine(prev.plan, s.plan) : prev.plan,
          advice: prev.advice,
          internal: !s.chiefComplaint && !s.findings && !s.plan && raw ? appendLine(prev.internal, raw) : prev.internal,
        }));
      }
      // Capture AI proposals as chips. The server already created
      // AISuggestion rows pre-display, so each chip carries the
      // suggestion id needed for accept/reject.
      const incoming = (data.data?.suggestions || []) as AmbientChip[];
      if (incoming.length > 0) {
        setAiProposals(prev => [...prev, ...incoming]);
      }
      toast("Transcribed", "success");
    } catch {
      toast("Network error during transcription", "error");
    } finally {
      setIsTranscribing(false);
    }
  };

  // ---- Standalone voice note ----
  const saveVoiceNote = async () => {
    if (!selectedPatient || !user) return;
    const trimmed = voiceText.trim();
    if (!trimmed) { toast("Record or type something first", "error"); return; }
    setLoading(true);
    const fieldMap: Record<typeof voiceTag, string> = {
      observation: "chiefComplaint",
      plan: "treatmentPlan",
      progress: "internalNotes",
    };
    const body: Record<string, unknown> = {
      appointmentId: selectedAppointment?.id,
      patientId: selectedPatient.id,
      doctorId: user.id,
      [fieldMap[voiceTag]]: trimmed,
    };
    const res = await apiPost(`/api/patients/${selectedPatient.id}/notes`, body);
    setLoading(false);
    if (!res.success) {
      toast(res.error || "Failed to save note", "error");
      return;
    }
    toast("Voice note saved", "success");
    setVoiceText("");
    if (selectedPatient) await loadPatientDetail(selectedPatient.id);
    setScreen("patient-detail");
  };

  // ---- Sign consultation note ----
  const signNote = async (noteId: string) => {
    setLoading(true);
    const res = await apiPost(`/api/consultation-notes/${noteId}/sign`, {});
    setLoading(false);
    if (!res.success) { toast(res.error || "Failed to sign", "error"); return; }
    toast("Note signed", "success");
    if (selectedPatient) await loadPatientDetail(selectedPatient.id);
  };

  // ---- Order labs ----
  const orderLabs = async () => {
    if (!selectedPatient || !user) return;
    const toOrder = [...labSelected];
    if (labCustom.trim()) toOrder.push({ name: labCustom.trim() });
    if (toOrder.length === 0) { toast("Select at least one test", "error"); return; }
    setLoading(true);
    try {
      const results = await Promise.all(
        toOrder.map(t =>
          apiPost(`/api/patients/${selectedPatient.id}/lab-tests`, {
            doctorId: user.id,
            appointmentId: selectedAppointment?.id,
            testName: t.name,
            testCode: t.code,
            priority: labPriority,
            notes: t.note,
          })
        )
      );
      const failed = results.filter(r => !r.success).length;
      if (failed > 0) {
        toast(`Ordered ${toOrder.length - failed}/${toOrder.length} tests`, failed === toOrder.length ? "error" : "info");
      } else {
        toast(`${toOrder.length} test${toOrder.length > 1 ? "s" : ""} ordered`, "success");
      }
      setLabSelected([]);
      setLabCustom("");
      setLabPriority("NORMAL");
      setScreen("patient-detail");
    } finally {
      setLoading(false);
    }
  };

  // ---- Schedule follow-up ----
  const scheduleFollowUp = async () => {
    if (!selectedPatient || !user) return;
    if (!followReason.trim()) { toast("Enter a reason", "error"); return; }
    const due = new Date(Date.now() + followDays * 86400000);
    due.setUTCHours(0, 0, 0, 0); // @db.Date column — use UTC midnight per clinicDayRange semantics
    setLoading(true);
    const res = await apiPost(`/api/patients/${selectedPatient.id}/follow-ups`, {
      doctorId: user.id,
      appointmentId: selectedAppointment?.id,
      dueDate: due.toISOString(),
      reason: followReason.trim(),
      notes: followNotes.trim() || undefined,
    });
    setLoading(false);
    if (!res.success) { toast(res.error || "Failed to schedule", "error"); return; }
    toast(`Follow-up in ${followDays} days`, "success");
    setFollowReason("");
    setFollowNotes("");
    setFollowDays(14);
    setScreen("patient-detail");
  };

  const applyNoteTemplate = (idx: number) => {
    const t = NOTE_TEMPLATES[idx];
    setConsultNote(prev => ({
      complaint: t.fill.complaint || prev.complaint,
      examination: t.fill.examination || prev.examination,
      diagnosis: t.fill.diagnosis || prev.diagnosis,
      plan: t.fill.plan || prev.plan,
      advice: t.fill.advice || prev.advice,
      internal: prev.internal,
    }));
    toast(`Applied: ${t.label}`, "info");
  };

  // Rx-kit preview. When the doctor taps a kit chip we no longer
  // apply it directly — instead, this modal lists every medicine in
  // the kit with a tickbox so the doctor confirms each one before
  // it's added to the form. Prevents accidental over-prescription
  // (e.g. tapping "Acne severe" by mistake when the patient is
  // pregnant — the doctor sees Isotretinoin in the list and can
  // uncheck it). Cancel discards the preview entirely.
  type KitPreview = {
    key: string;
    items: Array<{ name: string; dosage: string; frequency: string; duration: string; route: string }>;
    checked: boolean[];
  };
  const [kitPreview, setKitPreview] = useState<KitPreview | null>(null);

  const openRxTemplate = (key: string) => {
    const t = RX_TEMPLATES[key];
    if (!t) return;
    setKitPreview({ key, items: t, checked: t.map(() => true) });
  };

  const confirmKitPreview = () => {
    if (!kitPreview) return;
    const picked = kitPreview.items.filter((_, i) => kitPreview.checked[i]);
    if (picked.length === 0) {
      toast("Select at least one medicine", "error");
      return;
    }
    // Auto-link each selected medicine to a pharmacy item by
    // case-insensitive name match (same heuristic as before).
    setRxItems(picked.map((m) => {
      const hit = pharmacy.find((p) => p.name.toLowerCase() === m.name.toLowerCase());
      return hit ? { ...m, productId: hit.id } : { ...m, productId: null };
    }));
    toast(`Applied ${kitPreview.key} (${picked.length} med${picked.length > 1 ? "s" : ""})`, "info");
    setKitPreview(null);
  };

  // ---- Pull-to-refresh (simple touch-based) ----
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const pullStartY = useRef<number | null>(null);
  const [pullDist, setPullDist] = useState(0);
  const onTouchStart = (e: React.TouchEvent) => {
    if (scrollRef.current && scrollRef.current.scrollTop <= 0) {
      pullStartY.current = e.touches[0].clientY;
    }
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (pullStartY.current == null) return;
    const d = e.touches[0].clientY - pullStartY.current;
    if (d > 0) setPullDist(Math.min(d, 80));
  };
  const onTouchEnd = () => {
    if (pullDist > 60) { refresh(); toast("Refreshed", "success"); }
    pullStartY.current = null;
    setPullDist(0);
  };

  // ---- Derived ----
  const waiting = useMemo(() => appointments.filter(a => a.status === "WAITING" || a.status === "CHECKED_IN"), [appointments]);
  const inProgress = useMemo(() => appointments.find(a => a.status === "IN_PROGRESS"), [appointments]);
  const upcoming = useMemo(() => appointments.filter(a => a.status === "SCHEDULED" || a.status === "CONFIRMED"), [appointments]);
  const completed = useMemo(() => appointments.filter(a => a.status === "COMPLETED"), [appointments]);
  const todayLabel = new Date().toLocaleDateString("en-PK", { weekday: "long", month: "short", day: "numeric", timeZone: CLINIC_TZ });

  // ============================================================
  // LOGIN SCREEN
  // ============================================================
  if (!loggedIn) {
    return (
      <div className="relative min-h-[100dvh] bg-gradient-to-br from-teal-600 via-cyan-600 to-sky-700 flex items-center justify-center px-6 overflow-hidden">
        <div className="pointer-events-none absolute inset-0 opacity-30 [background:radial-gradient(circle_at_30%_30%,#fff_0,transparent_55%),radial-gradient(circle_at_70%_75%,#fff_0,transparent_50%)]" />
        <ToastStack toasts={toasts} />
        <div className="relative w-full max-w-sm">
          <div className="text-center mb-8">
            {/* Logo on transparent background when the tenant has one;
                otherwise fall back to a text wordmark so we never ship
                another tenant's PNG. */}
            {tenantLogo ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={tenantLogo}
                alt={tenantName}
                className="mx-auto mb-3 h-20 w-auto drop-shadow-lg"
              />
            ) : (
              <h2 className="text-2xl font-bold text-white tracking-tight drop-shadow-lg">{tenantName}</h2>
            )}
            <h1 className="text-2xl font-bold text-white mt-1">Doctor Portal</h1>
            <p className="text-cyan-100 text-sm mt-2">Sign in to view today&apos;s schedule</p>
          </div>
          <div className="bg-white/95 backdrop-blur-md rounded-2xl p-6 shadow-2xl space-y-4">
            {loginError && (
              <div className="flex items-start gap-2 bg-red-50 border border-red-100 text-red-700 text-sm rounded-xl px-3 py-2.5">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> {loginError}
              </div>
            )}
            {mfaChallenge ? (
              <>
                <div className="text-center">
                  <p className="text-xs uppercase tracking-wider font-semibold text-teal-600">Two-factor</p>
                  <p className="text-sm text-stone-700 mt-1">
                    Enter the 6-digit code from your authenticator app for{" "}
                    <span className="font-semibold">{mfaChallenge.email}</span>.
                  </p>
                </div>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  autoFocus
                  placeholder="123 456"
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))}
                  onKeyDown={(e) => e.key === "Enter" && handleMfaSubmit()}
                  className="w-full px-4 py-3 text-center text-xl tracking-[0.5em] font-mono bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none"
                  maxLength={6}
                />
                <button
                  onClick={handleMfaSubmit}
                  disabled={loginLoading || mfaCode.length !== 6}
                  className="w-full py-3.5 bg-gradient-to-r from-teal-600 to-cyan-600 text-white rounded-xl font-semibold text-sm active:scale-[0.98] transition-all disabled:opacity-50 shadow-md"
                >
                  {loginLoading ? "Verifying..." : "Verify"}
                </button>
                <button
                  type="button"
                  onClick={() => { setMfaChallenge(null); setMfaCode(""); setLoginError(""); }}
                  className="w-full text-xs text-stone-500 hover:text-stone-800"
                >
                  ← Use a different account
                </button>
              </>
            ) : (
              <>
                <div>
                  <label className="text-xs font-semibold text-stone-600 mb-1 block">Email</label>
                  <input type="email" placeholder="doctor@clinic.com" value={email} onChange={e => setEmail(e.target.value)}
                    className="w-full px-4 py-3 text-sm bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-stone-600 mb-1 block">Password</label>
                  <input type="password" placeholder="Enter password" value={password} onChange={e => setPassword(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && handleLogin()}
                    className="w-full px-4 py-3 text-sm bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none" />
                </div>
                <button onClick={handleLogin} disabled={loginLoading}
                  className="w-full py-3.5 bg-gradient-to-r from-teal-600 to-cyan-600 text-white rounded-xl font-semibold text-sm hover:from-teal-700 hover:to-cyan-700 active:scale-[0.98] transition-all disabled:opacity-50 shadow-md">
                  {loginLoading ? "Signing in..." : "Sign In"}
                </button>
              </>
            )}
          </div>
          <p className="text-center text-cyan-100 text-[11px] mt-6">
            Doctor / Admin access only
          </p>
        </div>
      </div>
    );
  }

  // ============================================================
  // CONSULTATION SCREEN
  // ============================================================
  if (screen === "consultation" && selectedPatient) {
    return (
      <div className="min-h-[100dvh] bg-[#FAFAF9] flex flex-col">
        <ToastStack toasts={toasts} />
        <div className="bg-white border-b border-stone-100 px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
          <button onClick={() => setScreen("patient-detail")} className="p-1.5 rounded-lg hover:bg-stone-100 active:bg-stone-200"><ArrowLeft className="w-5 h-5 text-stone-600" /></button>
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-bold text-stone-900 truncate">Consultation</h1>
            <p className="text-xs text-stone-500">{selectedPatient.firstName} {selectedPatient.lastName}</p>
          </div>
          <button onClick={saveConsultation} disabled={loading}
            className="px-4 py-2 bg-teal-600 text-white text-xs font-semibold rounded-xl active:scale-95 disabled:opacity-50">
            {loading ? "Saving..." : "Save"}
          </button>
        </div>

        {/* AI proposals — appear after a transcription extracts
            actionable items. Tap ✓ to apply (creates LabTest /
            FollowUp server-side, drops MEDICATION into rxItems for
            the prescribe screen) or ✕ to reject. Proposals carry
            the AISuggestion id so accept/reject route through the
            audit substrate. */}
        {aiProposals.length > 0 && (
          <div className="mx-4 mt-3 p-3 rounded-2xl bg-gradient-to-br from-violet-50 to-fuchsia-50 border border-violet-200">
            <p className="text-[10px] font-bold text-violet-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Sparkles className="w-3 h-3" /> AI proposals · review and apply
            </p>
            <div className="space-y-1.5">
              {aiProposals.map(chip => {
                const p = chip.payload as Record<string, unknown>;
                const label =
                  chip.kind === "MEDICATION"
                    ? `${(p.medicineName as string) || "Medicine"}${p.dosage ? ` · ${p.dosage}` : ""}${p.frequency ? ` · ${p.frequency}` : ""}${p.duration ? ` · ${p.duration}` : ""}`
                    : chip.kind === "LAB"
                    ? `${(p.testName as string) || "Lab"}${p.testCode ? ` (${p.testCode})` : ""}${p.indication ? ` — ${p.indication}` : ""}`
                    : `Follow-up in ${(p.days as number) ?? 14}d — ${(p.reason as string) || "review"}`;
                const tone =
                  chip.kind === "MEDICATION" ? "bg-indigo-100 text-indigo-800"
                  : chip.kind === "LAB" ? "bg-rose-100 text-rose-800"
                  : "bg-amber-100 text-amber-800";
                const kindLabel = chip.kind === "MEDICATION" ? "Rx" : chip.kind === "LAB" ? "Lab" : "F/U";
                return (
                  <div key={chip.id} className="bg-white rounded-xl border border-violet-100 p-2.5 flex items-start gap-2">
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${tone}`}>{kindLabel}</span>
                    <p className="text-xs text-stone-800 flex-1 min-w-0">{label}</p>
                    <button
                      onClick={() => acceptProposal(chip)}
                      className="text-[11px] font-semibold px-2 py-1 rounded-lg bg-emerald-600 text-white active:scale-95 shrink-0"
                    >
                      ✓
                    </button>
                    <button
                      onClick={() => rejectProposal(chip)}
                      className="text-[11px] font-semibold px-2 py-1 rounded-lg bg-stone-100 text-stone-500 active:scale-95 shrink-0"
                    >
                      ✕
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Templates row */}
        <div className="px-4 pt-3 pb-1">
          <p className="text-[10px] font-bold text-stone-400 uppercase tracking-wider mb-2 flex items-center gap-1"><Sparkles className="w-3 h-3" /> Templates</p>
          <div className="flex gap-2 overflow-x-auto -mx-4 px-4 pb-2" style={{ scrollbarWidth: "none" }}>
            {NOTE_TEMPLATES.map((t, i) => (
              <button key={t.label} onClick={() => applyNoteTemplate(i)}
                className="shrink-0 px-3 py-1.5 bg-white border border-stone-200 rounded-full text-xs font-medium text-stone-700 active:bg-stone-100 whitespace-nowrap">
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 px-4 py-2 space-y-4 overflow-y-auto pb-28">
          {[
            { key: "complaint", label: "Chief Complaint", placeholder: "What brings the patient in today?" },
            { key: "examination", label: "Examination", placeholder: "Physical examination findings..." },
            { key: "diagnosis", label: "Diagnosis", placeholder: "Primary diagnosis..." },
            { key: "plan", label: "Treatment Plan", placeholder: "Recommended treatment plan..." },
            { key: "advice", label: "Patient Advice", placeholder: "Instructions for the patient..." },
            { key: "internal", label: "Internal Notes", placeholder: "Private notes (not shared with patient)..." },
          ].map(f => (
            <div key={f.key}>
              <label className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-1.5 block">{f.label}</label>
              <textarea
                value={consultNote[f.key as keyof typeof consultNote]}
                onChange={e => setConsultNote({ ...consultNote, [f.key]: e.target.value })}
                placeholder={f.placeholder}
                rows={3}
                className="w-full px-4 py-3 text-sm bg-white border border-stone-200 rounded-xl outline-none focus:border-teal-500 resize-none"
              />
              {f.key === "diagnosis" && (
                <Icd10Picker selected={icdCodes} onChange={setIcdCodes} />
              )}
            </div>
          ))}
        </div>

        {/* Floating dictation button */}
        <button
          onPointerDown={e => { e.preventDefault(); if (!isTranscribing) startRecording("consult"); }}
          onPointerUp={() => { if (isRecording) stopRecording(); }}
          onPointerLeave={() => { if (isRecording) stopRecording(); }}
          disabled={isTranscribing}
          className={`fixed right-5 bottom-6 w-14 h-14 rounded-full shadow-lg flex items-center justify-center z-20 transition-all ${
            isRecording ? "bg-red-500 scale-110" : isTranscribing ? "bg-stone-400" : "bg-teal-600 active:scale-95"
          }`}
          style={isRecording ? { boxShadow: `0 0 0 ${6 + audioLevel * 12}px rgba(239,68,68,${0.15 + audioLevel * 0.25})` } : undefined}
          title="Hold to dictate"
        >
          {isTranscribing ? <RefreshCw className="w-6 h-6 text-white animate-spin" /> :
            isRecording ? <Square className="w-6 h-6 text-white fill-white" /> :
            <Mic className="w-6 h-6 text-white" />}
        </button>
        {(isRecording || isTranscribing) && (
          <div className="fixed right-5 bottom-24 bg-stone-900 text-white text-xs rounded-xl px-3 py-2 shadow-lg z-20">
            {isRecording ? "Recording… release to transcribe" : "Transcribing…"}
          </div>
        )}
      </div>
    );
  }

  // ============================================================
  // VOICE NOTE SCREEN (standalone)
  // ============================================================
  if (screen === "voice-note" && selectedPatient) {
    return (
      <div className="min-h-[100dvh] bg-[#FAFAF9] flex flex-col">
        <ToastStack toasts={toasts} />
        <div className="bg-white border-b border-stone-100 px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
          <button onClick={() => { if (isRecording) stopRecording(); setScreen("patient-detail"); }}
            className="p-1.5 rounded-lg hover:bg-stone-100"><ArrowLeft className="w-5 h-5 text-stone-600" /></button>
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-bold text-stone-900 truncate">Voice Note</h1>
            <p className="text-xs text-stone-500">{selectedPatient.firstName} {selectedPatient.lastName}</p>
          </div>
          <button onClick={saveVoiceNote} disabled={loading || !voiceText.trim()}
            className="px-4 py-2 bg-teal-600 text-white text-xs font-semibold rounded-xl active:scale-95 disabled:opacity-50">
            {loading ? "Saving..." : "Save"}
          </button>
        </div>

        {/* Tag selector */}
        <div className="px-4 pt-3">
          <p className="text-[10px] font-bold text-stone-400 uppercase tracking-wider mb-2">Tag as</p>
          <div className="flex gap-2">
            {(["observation", "plan", "progress"] as const).map(t => (
              <button key={t} onClick={() => setVoiceTag(t)}
                className={`flex-1 py-2 text-xs font-semibold rounded-xl transition-colors ${
                  voiceTag === t ? "bg-teal-600 text-white" : "bg-white border border-stone-200 text-stone-600"
                }`}>
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Big record button + waveform */}
        <div className="px-4 py-6 flex flex-col items-center">
          <button
            onClick={() => {
              if (!toggleRecord) { setToggleRecord(true); startRecording("note"); }
              else { setToggleRecord(false); stopRecording(); }
            }}
            disabled={isTranscribing}
            className={`relative w-28 h-28 rounded-full flex items-center justify-center shadow-xl transition-all ${
              isRecording ? "bg-red-500" : isTranscribing ? "bg-stone-400" : "bg-teal-600 active:scale-95"
            }`}
            style={isRecording ? { boxShadow: `0 0 0 ${10 + audioLevel * 30}px rgba(239,68,68,${0.1 + audioLevel * 0.3})` } : undefined}
          >
            {isTranscribing ? <RefreshCw className="w-10 h-10 text-white animate-spin" /> :
              isRecording ? <Square className="w-10 h-10 text-white fill-white" /> :
              <Mic className="w-10 h-10 text-white" />}
          </button>
          <p className="text-xs text-stone-500 mt-3 text-center">
            {isTranscribing ? "Transcribing…" :
             isRecording ? "Tap again to stop" :
             "Tap to start recording"}
          </p>
          {/* Waveform bars */}
          {isRecording && (
            <div className="flex items-end gap-1 h-10 mt-3">
              {[0, 1, 2, 3, 4, 5, 6, 7].map(i => {
                const h = Math.max(4, Math.min(40, audioLevel * 40 * (0.5 + 0.5 * Math.sin(Date.now() / 100 + i))));
                return <div key={i} className="w-1.5 bg-red-500 rounded-full" style={{ height: h }} />;
              })}
            </div>
          )}
        </div>

        {/* Editable transcript */}
        <div className="flex-1 px-4 pb-20">
          <label className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-1.5 block">Note</label>
          <textarea
            value={voiceText}
            onChange={e => setVoiceText(e.target.value)}
            placeholder="Record, or type the note here. Tap Save when done."
            rows={8}
            className="w-full px-4 py-3 text-sm bg-white border border-stone-200 rounded-xl outline-none focus:border-teal-500 resize-none"
          />
          <p className="text-[10px] text-stone-400 mt-2">
            Saved as a consultation note. You can also type or edit the transcript before saving.
          </p>
        </div>
      </div>
    );
  }

  // ============================================================
  // LAB ORDER SCREEN
  // ============================================================
  if (screen === "lab" && selectedPatient) {
    const toggleLab = (preset: typeof LAB_PRESETS[number]) => {
      setLabSelected(prev => prev.find(l => l.name === preset.name)
        ? prev.filter(l => l.name !== preset.name)
        : [...prev, preset]);
    };
    return (
      <div className="min-h-[100dvh] bg-[#FAFAF9] flex flex-col">
        <ToastStack toasts={toasts} />
        <div className="bg-white border-b border-stone-100 px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
          <button onClick={() => setScreen("patient-detail")} className="p-1.5 rounded-lg hover:bg-stone-100"><ArrowLeft className="w-5 h-5 text-stone-600" /></button>
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-bold text-stone-900 truncate">Order Labs</h1>
            <p className="text-xs text-stone-500">{selectedPatient.firstName} {selectedPatient.lastName}</p>
          </div>
          <button onClick={orderLabs} disabled={loading || (labSelected.length === 0 && !labCustom.trim())}
            className="px-4 py-2 bg-teal-600 text-white text-xs font-semibold rounded-xl active:scale-95 disabled:opacity-50">
            {loading ? "Ordering..." : `Order (${labSelected.length + (labCustom.trim() ? 1 : 0)})`}
          </button>
        </div>
        <div className="flex-1 px-4 py-4 space-y-4 overflow-y-auto pb-20">
          <div>
            <p className="text-xs font-bold text-stone-400 uppercase tracking-wider mb-2">Priority</p>
            <div className="flex gap-2">
              {(["NORMAL", "URGENT", "EMERGENCY"] as const).map(p => (
                <button key={p} onClick={() => setLabPriority(p)}
                  className={`flex-1 py-2 text-xs font-semibold rounded-xl transition-colors ${
                    labPriority === p ? (p === "EMERGENCY" ? "bg-red-600 text-white" : p === "URGENT" ? "bg-amber-500 text-white" : "bg-teal-600 text-white")
                                      : "bg-white border border-stone-200 text-stone-600"
                  }`}>
                  {p.charAt(0) + p.slice(1).toLowerCase()}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-bold text-stone-400 uppercase tracking-wider mb-2">Common tests</p>
            <div className="space-y-2">
              {LAB_PRESETS.map(preset => {
                const on = labSelected.some(l => l.name === preset.name);
                return (
                  <button key={preset.name} onClick={() => toggleLab(preset)}
                    className={`w-full flex items-center gap-3 rounded-xl p-3 text-left transition-colors ${
                      on ? "bg-teal-50 border-2 border-teal-500" : "bg-white border border-stone-200"
                    }`}>
                    <div className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 ${
                      on ? "bg-teal-600 text-white" : "border-2 border-stone-300"
                    }`}>
                      {on && <Check className="w-3 h-3" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-stone-900">{preset.name}</p>
                      {preset.note && <p className="text-[11px] text-stone-500">{preset.note}</p>}
                    </div>
                    {preset.code && <span className="text-[10px] font-mono text-stone-400 shrink-0">{preset.code}</span>}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-stone-400 uppercase tracking-wider mb-2 block">Custom test</label>
            <input value={labCustom} onChange={e => setLabCustom(e.target.value)} placeholder="e.g. RFT, Vitamin D..."
              className="w-full px-4 py-3 text-sm bg-white border border-stone-200 rounded-xl outline-none focus:border-teal-500" />
          </div>
        </div>
      </div>
    );
  }

  // ============================================================
  // FOLLOW-UP SCREEN
  // ============================================================
  if (screen === "follow-up" && selectedPatient) {
    const dueDate = new Date(Date.now() + followDays * 86400000);
    return (
      <div className="min-h-[100dvh] bg-[#FAFAF9] flex flex-col">
        <ToastStack toasts={toasts} />
        <div className="bg-white border-b border-stone-100 px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
          <button onClick={() => setScreen("patient-detail")} className="p-1.5 rounded-lg hover:bg-stone-100"><ArrowLeft className="w-5 h-5 text-stone-600" /></button>
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-bold text-stone-900 truncate">Schedule Follow-up</h1>
            <p className="text-xs text-stone-500">{selectedPatient.firstName} {selectedPatient.lastName}</p>
          </div>
          <button onClick={scheduleFollowUp} disabled={loading || !followReason.trim()}
            className="px-4 py-2 bg-teal-600 text-white text-xs font-semibold rounded-xl active:scale-95 disabled:opacity-50">
            {loading ? "Scheduling..." : "Schedule"}
          </button>
        </div>
        <div className="flex-1 px-4 py-4 space-y-4 overflow-y-auto pb-20">
          <div>
            <p className="text-xs font-bold text-stone-400 uppercase tracking-wider mb-2">Review in</p>
            <div className="grid grid-cols-5 gap-2">
              {FOLLOWUP_PRESETS.map(p => (
                <button key={p.label} onClick={() => setFollowDays(p.days)}
                  className={`py-2 text-[11px] font-semibold rounded-xl transition-colors ${
                    followDays === p.days ? "bg-teal-600 text-white" : "bg-white border border-stone-200 text-stone-600"
                  }`}>
                  {p.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-stone-500 mt-2">
              Due: <span className="font-medium text-stone-800">{dueDate.toLocaleDateString("en-PK", { timeZone: CLINIC_TZ, weekday: "long", year: "numeric", month: "short", day: "numeric" })}</span>
            </p>
          </div>

          <div>
            <label className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-1.5 block">Reason *</label>
            <input value={followReason} onChange={e => setFollowReason(e.target.value)}
              placeholder="e.g. Acne review, Post-biopsy check, Treatment response"
              className="w-full px-4 py-3 text-sm bg-white border border-stone-200 rounded-xl outline-none focus:border-teal-500" />
          </div>

          <div>
            <label className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-1.5 block">Notes</label>
            <textarea value={followNotes} onChange={e => setFollowNotes(e.target.value)}
              placeholder="Anything to check or prepare..." rows={3}
              className="w-full px-4 py-3 text-sm bg-white border border-stone-200 rounded-xl outline-none focus:border-teal-500 resize-none" />
          </div>
        </div>
      </div>
    );
  }

  // ============================================================
  // PRESCRIPTION SCREEN
  // ============================================================
  if (screen === "prescribe" && selectedPatient) {
    return (
      <div className="min-h-[100dvh] bg-[#FAFAF9] flex flex-col">
        <ToastStack toasts={toasts} />
        <div className="bg-white border-b border-stone-100 px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
          <button onClick={() => setScreen("patient-detail")} className="p-1.5 rounded-lg hover:bg-stone-100"><ArrowLeft className="w-5 h-5 text-stone-600" /></button>
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-bold text-stone-900 truncate">Prescribe</h1>
            <p className="text-xs text-stone-500">{selectedPatient.firstName} {selectedPatient.lastName}</p>
          </div>
          <button onClick={savePrescription} disabled={loading || rxItems.every(i => !i.name.trim())}
            className="px-4 py-2 bg-teal-600 text-white text-xs font-semibold rounded-xl active:scale-95 disabled:opacity-50">
            {loading ? "Saving..." : "Save Rx"}
          </button>
        </div>

        {/* Rx kit templates */}
        <div className="px-4 pt-3 pb-1">
          <p className="text-[10px] font-bold text-stone-400 uppercase tracking-wider mb-2 flex items-center gap-1"><Sparkles className="w-3 h-3" /> Rx Kits</p>
          <div className="flex gap-2 overflow-x-auto -mx-4 px-4 pb-2" style={{ scrollbarWidth: "none" }}>
            {Object.keys(RX_TEMPLATES).map(k => (
              <button key={k} onClick={() => openRxTemplate(k)}
                className="shrink-0 px-3 py-1.5 bg-white border border-stone-200 rounded-full text-xs font-medium text-stone-700 active:bg-stone-100 whitespace-nowrap">
                {k}
              </button>
            ))}
          </div>
        </div>

        {/* Drug-guard warnings — derived from the current rxItems
            against patient.allergies / gender / active meds. Danger
            tier blocks save until acknowledged; warning tier is
            informational. Banner re-renders live as the doctor
            edits items. */}
        <RxGuardBanner
          warnings={checkRxGuards(
            rxItems.filter(i => i.name.trim()).map(i => ({ name: i.name, route: i.route })),
            { gender: selectedPatient.gender, allergies: selectedPatient.allergies, medications: selectedPatient.medications },
          )}
          ackedIds={ackedGuards}
          onAcknowledge={(id) => setAckedGuards(prev => { const n = new Set(prev); n.add(id); return n; })}
        />

        {/* Allergy banner */}
        {selectedPatient.allergies && selectedPatient.allergies.length > 0 && (
          <div className="mx-4 mb-2 bg-red-50 border border-red-200 rounded-xl p-3 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <div className="text-xs">
              <p className="font-bold text-red-700">Allergies</p>
              <p className="text-red-600">{selectedPatient.allergies.map(a => a.allergen).join(", ")}</p>
            </div>
          </div>
        )}

        <div className="flex-1 px-4 py-2 space-y-4 overflow-y-auto pb-20">
          {rxItems.map((item, idx) => {
            const linked = item.productId ? pharmacy.find((p) => p.id === item.productId) : null;
            const q = item.name.trim().toLowerCase();
            // Show all pharmacy items on focus (no query); filter once
            // the doctor starts typing. Limit to 8 so the dropdown
            // doesn't overflow on small screens.
            const matches = (q
              ? pharmacy.filter(
                  (p) =>
                    p.name.toLowerCase().includes(q) ||
                    (p.brand || "").toLowerCase().includes(q) ||
                    (p.sku || "").toLowerCase().includes(q),
                )
              : pharmacy
            ).slice(0, 8);
            return (
              <div key={idx} className="bg-white rounded-2xl border border-stone-100 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-stone-400">Med #{idx + 1}</span>
                    {linked && (
                      <span className={
                        "inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full " +
                        (linked.quantity === 0 ? "bg-red-50 text-red-700"
                          : linked.quantity <= 5 ? "bg-amber-50 text-amber-700"
                          : "bg-emerald-50 text-emerald-700")
                      }>
                        <Package className="w-2.5 h-2.5" />
                        {linked.quantity === 0 ? "Out of stock" : `${linked.quantity} ${linked.unit || "pcs"}`}
                      </span>
                    )}
                    {item.name && !linked && (
                      <span className="inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-stone-100 text-stone-600">
                        Custom
                      </span>
                    )}
                  </div>
                  {rxItems.length > 1 && (
                    <button onClick={() => setRxItems(rxItems.filter((_, i) => i !== idx))} className="text-xs text-red-500 font-medium">Remove</button>
                  )}
                </div>
                <div className="relative">
                  <input placeholder="Medicine name *" value={item.name}
                    onChange={e => {
                      const v = e.target.value;
                      // Free-text typing — clear any prior pharmacy
                      // link so the stock pill doesn't lie about a
                      // different product.
                      setRxItems(prev => prev.map((r, i) => i === idx ? { ...r, name: v, productId: null } : r));
                      setMedAutocompleteIdx(idx);
                    }}
                    onFocus={() => setMedAutocompleteIdx(idx)}
                    onBlur={() => setTimeout(() => setMedAutocompleteIdx(null), 200)}
                    className="w-full px-3 py-2.5 text-sm bg-stone-50 border border-stone-200 rounded-xl outline-none focus:border-teal-500" />
                  {medAutocompleteIdx === idx && pharmacy.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-stone-200 rounded-xl shadow-lg z-20 max-h-72 overflow-y-auto">
                      <div className="px-3 py-1.5 bg-stone-50 border-b border-stone-100 text-[10px] uppercase tracking-wider text-stone-400 font-semibold sticky top-0">
                        Pharmacy
                      </div>
                      {matches.length === 0 ? (
                        <div className="px-3 py-3 text-xs text-stone-400 text-center">
                          No pharmacy match — &ldquo;{item.name}&rdquo; will save as custom.
                        </div>
                      ) : matches.map((p) => {
                        const out = p.quantity === 0;
                        const low = p.quantity > 0 && p.quantity <= 5;
                        return (
                          <button
                            key={p.id}
                            onMouseDown={e => e.preventDefault()}
                            onClick={() => pickPharmacyItem(idx, p)}
                            className="w-full text-left px-3 py-2.5 hover:bg-stone-50 active:bg-stone-100 border-b border-stone-50 last:border-b-0 flex items-center justify-between gap-2"
                          >
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-stone-900 truncate">
                                {p.name}{p.brand ? <span className="text-stone-500 font-normal"> · {p.brand}</span> : null}
                              </p>
                              <p className="text-[10px] text-stone-400 uppercase tracking-wider">
                                {p.sku || "—"}{p.category ? ` · ${p.category.toLowerCase()}` : ""}
                              </p>
                            </div>
                            <span className={
                              "text-[10px] font-semibold shrink-0 px-1.5 py-0.5 rounded " +
                              (out ? "bg-red-50 text-red-600" : low ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700")
                            }>
                              {out ? "Out" : `${p.quantity}`}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {medAutocompleteIdx === idx && pharmacy.length === 0 && item.name.length === 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-stone-200 rounded-xl shadow z-20 px-3 py-3 text-xs text-stone-400 text-center">
                      Pharmacy empty — type any medicine name.
                    </div>
                  )}
                </div>
              <div className="grid grid-cols-2 gap-2">
                <input placeholder="Dosage (e.g., 500mg)" value={item.dosage} onChange={e => { const n = [...rxItems]; n[idx].dosage = e.target.value; setRxItems(n); }}
                  className="px-3 py-2.5 text-sm bg-stone-50 border border-stone-200 rounded-xl outline-none focus:border-teal-500" />
                <select value={item.frequency} onChange={e => { const n = [...rxItems]; n[idx].frequency = e.target.value; setRxItems(n); }}
                  className="px-3 py-2.5 text-sm bg-stone-50 border border-stone-200 rounded-xl outline-none focus:border-teal-500">
                  <option value="OD">OD (Once daily)</option>
                  <option value="BD">BD (Twice daily)</option>
                  <option value="TDS">TDS (3x daily)</option>
                  <option value="QDS">QDS (4x daily)</option>
                  <option value="PRN">PRN (As needed)</option>
                  <option value="STAT">STAT (Immediately)</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <select value={item.duration} onChange={e => { const n = [...rxItems]; n[idx].duration = e.target.value; setRxItems(n); }}
                  className="px-3 py-2.5 text-sm bg-stone-50 border border-stone-200 rounded-xl outline-none focus:border-teal-500">
                  <option value="3 days">3 days</option><option value="5 days">5 days</option>
                  <option value="7 days">7 days</option><option value="10 days">10 days</option>
                  <option value="14 days">14 days</option><option value="1 month">1 month</option>
                  <option value="3 months">3 months</option><option value="Ongoing">Ongoing</option>
                </select>
                <select value={item.route} onChange={e => { const n = [...rxItems]; n[idx].route = e.target.value; setRxItems(n); }}
                  className="px-3 py-2.5 text-sm bg-stone-50 border border-stone-200 rounded-xl outline-none focus:border-teal-500">
                  <option value="Oral">Oral</option><option value="Topical">Topical</option>
                  <option value="IV">IV</option><option value="IM">IM</option>
                  <option value="Sublingual">Sublingual</option><option value="Inhaled">Inhaled</option>
                </select>
              </div>
            </div>
            );
          })}
          <button onClick={() => setRxItems([...rxItems, { ...EMPTY_RX_ITEM }])}
            className="w-full py-3 border-2 border-dashed border-stone-200 rounded-2xl text-sm font-medium text-stone-500 active:bg-stone-50 flex items-center justify-center gap-2">
            <Plus className="w-4 h-4" /> Add Medicine
          </button>
          <div>
            <label className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-1.5 block">Notes</label>
            <textarea value={rxNotes} onChange={e => setRxNotes(e.target.value)} placeholder="Additional instructions..."
              rows={2} className="w-full px-4 py-3 text-sm bg-white border border-stone-200 rounded-xl outline-none focus:border-teal-500 resize-none" />
          </div>
        </div>

        {/* Rx-kit confirmation overlay. Doctor sees the full kit
            with one tap-target per medicine; defaults to all checked
            so a "trust the kit" tap is still one extra confirm-step,
            but the doctor can also uncheck unwanted items (e.g.
            isotretinoin for a pregnant patient) before applying. */}
        {kitPreview && (
          <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-4" onClick={() => setKitPreview(null)}>
            <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-2xl w-full max-w-md max-h-[85vh] flex flex-col shadow-2xl">
              <div className="px-5 pt-5 pb-3 border-b border-stone-100">
                <p className="text-[10px] font-bold text-stone-400 uppercase tracking-wider flex items-center gap-1">
                  <Sparkles className="w-3 h-3" /> Confirm Rx kit
                </p>
                <h2 className="text-lg font-bold text-stone-900 mt-0.5">{kitPreview.key}</h2>
                <p className="text-xs text-stone-500 mt-0.5">
                  Review each medicine before adding. Uncheck any you don&apos;t want to prescribe.
                </p>
                {/* Allergy banner inside the modal too — doctor
                    might tap "Eczema" without realizing the patient
                    is allergic to one of its components. */}
                {selectedPatient?.allergies && selectedPatient.allergies.length > 0 && (
                  <div className="mt-2.5 bg-red-50 border border-red-200 rounded-xl px-3 py-2 flex items-start gap-2">
                    <AlertTriangle className="w-3.5 h-3.5 text-red-600 shrink-0 mt-0.5" />
                    <p className="text-[11px] text-red-700">
                      <span className="font-bold">Allergies:</span> {selectedPatient.allergies.map((a) => a.allergen).join(", ")}
                    </p>
                  </div>
                )}
              </div>

              <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2">
                {kitPreview.items.map((m, i) => {
                  const linked = pharmacy.find((p) => p.name.toLowerCase() === m.name.toLowerCase());
                  const out = linked && linked.quantity === 0;
                  const low = linked && linked.quantity > 0 && linked.quantity <= 5;
                  return (
                    <label
                      key={i}
                      className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                        kitPreview.checked[i]
                          ? "border-teal-200 bg-teal-50/50"
                          : "border-stone-200 bg-stone-50 opacity-60"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={kitPreview.checked[i]}
                        onChange={(e) => {
                          const next = [...kitPreview.checked];
                          next[i] = e.target.checked;
                          setKitPreview({ ...kitPreview, checked: next });
                        }}
                        className="w-4 h-4 mt-0.5 accent-teal-600 cursor-pointer"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="text-sm font-semibold text-stone-900">{m.name}</p>
                          {linked ? (
                            <span className={
                              "text-[10px] font-semibold px-1.5 py-0.5 rounded-full inline-flex items-center gap-1 " +
                              (out ? "bg-red-50 text-red-700" : low ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700")
                            }>
                              <Package className="w-2.5 h-2.5" />
                              {out ? "Out" : `${linked.quantity} ${linked.unit || "pcs"}`}
                            </span>
                          ) : (
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-stone-100 text-stone-500">
                              Not in pharmacy
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-stone-500 mt-0.5">
                          {[m.dosage, m.frequency, m.duration, m.route].filter(Boolean).join(" · ")}
                        </p>
                      </div>
                    </label>
                  );
                })}
              </div>

              <div className="px-5 py-3 border-t border-stone-100 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const allOn = kitPreview.checked.every(Boolean);
                    setKitPreview({ ...kitPreview, checked: kitPreview.items.map(() => !allOn) });
                  }}
                  className="text-xs font-medium text-stone-500 hover:text-stone-800 px-2 py-2"
                >
                  {kitPreview.checked.every(Boolean) ? "Uncheck all" : "Check all"}
                </button>
                <div className="flex-1" />
                <button
                  type="button"
                  onClick={() => setKitPreview(null)}
                  className="px-4 py-2 rounded-xl text-sm font-medium text-stone-600 bg-stone-100 active:bg-stone-200"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmKitPreview}
                  disabled={kitPreview.checked.every((c) => !c)}
                  className="px-4 py-2 rounded-xl text-sm font-semibold text-white bg-teal-600 active:bg-teal-700 disabled:opacity-50"
                >
                  Apply ({kitPreview.checked.filter(Boolean).length})
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ============================================================
  // TEAM CHAT SCREEN — multi-doctor collaboration threads
  // ============================================================
  if (screen === "team" && selectedPatient) {
    const activeThread = threads.find((t) => t.id === activeThreadId) || null;
    const allComments = activeThread?.comments ?? [];
    return (
      <div className="min-h-[100dvh] bg-[#FAFAF9] flex flex-col">
        <ToastStack toasts={toasts} />
        <div className="bg-white border-b border-stone-100 px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
          <button onClick={() => setScreen("patient-detail")} className="p-1.5 rounded-lg hover:bg-stone-100">
            <ArrowLeft className="w-5 h-5 text-stone-600" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-bold text-stone-900 truncate">Team chat</h1>
            <p className="text-xs text-stone-500 truncate">
              {selectedPatient.firstName} {selectedPatient.lastName} · @ to ping a colleague
            </p>
          </div>
        </div>

        {/* Thread switcher (only if 2+ threads) */}
        {threads.length > 1 && (
          <div className="bg-white border-b border-stone-100 px-4 py-2 sticky top-[57px] z-10">
            <div className="flex gap-2 overflow-x-auto -mx-4 px-4 pb-1" style={{ scrollbarWidth: "none" }}>
              {threads.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setActiveThreadId(t.id)}
                  className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap ${
                    activeThreadId === t.id
                      ? "bg-cyan-600 text-white"
                      : "bg-stone-100 text-stone-600 active:bg-stone-200"
                  }`}
                >
                  {t.title || `Thread #${t.id.slice(0, 4)}`}
                  {t.comments.length > 0 && <span className="opacity-60 ml-1">· {t.comments.length}</span>}
                </button>
              ))}
              <button
                onClick={() => setActiveThreadId(null)}
                className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap ${
                  activeThreadId === null
                    ? "bg-stone-900 text-white"
                    : "bg-stone-100 text-stone-600 active:bg-stone-200"
                }`}
              >
                + New
              </button>
            </div>
          </div>
        )}

        <div className="flex-1 px-4 py-3 space-y-3 overflow-y-auto pb-32">
          {threads.length === 0 ? (
            <div className="text-center py-12">
              <MessageSquare className="w-10 h-10 text-stone-300 mx-auto mb-3" />
              <p className="text-sm text-stone-500">No threads yet.</p>
              <p className="text-xs text-stone-400 mt-1">Start one by typing below — it&apos;ll be created on send.</p>
            </div>
          ) : !activeThread ? (
            <p className="text-center text-xs text-stone-400 py-8">New thread — type below to send the first message.</p>
          ) : allComments.length === 0 ? (
            <p className="text-center text-xs text-stone-400 py-8">No messages in this thread yet.</p>
          ) : (
            allComments.map((c) => {
              const isMe = c.author.id === user?.id;
              return (
                <div key={c.id} className={`flex gap-2 ${isMe ? "flex-row-reverse" : ""}`}>
                  <div className="w-8 h-8 rounded-full bg-cyan-100 flex items-center justify-center text-cyan-700 font-bold text-xs shrink-0">
                    {(c.author.name || "?").split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase()}
                  </div>
                  <div className={`max-w-[75%] ${isMe ? "items-end" : "items-start"} flex flex-col gap-0.5`}>
                    <p className="text-[10px] text-stone-500 px-1">
                      {c.author.name} · {new Date(c.createdAt).toLocaleTimeString("en-PK", { timeZone: CLINIC_TZ, hour: "2-digit", minute: "2-digit", hour12: true })}
                    </p>
                    <div className={`rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap break-words ${
                      isMe ? "bg-cyan-600 text-white" : "bg-white border border-stone-200 text-stone-800"
                    }`}>
                      {renderBodyWithMentions(c.body)}
                    </div>
                    {c.mentions.length > 0 && (
                      <p className={`text-[10px] ${isMe ? "text-cyan-700" : "text-stone-400"} px-1`}>
                        Mentioned: {c.mentions.map((m) => m.user.name).join(", ")}
                      </p>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Composer pinned bottom */}
        <div className="bg-white border-t border-stone-100 px-3 py-2 sticky bottom-0">
          <div className="flex items-end gap-2">
            <textarea
              value={threadInput}
              onChange={(e) => setThreadInput(e.target.value)}
              placeholder="Message your colleagues. @firstname to ping."
              rows={2}
              className="flex-1 px-3 py-2 text-sm bg-stone-50 border border-stone-200 rounded-2xl resize-none focus:outline-none focus:ring-2 focus:ring-cyan-500"
            />
            <button
              onClick={sendThreadComment}
              disabled={loading || !threadInput.trim()}
              className="p-2.5 rounded-xl bg-cyan-600 text-white active:scale-95 disabled:opacity-50 shrink-0"
              title="Send"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ============================================================
  // PROCEDURE SCREEN — protocol-driven procedure capture
  // ============================================================
  if (screen === "procedure" && selectedPatient) {
    const proto = selectedProtocolId ? protocols.find((p) => p.id === selectedProtocolId) || null : null;
    return (
      <div className="min-h-[100dvh] bg-[#FAFAF9] flex flex-col">
        <ToastStack toasts={toasts} />
        <div className="bg-white border-b border-stone-100 px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
          <button onClick={() => setScreen("patient-detail")} className="p-1.5 rounded-lg hover:bg-stone-100">
            <ArrowLeft className="w-5 h-5 text-stone-600" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-bold text-stone-900 truncate">Procedure</h1>
            <p className="text-xs text-stone-500 truncate">{selectedPatient.firstName} {selectedPatient.lastName}</p>
          </div>
          <button
            onClick={saveProcedure}
            disabled={loading || (!selectedProtocolId && !procTreatmentId)}
            className="px-4 py-2 bg-teal-600 text-white text-xs font-semibold rounded-xl active:scale-95 disabled:opacity-50"
          >
            {loading ? "Saving..." : "Record"}
          </button>
        </div>

        <div className="flex-1 px-4 py-3 space-y-4 overflow-y-auto pb-20">
          {/* Protocol picker */}
          <div>
            <p className="text-[10px] font-bold text-stone-400 uppercase tracking-wider mb-2 flex items-center gap-1">
              <Sparkles className="w-3 h-3" /> Protocol ({protocols.length})
            </p>
            {protocols.length === 0 ? (
              <p className="text-xs text-stone-400 italic">
                No protocols yet — add some at <span className="font-mono">/admin/procedure-protocols</span> on the desktop.
                You can also record a procedure without a protocol; pass a treatmentId below.
              </p>
            ) : (
              <div className="flex gap-2 overflow-x-auto -mx-4 px-4 pb-2" style={{ scrollbarWidth: "none" }}>
                <button
                  onClick={() => applyProtocol(null)}
                  className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap border ${
                    selectedProtocolId === null
                      ? "bg-stone-900 text-white border-stone-900"
                      : "bg-white text-stone-700 border-stone-200"
                  }`}
                >
                  None (manual)
                </button>
                {protocols.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => applyProtocol(p.id)}
                    className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap border ${
                      selectedProtocolId === p.id
                        ? "bg-pink-600 text-white border-pink-600"
                        : "bg-white text-stone-700 border-stone-200"
                    }`}
                  >
                    {p.name}
                    {p.treatment && <span className="opacity-60 ml-1">· {p.treatment.name}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Allergy banner — same red rail used elsewhere */}
          {selectedPatient.allergies && selectedPatient.allergies.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <div className="text-xs">
                <p className="font-bold text-red-700">Allergies</p>
                <p className="text-red-600">{selectedPatient.allergies.map((a) => a.allergen).join(", ")}</p>
              </div>
            </div>
          )}

          {/* Consent + checklist of required photos */}
          {proto && (
            <>
              {proto.consentTemplate && (
                <div className="bg-white rounded-2xl border border-stone-200 p-4">
                  <p className="text-[10px] font-bold text-stone-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                    <FileText className="w-3 h-3" /> Patient consent
                  </p>
                  <p className="text-xs text-stone-700 whitespace-pre-wrap leading-relaxed">{proto.consentTemplate}</p>
                  <label className="mt-3 flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={procConsent}
                      onChange={(e) => setProcConsent(e.target.checked)}
                      className="w-4 h-4 mt-0.5 accent-teal-600 cursor-pointer"
                    />
                    <span className="text-xs text-stone-700">
                      I confirm the patient has read and signed the consent above. Witness:{" "}
                      <span className="font-medium">{user?.name}</span>
                    </span>
                  </label>
                </div>
              )}

              {(proto.requiredBeforePhotos.length > 0 || proto.requiredAfterPhotos.length > 0) && (
                <div className="bg-white rounded-2xl border border-stone-200 p-4">
                  <p className="text-[10px] font-bold text-stone-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                    <Camera className="w-3 h-3" /> Required photo angles
                  </p>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <p className="font-semibold text-amber-700 mb-1">Before</p>
                      <ul className="space-y-0.5 text-stone-700">
                        {proto.requiredBeforePhotos.map((angle) => (
                          <li key={"b-" + angle} className="flex items-center gap-1.5">
                            <span className="w-1 h-1 rounded-full bg-amber-500" /> {angle}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <p className="font-semibold text-emerald-700 mb-1">After</p>
                      <ul className="space-y-0.5 text-stone-700">
                        {proto.requiredAfterPhotos.map((angle) => (
                          <li key={"a-" + angle} className="flex items-center gap-1.5">
                            <span className="w-1 h-1 rounded-full bg-emerald-500" /> {angle}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                  <p className="text-[10px] text-stone-400 mt-2">
                    Capture photos via the patient profile&apos;s + Before / + After buttons before saving.
                  </p>
                </div>
              )}

              {proto.aftercareInstructions && (
                <div className="bg-white rounded-2xl border border-stone-200 p-4">
                  <p className="text-[10px] font-bold text-stone-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                    <FileText className="w-3 h-3" /> Aftercare (printed for patient)
                  </p>
                  <p className="text-xs text-stone-700 whitespace-pre-wrap leading-relaxed">{proto.aftercareInstructions}</p>
                </div>
              )}
            </>
          )}

          {/* Free-form fields — areas treated + machine settings + notes */}
          <div className="bg-white rounded-2xl border border-stone-100 p-4 space-y-3">
            <div>
              <label className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-1 block">
                Areas treated (comma-separated)
              </label>
              <input
                type="text"
                value={procAreas}
                onChange={(e) => setProcAreas(e.target.value)}
                placeholder="e.g. Forehead, Cheeks, Chin"
                className="w-full px-3 py-2 text-sm bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-1 block">
                Machine settings (JSON object)
              </label>
              <textarea
                value={procSettingsText}
                onChange={(e) => setProcSettingsText(e.target.value)}
                rows={3}
                placeholder='{"laserPower": 12, "spotSize": 5}'
                className="w-full px-3 py-2 text-xs font-mono bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-1 block">
                Notes
              </label>
              <textarea
                value={procNotes}
                onChange={(e) => setProcNotes(e.target.value)}
                rows={2}
                placeholder="Anything relevant about this session"
                className="w-full px-3 py-2 text-sm bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
            {!proto && (
              <div>
                <label className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-1 block">
                  Treatment ID (manual mode)
                </label>
                <input
                  type="text"
                  value={procTreatmentId}
                  onChange={(e) => setProcTreatmentId(e.target.value)}
                  placeholder="UUID of the treatment from the catalog"
                  className="w-full px-3 py-2 text-xs font-mono bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
            )}
          </div>

          {proto && (
            <div className="text-[10px] text-stone-400 text-center">
              Snapshot of <span className="font-mono">{proto.name} v{proto.version}</span> will be frozen on this record.
            </div>
          )}
        </div>
      </div>
    );
  }

  // ============================================================
  // TIMELINE SCREEN — flat journey of all clinical events
  // ============================================================
  if (screen === "timeline" && selectedPatient) {
    return (
      <div className="min-h-[100dvh] bg-[#FAFAF9] flex flex-col">
        <ToastStack toasts={toasts} />
        <div className="bg-white border-b border-stone-100 px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
          <button onClick={() => setScreen("patient-detail")} className="p-1.5 rounded-lg hover:bg-stone-100"><ArrowLeft className="w-5 h-5 text-stone-600" /></button>
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-bold text-stone-900 truncate">Timeline</h1>
            <p className="text-xs text-stone-500 truncate">{selectedPatient.firstName} {selectedPatient.lastName}</p>
          </div>
          <button
            onClick={() => loadTimeline(selectedPatient.id)}
            className="p-1.5 rounded-lg hover:bg-stone-100"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 text-stone-500 ${timelineLoading ? "animate-spin" : ""}`} />
          </button>
        </div>

        <div className="flex-1 px-4 py-4 overflow-y-auto pb-20">
          {timelineLoading && timeline.length === 0 ? (
            <div className="flex items-center justify-center py-16 text-stone-400 text-sm">
              <RefreshCw className="w-4 h-4 animate-spin mr-2" /> Loading…
            </div>
          ) : timeline.length === 0 ? (
            <div className="text-center py-16">
              <Clock className="w-10 h-10 text-stone-300 mx-auto mb-3" />
              <p className="text-sm text-stone-500">No history yet for this patient.</p>
            </div>
          ) : (
            <ul className="relative space-y-4 pl-6 before:content-[''] before:absolute before:left-2 before:top-2 before:bottom-2 before:w-px before:bg-stone-200">
              {timeline.map((entry) => (
                <TimelineRow key={entry.id} entry={entry} />
              ))}
            </ul>
          )}
        </div>
      </div>
    );
  }

  // ============================================================
  // PATIENT DETAIL SCREEN
  // ============================================================
  if (screen === "patient-detail" && selectedPatient) {
    const age = ageFromDob(selectedPatient.dateOfBirth);
    const hasAllergies = selectedPatient.allergies && selectedPatient.allergies.length > 0;
    const activeMeds = (selectedPatient.medications || []).filter(m => m.isActive !== false);
    return (
      <div className="min-h-[100dvh] bg-[#FAFAF9] flex flex-col">
        <ToastStack toasts={toasts} />
        <ConfirmDialog dialog={confirm} onCancel={() => setConfirm(null)} />
        <PhotoViewer photo={photoViewer} onClose={() => setPhotoViewer(null)} />
        {compareOpen && (
          <BeforeAfterCompare
            photos={photos}
            onClose={() => setCompareOpen(false)}
          />
        )}
        <div className="bg-white border-b border-stone-100 px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
          <button onClick={() => { setScreen(selectedAppointment ? "home" : "patients"); setSelectedAppointment(null); }}
            className="p-1.5 rounded-lg hover:bg-stone-100"><ArrowLeft className="w-5 h-5 text-stone-600" /></button>
          <h1 className="text-sm font-bold text-stone-900 truncate flex-1">{selectedPatient.firstName} {selectedPatient.lastName}</h1>
          <span className="text-xs text-stone-400">{selectedPatient.patientCode}</span>
        </div>
        <div className="flex-1 px-4 py-4 space-y-4 overflow-y-auto pb-20">
          {/* Continuity briefing — 1-2 sentence AI summary of the
              patient's recent activity. Hidden for new patients
              with no history. Loads after the rest of the patient
              detail (1-2s for the AI round-trip) so it doesn't
              block the screen render. */}
          {briefing && (
            <div className="rounded-2xl bg-gradient-to-br from-violet-50 to-fuchsia-50 border border-violet-200 p-3">
              <div className="flex items-start gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-violet-200 flex items-center justify-center shrink-0">
                  <Sparkles className="w-3.5 h-3.5 text-violet-700" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-bold text-violet-700 uppercase tracking-wider">Continuity briefing</p>
                  <p className="text-sm text-stone-800 mt-0.5 leading-relaxed">{briefing}</p>
                </div>
              </div>
            </div>
          )}

          {/* Allergy alert banner */}
          {hasAllergies && (
            <div className="bg-red-50 border border-red-200 rounded-2xl p-3 flex items-start gap-2.5">
              <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center shrink-0">
                <AlertTriangle className="w-4 h-4 text-red-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-red-700 uppercase tracking-wider">Allergies</p>
                <p className="text-sm text-red-900 mt-0.5">
                  {selectedPatient.allergies!.map(a => (
                    <span key={a.id} className="inline-block mr-2">
                      {a.allergen}
                      {a.severity && <span className="text-[10px] ml-1 text-red-500">({a.severity})</span>}
                    </span>
                  ))}
                </p>
              </div>
            </div>
          )}

          {/* Patient card */}
          <div className="bg-white rounded-2xl border border-stone-100 p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-12 h-12 rounded-full bg-teal-100 flex items-center justify-center text-teal-700 font-bold text-lg">
                {selectedPatient.firstName[0]}{selectedPatient.lastName[0]}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-stone-900">{selectedPatient.firstName} {selectedPatient.lastName}</p>
                <p className="text-xs text-stone-500">
                  {selectedPatient.gender || "—"}
                  {age != null && <> | {age}y</>}
                  {selectedPatient.bloodType && <> | {selectedPatient.bloodType}</>}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 text-xs flex-wrap">
              {selectedPatient.assignedDoctor?.name && (
                <div className="flex items-center gap-1.5 text-stone-500"><Stethoscope className="w-3 h-3" />{selectedPatient.assignedDoctor.name}</div>
              )}
            </div>
            {selectedPatient.phone && (
              <div className="grid grid-cols-2 gap-2 mt-3">
                <a href={`tel:${selectedPatient.phone}`}
                  className="flex items-center justify-center gap-1.5 py-2 bg-stone-50 border border-stone-200 rounded-xl text-xs font-semibold text-stone-700 active:bg-stone-100">
                  <Phone className="w-3.5 h-3.5" /> Call
                </a>
                <a href={`sms:${selectedPatient.phone}`}
                  className="flex items-center justify-center gap-1.5 py-2 bg-stone-50 border border-stone-200 rounded-xl text-xs font-semibold text-stone-700 active:bg-stone-100">
                  <MessageSquare className="w-3.5 h-3.5" /> Message
                </a>
              </div>
            )}
          </div>

          {/* Active medications */}
          {activeMeds.length > 0 && (
            <div className="bg-white rounded-2xl border border-stone-100 p-4">
              <h3 className="text-xs font-bold text-stone-400 uppercase tracking-wider mb-2 flex items-center gap-1.5"><Pill className="w-3.5 h-3.5" /> On Medication</h3>
              <div className="flex flex-wrap gap-1.5">
                {activeMeds.map(m => (
                  <span key={m.id} className="text-[11px] bg-indigo-50 text-indigo-700 px-2 py-1 rounded-full">
                    {m.name}{m.dosage ? ` ${m.dosage}` : ""}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Latest Vitals + trends */}
          {vitals && (
            <div className="bg-white rounded-2xl border border-stone-100 p-4">
              <h3 className="text-xs font-bold text-stone-400 uppercase tracking-wider mb-3 flex items-center gap-1.5"><Thermometer className="w-3.5 h-3.5" /> Latest Vitals</h3>
              <div className="grid grid-cols-3 gap-3 text-center">
                {vitals.systolicBP && <div><p className="text-lg font-bold text-stone-900">{vitals.systolicBP}/{vitals.diastolicBP}</p><p className="text-[10px] text-stone-400">BP</p></div>}
                {vitals.heartRate && <div><p className="text-lg font-bold text-stone-900">{vitals.heartRate}</p><p className="text-[10px] text-stone-400">Heart Rate</p></div>}
                {vitals.temperature && <div><p className="text-lg font-bold text-stone-900">{vitals.temperature}</p><p className="text-[10px] text-stone-400">Temp</p></div>}
                {vitals.weight && <div><p className="text-lg font-bold text-stone-900">{vitals.weight}</p><p className="text-[10px] text-stone-400">Weight kg</p></div>}
                {vitals.oxygenSaturation && <div><p className="text-lg font-bold text-stone-900">{vitals.oxygenSaturation}%</p><p className="text-[10px] text-stone-400">SpO2</p></div>}
                {vitals.painLevel != null && <div><p className="text-lg font-bold text-stone-900">{vitals.painLevel}/10</p><p className="text-[10px] text-stone-400">Pain</p></div>}
              </div>
              {vitalsHistory.length >= 2 && (
                <div className="mt-3 pt-3 border-t border-stone-100">
                  <p className="text-[10px] uppercase tracking-wider text-stone-400 font-semibold mb-2">
                    Trend · last {vitalsHistory.length} readings
                  </p>
                  <div className="grid grid-cols-3 gap-3">
                    <VitalSparkRow
                      label="BP (sys)"
                      values={vitalsHistory.map((v) => v.systolicBP ?? null)}
                      color="#dc2626"
                      unit="mmHg"
                    />
                    <VitalSparkRow
                      label="HR"
                      values={vitalsHistory.map((v) => v.heartRate ?? null)}
                      color="#2563eb"
                      unit="bpm"
                    />
                    <VitalSparkRow
                      label="Weight"
                      values={vitalsHistory.map((v) => (typeof v.weight === "number" ? v.weight : null))}
                      color="#059669"
                      unit="kg"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Quick Actions */}
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => setScreen("consultation")}
              className="bg-teal-600 text-white rounded-2xl p-4 text-left active:scale-[0.97] transition-transform">
              <ClipboardList className="w-5 h-5 mb-2" />
              <p className="text-sm font-semibold">Consultation</p>
              <p className="text-[10px] text-teal-200 mt-0.5">Write notes</p>
            </button>
            <button onClick={() => setScreen("prescribe")}
              className="bg-indigo-600 text-white rounded-2xl p-4 text-left active:scale-[0.97] transition-transform">
              <Pill className="w-5 h-5 mb-2" />
              <p className="text-sm font-semibold">Prescribe</p>
              <p className="text-[10px] text-indigo-200 mt-0.5">Write Rx</p>
            </button>
            <button onClick={() => { setVoiceText(""); setScreen("voice-note"); }}
              className="bg-purple-600 text-white rounded-2xl p-4 text-left active:scale-[0.97] transition-transform">
              <Mic className="w-5 h-5 mb-2" />
              <p className="text-sm font-semibold">Voice Note</p>
              <p className="text-[10px] text-purple-200 mt-0.5">Tap to dictate</p>
            </button>
            <button onClick={() => setScreen("lab")}
              className="bg-rose-600 text-white rounded-2xl p-4 text-left active:scale-[0.97] transition-transform">
              <FlaskConical className="w-5 h-5 mb-2" />
              <p className="text-sm font-semibold">Order Labs</p>
              <p className="text-[10px] text-rose-200 mt-0.5">Biopsy, KOH…</p>
            </button>
            <button onClick={() => setScreen("follow-up")}
              className="bg-amber-600 text-white rounded-2xl p-4 text-left active:scale-[0.97] transition-transform">
              <CalendarClock className="w-5 h-5 mb-2" />
              <p className="text-sm font-semibold">Schedule Follow-up</p>
              <p className="text-[10px] text-amber-100 mt-0.5">1w, 2w, 1m, 3m</p>
            </button>
            <button
              onClick={() => {
                if (!selectedAppointment) {
                  toast("Procedures attach to an active appointment — open a visit first", "error");
                  return;
                }
                resetProcedureForm();
                if (protocols.length === 0) loadProtocols();
                setScreen("procedure");
              }}
              className="bg-pink-600 text-white rounded-2xl p-4 text-left active:scale-[0.97] transition-transform"
            >
              <Stethoscope className="w-5 h-5 mb-2" />
              <p className="text-sm font-semibold">Procedure</p>
              <p className="text-[10px] text-pink-200 mt-0.5">From protocol</p>
            </button>
            <button onClick={() => { if (selectedPatient) { loadTimeline(selectedPatient.id); setScreen("timeline"); } }}
              className="bg-stone-800 text-white rounded-2xl p-4 text-left active:scale-[0.97] transition-transform">
              <Clock className="w-5 h-5 mb-2" />
              <p className="text-sm font-semibold">Timeline</p>
              <p className="text-[10px] text-stone-300 mt-0.5">Full journey</p>
            </button>
            <button
              onClick={async () => {
                if (!selectedPatient) return;
                setActiveThreadId(null);
                await loadThreads(selectedPatient.id);
                setScreen("team");
                // Inbox-zero: mark every unread mention read
                // when the doctor opens the team surface. The
                // sidebar pip clears on the next /unread tick.
                fetch("/api/mentions/mark-read", {
                  method: "POST",
                  credentials: "include",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({}),
                }).then(() => setUnreadMentions(0)).catch(() => {});
              }}
              className="bg-cyan-600 text-white rounded-2xl p-4 text-left active:scale-[0.97] transition-transform col-span-2"
            >
              <MessageSquare className="w-5 h-5 mb-2" />
              <p className="text-sm font-semibold">Team chat</p>
              <p className="text-[10px] text-cyan-100 mt-0.5">Notes for colleagues · @mention to ping</p>
            </button>
          </div>

          {/* Past Notes */}
          {notes.length > 0 && (
            <div className="bg-white rounded-2xl border border-stone-100 p-4">
              <h3 className="text-xs font-bold text-stone-400 uppercase tracking-wider mb-3"><FileText className="w-3.5 h-3.5 inline mr-1" />Recent Notes</h3>
              <div className="space-y-3">
                {notes.map(n => (
                  <div key={n.id} className="border-l-2 border-teal-200 pl-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-stone-900">{n.diagnosis || n.chiefComplaint || "Note"}</p>
                        {n.treatmentPlan && <p className="text-xs text-stone-500 mt-0.5">{n.treatmentPlan.slice(0, 100)}</p>}
                        <p className="text-[10px] text-stone-400 mt-1">
                          {n.createdAt ? new Date(n.createdAt).toLocaleDateString("en-PK", { timeZone: CLINIC_TZ, month: "short", day: "numeric" }) : ""}
                          {n.isSigned && <span className="ml-1 text-emerald-600 font-semibold">· Signed</span>}
                        </p>
                      </div>
                      {!n.isSigned && (
                        <button onClick={() => signNote(n.id)} disabled={loading}
                          className="text-[10px] font-semibold text-teal-600 bg-teal-50 px-2 py-1 rounded-lg active:scale-95 shrink-0 disabled:opacity-50">
                          Sign
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Previous prescriptions */}
          {prescriptions.length > 0 && (
            <div className="bg-white rounded-2xl border border-stone-100 p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-bold text-stone-400 uppercase tracking-wider flex items-center gap-1.5"><Pill className="w-3.5 h-3.5" /> Previous Rx ({prescriptions.length})</h3>
                <button
                  onClick={() => repeatLastRx()}
                  className="text-[11px] font-semibold text-indigo-700 active:scale-95"
                  title="Open the prescribe screen pre-filled with the most recent Rx"
                >
                  Repeat last ↻
                </button>
              </div>
              <div className="space-y-3">
                {prescriptions.slice(0, 3).map(rx => (
                  <div key={rx.id} className="border-l-2 border-indigo-200 pl-3">
                    <p className="text-[10px] text-stone-400">
                      {rx.createdAt ? new Date(rx.createdAt).toLocaleDateString("en-PK", { timeZone: CLINIC_TZ, month: "short", day: "numeric" }) : ""}
                      {rx.doctor?.name ? ` | ${rx.doctor.name}` : ""}
                    </p>
                    {(rx.items || []).slice(0, 3).map(i => (
                      <p key={i.id} className="text-xs text-stone-700 mt-0.5">
                        • {i.medicineName}{i.dosage ? ` ${i.dosage}` : ""}{i.frequency ? ` · ${i.frequency}` : ""}{i.duration ? ` · ${i.duration}` : ""}
                      </p>
                    ))}
                    {(rx.items?.length || 0) > 3 && <p className="text-[10px] text-stone-400 mt-0.5">+{rx.items!.length - 3} more</p>}
                  </div>
                ))}
                {prescriptions.length > 3 && (
                  <p className="text-[10px] text-stone-400 text-center pt-1">+{prescriptions.length - 3} older Rx</p>
                )}
              </div>
            </div>
          )}

          {/* Visit history — patientAppointments was loaded but never
              rendered before. Doctor needs to see how often the patient
              comes, with whom, what for. */}
          {patientAppointments.length > 0 && (
            <div className="bg-white rounded-2xl border border-stone-100 p-4">
              <h3 className="text-xs font-bold text-stone-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5" /> Visit history ({patientAppointments.length})
              </h3>
              <div className="space-y-2">
                {patientAppointments.slice(0, 5).map((a) => (
                  <div key={a.id} className="flex items-center gap-2.5">
                    <span className="text-[10px] text-stone-400 w-14 shrink-0 font-mono">
                      {a.date ? new Date(a.date).toLocaleDateString("en-PK", { timeZone: CLINIC_TZ, month: "short", day: "numeric" }) : ""}
                    </span>
                    <span className="text-xs text-stone-800 flex-1 min-w-0 truncate">
                      {a.doctor?.name || "—"}
                      {a.type && <span className="text-stone-400"> · {a.type.replace(/_/g, " ").toLowerCase()}</span>}
                    </span>
                    <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full shrink-0 ${statusColor(a.status)}`}>
                      {a.status.replace(/_/g, " ")}
                    </span>
                  </div>
                ))}
                {patientAppointments.length > 5 && (
                  <p className="text-[10px] text-stone-400 text-center pt-1">+{patientAppointments.length - 5} older visits</p>
                )}
              </div>
            </div>
          )}

          {/* Skin history — this is a dermatology clinic, so prior
              chronic skin conditions (acne, melasma, eczema flares,
              etc.) deserve their own card rather than being buried in
              free-text notes. */}
          {skinHistory.length > 0 && (
            <div className="bg-white rounded-2xl border border-stone-100 p-4">
              <h3 className="text-xs font-bold text-stone-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" /> Skin history ({skinHistory.length})
              </h3>
              <div className="space-y-3">
                {skinHistory.slice(0, 4).map((s) => (
                  <div key={s.id} className="border-l-2 border-pink-200 pl-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium text-stone-900">{s.condition}</p>
                      {s.severity && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-pink-50 text-pink-700">
                          {s.severity}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-stone-500 mt-0.5">{s.affectedArea}</p>
                    {s.treatmentHistory && (
                      <p className="text-xs text-stone-600 mt-1 line-clamp-2">{s.treatmentHistory}</p>
                    )}
                    <p className="text-[10px] text-stone-400 mt-0.5">
                      {s.createdAt ? new Date(s.createdAt).toLocaleDateString("en-PK", { timeZone: CLINIC_TZ, month: "short", day: "numeric", year: "numeric" }) : ""}
                    </p>
                  </div>
                ))}
                {skinHistory.length > 4 && (
                  <p className="text-[10px] text-stone-400 text-center pt-1">+{skinHistory.length - 4} older entries</p>
                )}
              </div>
            </div>
          )}

          {/* Past procedures — what's been done in-clinic. */}
          {procedures.length > 0 && (
            <div className="bg-white rounded-2xl border border-stone-100 p-4">
              <h3 className="text-xs font-bold text-stone-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <Stethoscope className="w-3.5 h-3.5" /> Past procedures ({procedures.length})
              </h3>
              <div className="space-y-2">
                {procedures.slice(0, 5).map((p) => (
                  <div key={p.id} className="flex items-start gap-2.5">
                    <span className="text-[10px] text-stone-400 w-14 shrink-0 font-mono mt-0.5">
                      {p.performedAt ? new Date(p.performedAt).toLocaleDateString("en-PK", { timeZone: CLINIC_TZ, month: "short", day: "numeric" }) : "—"}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-stone-900 truncate">{p.treatment?.name || "Procedure"}</p>
                      {p.outcome && <p className="text-[11px] text-stone-500 truncate">{p.outcome}</p>}
                      {p.doctor?.name && <p className="text-[10px] text-stone-400">by {p.doctor.name}</p>}
                    </div>
                  </div>
                ))}
                {procedures.length > 5 && (
                  <p className="text-[10px] text-stone-400 text-center pt-1">+{procedures.length - 5} older procedures</p>
                )}
              </div>
            </div>
          )}

          {/* Lab results / orders */}
          {labTests.length > 0 && (
            <div className="bg-white rounded-2xl border border-stone-100 p-4">
              <h3 className="text-xs font-bold text-stone-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <FlaskConical className="w-3.5 h-3.5" /> Lab tests ({labTests.length})
              </h3>
              <div className="space-y-2.5">
                {labTests.slice(0, 5).map((t) => {
                  const tone =
                    t.status === "COMPLETED" ? "bg-emerald-50 text-emerald-700"
                    : t.status === "PROCESSING" || t.status === "SAMPLE_COLLECTED" ? "bg-amber-50 text-amber-700"
                    : t.status === "CANCELLED" ? "bg-stone-100 text-stone-500"
                    : "bg-blue-50 text-blue-700";
                  const rows = t.resultRows ?? [];
                  const abnormalCount = rows.filter((r) => r.isAbnormal).length;
                  return (
                    <div key={t.id} className="border-l-2 border-stone-100 pl-3">
                      <div className="flex items-center gap-2.5">
                        <span className="text-[10px] text-stone-400 w-14 shrink-0 font-mono">
                          {t.createdAt ? new Date(t.createdAt).toLocaleDateString("en-PK", { timeZone: CLINIC_TZ, month: "short", day: "numeric" }) : ""}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-stone-900 truncate">
                            {t.testName}{t.testCode ? <span className="text-stone-400 font-mono"> · {t.testCode}</span> : null}
                          </p>
                          {t.notes && <p className="text-[11px] text-stone-500 truncate">{t.notes}</p>}
                        </div>
                        {abnormalCount > 0 && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 shrink-0">
                            {abnormalCount} ABN
                          </span>
                        )}
                        <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full shrink-0 ${tone}`}>
                          {(t.status || "REQUESTED").replace(/_/g, " ")}
                        </span>
                      </div>
                      {rows.length > 0 && (
                        <div className="mt-1.5 space-y-0.5">
                          {rows.slice(0, 6).map((r) => {
                            const refLabel = r.referenceLow != null && r.referenceHigh != null
                              ? `${r.referenceLow}–${r.referenceHigh}${r.unit ? " " + r.unit : ""}`
                              : r.referenceText ?? "";
                            return (
                              <div key={r.id} className="flex items-center gap-2 text-[11px]">
                                <span className="text-stone-500 truncate flex-1">{r.analyte}</span>
                                <span className={`font-mono ${r.isAbnormal ? "text-red-700 font-semibold" : "text-stone-700"}`}>
                                  {r.value}{r.unit ? <span className="text-stone-400"> {r.unit}</span> : null}
                                  {r.flag && <span className={`ml-1 text-[9px] font-bold ${r.isAbnormal ? "text-red-600" : "text-stone-400"}`}>{r.flag}</span>}
                                </span>
                                {refLabel && <span className="text-[10px] text-stone-400 font-mono shrink-0">({refLabel})</span>}
                              </div>
                            );
                          })}
                          {rows.length > 6 && (
                            <p className="text-[10px] text-stone-400">+{rows.length - 6} more analytes</p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
                {labTests.length > 5 && (
                  <p className="text-[10px] text-stone-400 text-center pt-1">+{labTests.length - 5} older tests</p>
                )}
              </div>
            </div>
          )}

          {/* Chronic conditions from medicalHistory.conditions if any */}
          {selectedPatient.medicalHistory?.conditions && selectedPatient.medicalHistory.conditions.length > 0 && (
            <div className="bg-white rounded-2xl border border-stone-100 p-4">
              <h3 className="text-xs font-bold text-stone-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5" /> Conditions
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {selectedPatient.medicalHistory.conditions.map((c, i) => (
                  <span key={i} className="text-[11px] bg-amber-50 text-amber-700 px-2 py-1 rounded-full">{c}</span>
                ))}
              </div>
              {selectedPatient.medicalHistory.notes && (
                <p className="text-[11px] text-stone-500 mt-2">{selectedPatient.medicalHistory.notes}</p>
              )}
            </div>
          )}

          {/* Before / After Photos */}
          <div className="bg-white rounded-2xl border border-stone-100 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold text-stone-400 uppercase tracking-wider flex items-center gap-1.5">
                <Camera className="w-3.5 h-3.5" /> Before / After ({photos.length})
              </h3>
              {photos.filter(p => photoKind(p.name) === "before").length > 0 &&
               photos.filter(p => photoKind(p.name) === "after").length > 0 && (
                <button
                  onClick={() => setCompareOpen(true)}
                  className="text-[11px] font-semibold text-teal-700 active:scale-95"
                >
                  Compare ↔
                </button>
              )}
            </div>
            {photos.length > 0 ? (
              <div className="grid grid-cols-3 gap-2 mb-3">
                {photos.slice(0, 9).map(p => {
                  const kind = photoKind(p.name);
                  return (
                    <button key={p.id} onClick={() => setPhotoViewer(p)}
                      className="relative aspect-square rounded-xl overflow-hidden bg-stone-100 active:scale-[0.97] transition-transform">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.fileUrl} alt={p.name} className="w-full h-full object-cover" loading="lazy" />
                      {kind !== "other" && (
                        <span className={`absolute top-1 left-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                          kind === "before" ? "bg-amber-500 text-white" : "bg-emerald-500 text-white"
                        }`}>
                          {kind === "before" ? "B" : "A"}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-stone-400 mb-3 text-center py-4">No photos yet. Capture to start tracking progress.</p>
            )}
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => beforeFileRef.current?.click()} disabled={uploadingPhoto !== null}
                className="py-2.5 bg-amber-50 border border-amber-200 text-amber-700 rounded-xl font-semibold text-xs active:scale-95 disabled:opacity-60 flex items-center justify-center gap-1.5">
                {uploadingPhoto === "before" ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <ImagePlus className="w-3.5 h-3.5" />}
                {uploadingPhoto === "before" ? "Uploading..." : "+ Before"}
              </button>
              <button onClick={() => afterFileRef.current?.click()} disabled={uploadingPhoto !== null}
                className="py-2.5 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl font-semibold text-xs active:scale-95 disabled:opacity-60 flex items-center justify-center gap-1.5">
                {uploadingPhoto === "after" ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <ImagePlus className="w-3.5 h-3.5" />}
                {uploadingPhoto === "after" ? "Uploading..." : "+ After"}
              </button>
            </div>
            <input ref={beforeFileRef} type="file" accept="image/*" className="hidden"
              onChange={e => handlePhotoSelect(e, "before")} />
            <input ref={afterFileRef} type="file" accept="image/*" className="hidden"
              onChange={e => handlePhotoSelect(e, "after")} />
          </div>

          {/* Appointment History */}
          {patientAppointments.length > 0 && (
            <div className="bg-white rounded-2xl border border-stone-100 p-4">
              <h3 className="text-xs font-bold text-stone-400 uppercase tracking-wider mb-3"><Calendar className="w-3.5 h-3.5 inline mr-1" />Visit History</h3>
              <div className="space-y-2">
                {patientAppointments.slice(0, 5).map(a => (
                  <div key={a.id} className="flex items-center justify-between py-1.5">
                    <div>
                      <p className="text-sm text-stone-900">{a.type?.replace(/_/g, " ")}</p>
                      <p className="text-[10px] text-stone-400">{a.date ? new Date(a.date).toLocaleDateString("en-PK", { timeZone: CLINIC_TZ, month: "short", day: "numeric" }) : ""}</p>
                    </div>
                    <span className={`text-[10px] font-medium px-2 py-1 rounded-full ${statusColor(a.status)}`}>{a.status.replace(/_/g, " ")}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Complete button */}
          {selectedAppointment && (selectedAppointment.status === "IN_PROGRESS" || selectedAppointment.status === "WAITING" || selectedAppointment.status === "CHECKED_IN") && (
            <button onClick={() => completeAppointment(selectedAppointment)}
              className="w-full py-3.5 bg-green-600 text-white rounded-2xl font-semibold text-sm active:scale-[0.97] flex items-center justify-center gap-2">
              <CheckCircle className="w-4 h-4" /> Complete Visit
            </button>
          )}
        </div>
      </div>
    );
  }

  // ============================================================
  // PATIENTS SEARCH SCREEN
  // ============================================================
  if (screen === "patients") {
    return (
      <div className="min-h-[100dvh] bg-[#FAFAF9] flex flex-col">
        <ToastStack toasts={toasts} />
        <div className="bg-white border-b border-stone-100 px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
          <button onClick={() => setScreen("home")} className="p-1.5 rounded-lg hover:bg-stone-100"><ArrowLeft className="w-5 h-5 text-stone-600" /></button>
          <h1 className="text-sm font-bold text-stone-900 flex-1">Patients</h1>
        </div>
        <div className="px-4 py-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400" />
            <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search by name, phone, code..."
              className="w-full pl-10 pr-10 py-3 text-sm bg-white border border-stone-200 rounded-xl outline-none focus:border-teal-500" />
            {searchQuery && (
              <button onClick={() => setSearchQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-stone-100">
                <X className="w-3.5 h-3.5 text-stone-400" />
              </button>
            )}
          </div>
        </div>
        <div className="flex-1 px-4 space-y-2 overflow-y-auto pb-20">
          {searching && (
            <>
              {[0, 1, 2].map(i => (
                <div key={i} className="bg-white rounded-2xl border border-stone-100 p-4 flex items-center gap-3 animate-pulse">
                  <div className="w-10 h-10 rounded-full bg-stone-100 shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 bg-stone-100 rounded w-2/3" />
                    <div className="h-2 bg-stone-100 rounded w-1/2" />
                  </div>
                </div>
              ))}
            </>
          )}
          {!searching && patients.length === 0 && (
            <div className="text-center py-12">
              <Users className="w-10 h-10 text-stone-300 mx-auto mb-2" />
              <p className="text-sm text-stone-400">{searchQuery ? "No patients found" : "Start typing to search"}</p>
            </div>
          )}
          {!searching && patients.map(p => (
            <button key={p.id} onClick={async () => { setSelectedAppointment(null); await loadPatientDetail(p.id); setScreen("patient-detail"); }}
              className="w-full bg-white rounded-2xl border border-stone-100 p-4 flex items-center gap-3 active:bg-stone-50 text-left">
              <div className="w-10 h-10 rounded-full bg-teal-100 flex items-center justify-center text-teal-700 font-bold text-sm shrink-0">
                {p.firstName[0]}{p.lastName[0]}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-stone-900 truncate">{p.firstName} {p.lastName}</p>
                <p className="text-xs text-stone-500">{p.patientCode} | {p.phone}</p>
              </div>
              <ChevronRight className="w-4 h-4 text-stone-300 shrink-0" />
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ============================================================
  // SCHEDULE SCREEN
  // ============================================================
  if (screen === "schedule") {
    const isAdminUser = user?.role === "ADMIN" || user?.role === "SUPER_ADMIN";
    const activeDoctor = doctors.find((d) => d.id === selectedDoctorId);
    return (
      <div className="min-h-[100dvh] bg-[#FAFAF9] flex flex-col">
        <ToastStack toasts={toasts} />
        <div className="bg-white border-b border-stone-100 px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
          <button onClick={() => setScreen("home")} className="p-1.5 rounded-lg hover:bg-stone-100"><ArrowLeft className="w-5 h-5 text-stone-600" /></button>
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-bold text-stone-900 truncate">Full Schedule</h1>
            {isAdminUser && (
              <p className="text-[10px] text-stone-400 truncate">
                {selectedDoctorId ? `${activeDoctor?.name ?? "Doctor"}'s schedule` : "All doctors"}
              </p>
            )}
          </div>
          <button onClick={refresh} className="p-1.5 rounded-lg hover:bg-stone-100"><RefreshCw className={`w-4 h-4 text-stone-500 ${loading ? "animate-spin" : ""}`} /></button>
        </div>

        {/* Admin-only doctor picker. Hidden entirely for the DOCTOR
            role since their schedule is always self-scoped. */}
        {isAdminUser && doctors.length > 0 && (
          <div className="bg-white border-b border-stone-100 px-4 py-2 sticky top-[57px] z-10">
            <div className="flex gap-2 overflow-x-auto -mx-4 px-4 pb-1" style={{ scrollbarWidth: "none" }}>
              <button
                onClick={() => setSelectedDoctorId("")}
                className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                  selectedDoctorId === ""
                    ? "bg-teal-600 text-white"
                    : "bg-stone-100 text-stone-600 active:bg-stone-200"
                }`}
              >
                All ({doctors.length})
              </button>
              {doctors.map((d) => (
                <button
                  key={d.id}
                  onClick={() => setSelectedDoctorId(d.id)}
                  className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                    selectedDoctorId === d.id
                      ? "bg-teal-600 text-white"
                      : "bg-stone-100 text-stone-600 active:bg-stone-200"
                  }`}
                >
                  {d.name}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex-1 px-4 py-3 space-y-2 overflow-y-auto pb-20">
          {appointments.length === 0 && !loading && (
            <p className="text-center text-sm text-stone-400 py-12">
              No appointments today{isAdminUser && selectedDoctorId ? " for this doctor" : ""}
            </p>
          )}
          {appointments.map(a => (
            <button key={a.id} onClick={async () => { setSelectedAppointment(a); await loadPatientDetail(a.patientId); setScreen("patient-detail"); }}
              className="w-full bg-white rounded-2xl border border-stone-100 p-4 flex items-center gap-3 active:bg-stone-50 text-left">
              <div className="text-center shrink-0 w-14">
                <p className="text-sm font-bold text-stone-900">{a.startTime}</p>
                <p className="text-[10px] text-stone-400">{a.endTime}</p>
              </div>
              <div className="w-px h-10 bg-stone-100" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-stone-900 truncate">{aptPatientName(a)}</p>
                <p className="text-[10px] text-stone-500 truncate">
                  {a.type?.replace(/_/g, " ")}
                  {/* Show the doctor on each row when an admin is on
                      the "All doctors" view — otherwise the rows are
                      ambiguous. Hidden when a single doctor is
                      selected (redundant) and for non-admin users. */}
                  {isAdminUser && !selectedDoctorId && a.doctor?.name && (
                    <span className="text-stone-400"> · {a.doctor.name}</span>
                  )}
                </p>
              </div>
              <span className={`text-[10px] font-medium px-2 py-1 rounded-full shrink-0 ${statusColor(a.status)}`}>{a.status.replace(/_/g, " ")}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ============================================================
  // HOME SCREEN
  // ============================================================
  return (
    <div className="min-h-[100dvh] bg-[#FAFAF9] flex flex-col">
      <ToastStack toasts={toasts} />
      <ConfirmDialog dialog={confirm} onCancel={() => setConfirm(null)} />

      {/* Header — multi-stop gradient + radial overlay matching the
          modernized desktop pages. pointer-events-none on the overlay
          so it can't capture taps on the logout button (real bug we
          hit on the desktop /admin/roles hero — same fix here as a
          precaution). Stat tiles pulled into a 2x2 grid on small
          screens so the numbers stay readable instead of cramping
          into 4 columns of 80px each. */}
      <div className="relative overflow-hidden bg-gradient-to-br from-teal-600 via-cyan-600 to-sky-600 px-5 pt-12 pb-6 safe-top">
        <div className="pointer-events-none absolute inset-0 opacity-30 [background:radial-gradient(circle_at_25%_20%,#fff_0,transparent_55%)]" />
        <div className="relative">
          <div className="flex items-center justify-between mb-4 gap-3">
            {/* Wordmark sits directly on the gradient — no white
                tile. Drop-shadow keeps it readable. */}
            <div className="flex items-center gap-3 min-w-0">
              {tenantLogo ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={tenantLogo}
                  alt={tenantName}
                  className="h-9 w-auto shrink-0 drop-shadow"
                />
              ) : (
                <span className="text-white font-bold text-base shrink-0 drop-shadow">{tenantShort}</span>
              )}
              <div className="min-w-0">
                <p className="text-cyan-100 text-[10px] uppercase tracking-wider font-semibold truncate">{todayLabel}</p>
                <h1 className="text-lg sm:text-xl font-bold text-white mt-0.5 truncate">
                  {timeLabel()}, Dr. {user?.name?.split(" ").pop()}
                </h1>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="p-2.5 rounded-xl bg-white/15 border border-white/20 active:bg-white/25 transition-colors shrink-0"
              title="Sign out"
            >
              <LogOut className="w-4 h-4 text-white" />
            </button>
          </div>

          {/* Stat tiles — wider/taller pills with icons. 2x2 on phone,
              4-up on tablet so the numbers stay big enough to read. */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { label: "Waiting",  count: waiting.length,         icon: Timer,        accent: "bg-amber-400/90" },
              { label: "Active",   count: inProgress ? 1 : 0,      icon: Play,         accent: "bg-purple-400/90" },
              { label: "Upcoming", count: upcoming.length,         icon: Clock,        accent: "bg-blue-400/90" },
              { label: "Done",     count: completed.length,        icon: CheckCircle,  accent: "bg-emerald-400/90" },
            ].map(s => (
              <div key={s.label}
                className="bg-white/15 backdrop-blur-sm border border-white/20 rounded-2xl px-3 py-3 flex items-center gap-2.5">
                <div className={`w-8 h-8 rounded-xl ${s.accent} flex items-center justify-center text-white shrink-0`}>
                  <s.icon className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-lg font-bold text-white leading-none">{s.count}</p>
                  <p className="text-[10px] text-cyan-100 mt-0.5">{s.label}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Pull-to-refresh indicator */}
      {pullDist > 10 && (
        <div className="flex items-center justify-center text-teal-600 text-xs py-2" style={{ height: pullDist }}>
          <RefreshCw className={`w-4 h-4 mr-1.5 ${pullDist > 60 ? "animate-spin" : ""}`} />
          {pullDist > 60 ? "Release to refresh" : "Pull to refresh"}
        </div>
      )}

      <div ref={scrollRef}
        onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}
        className="flex-1 px-4 -mt-3 space-y-4 overflow-y-auto pb-24">

        {/* Quick patient search — between-patients lookup without
            switching to the Patients tab. Debounced; results jump
            straight into patient-detail. */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400 pointer-events-none" />
          <input
            type="search"
            value={homeSearch}
            onChange={(e) => { setHomeSearch(e.target.value); setHomeSearchOpen(true); }}
            onFocus={() => setHomeSearchOpen(true)}
            placeholder="Search any patient by name or code…"
            className="w-full pl-10 pr-9 py-2.5 text-sm bg-white border border-stone-200 rounded-2xl outline-none focus:border-teal-500 shadow-sm"
          />
          {homeSearch && (
            <button
              onClick={() => { setHomeSearch(""); setHomeResults([]); setHomeSearchOpen(false); }}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-stone-400 active:text-stone-700"
              aria-label="Clear search"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          {homeSearchOpen && homeSearch.trim().length >= 2 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-stone-200 rounded-2xl shadow-lg z-30 max-h-72 overflow-y-auto">
              {homeResults.length === 0 ? (
                <p className="px-4 py-3 text-xs text-stone-400 text-center">No patients match &ldquo;{homeSearch}&rdquo;</p>
              ) : homeResults.map((p) => (
                <button
                  key={p.id}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={async () => {
                    setSelectedAppointment(null);
                    setHomeSearch("");
                    setHomeResults([]);
                    setHomeSearchOpen(false);
                    await loadPatientDetail(p.id);
                    setScreen("patient-detail");
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 active:bg-stone-50 text-left border-b border-stone-50 last:border-b-0"
                >
                  <div className="w-9 h-9 rounded-full bg-teal-100 flex items-center justify-center text-teal-700 font-bold text-xs shrink-0">
                    {p.firstName[0]}{p.lastName[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-stone-900 truncate">{p.firstName} {p.lastName}</p>
                    <p className="text-[11px] text-stone-500">{p.patientCode}{p.phone ? ` · ${p.phone}` : ""}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-stone-300 shrink-0" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Pending sign-off — unsigned notes from the last 14 days
            so the doctor doesn't lose track between busy clinic
            days. One-tap Sign updates server + drops the row. */}
        {pendingNotes.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-2.5">
              <div className="w-7 h-7 rounded-lg bg-amber-200 flex items-center justify-center">
                <FileText className="w-3.5 h-3.5 text-amber-700" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-xs font-bold text-amber-900 uppercase tracking-wider">Pending sign-off</h3>
                <p className="text-[11px] text-amber-700">{pendingNotes.length} note{pendingNotes.length > 1 ? "s" : ""} awaiting your signature</p>
              </div>
            </div>
            <div className="space-y-2">
              {pendingNotes.slice(0, 4).map((n) => (
                <div key={n.id} className="bg-white rounded-xl p-3 flex items-start gap-2.5 border border-amber-100">
                  <button
                    onClick={async () => {
                      setSelectedAppointment(null);
                      await loadPatientDetail(n.patient.id);
                      setScreen("patient-detail");
                    }}
                    className="flex-1 min-w-0 text-left"
                  >
                    <p className="text-sm font-medium text-stone-900 truncate">
                      {n.patient.firstName} {n.patient.lastName}
                      <span className="text-stone-400 font-normal text-[11px] ml-1.5">{n.patient.patientCode}</span>
                    </p>
                    <p className="text-[11px] text-stone-500 truncate">
                      {n.diagnosis || n.chiefComplaint || "Consultation note"}
                    </p>
                    <p className="text-[10px] text-stone-400 mt-0.5">
                      {new Date(n.createdAt).toLocaleDateString("en-PK", { timeZone: CLINIC_TZ, month: "short", day: "numeric" })}
                      {n.doctor?.name && user?.role !== "DOCTOR" ? ` · ${n.doctor.name}` : ""}
                    </p>
                  </button>
                  <button
                    onClick={() => signPendingNote(n.id)}
                    className="px-3 py-1.5 bg-amber-600 text-white text-[11px] font-semibold rounded-lg active:scale-95 shrink-0"
                  >
                    Sign
                  </button>
                </div>
              ))}
              {pendingNotes.length > 4 && (
                <p className="text-[10px] text-amber-700 text-center pt-1 font-medium">+{pendingNotes.length - 4} more pending</p>
              )}
            </div>
          </div>
        )}

        {/* In Progress — gradient + animated dot for visual urgency.
            This card is the "you have a patient in the room right now"
            anchor; everything else is secondary while this is up. */}
        {inProgress && (
          <button onClick={async () => { setSelectedAppointment(inProgress); await loadPatientDetail(inProgress.patientId); setScreen("patient-detail"); }}
            className="relative w-full bg-gradient-to-br from-purple-600 via-violet-600 to-fuchsia-600 text-white rounded-2xl p-4 flex items-center gap-3 active:scale-[0.98] transition-transform shadow-lg shadow-purple-200/60 overflow-hidden">
            <div className="pointer-events-none absolute inset-0 opacity-25 [background:radial-gradient(circle_at_85%_50%,#fff_0,transparent_55%)]" />
            <div className="relative w-11 h-11 bg-white/20 rounded-xl flex items-center justify-center shrink-0">
              <Play className="w-5 h-5" />
              <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-emerald-400 ring-2 ring-purple-600 animate-pulse" />
            </div>
            <div className="relative flex-1 text-left min-w-0">
              <p className="text-[10px] uppercase tracking-wider font-semibold opacity-80">In consultation now</p>
              <p className="text-sm font-bold truncate mt-0.5">{aptPatientName(inProgress)}</p>
              <p className="text-[11px] opacity-90 mt-0.5">{inProgress.startTime}–{inProgress.endTime} · tap to continue</p>
            </div>
            <ChevronRight className="relative w-5 h-5 opacity-80 shrink-0" />
          </button>
        )}

        {/* Waiting Queue with wait-time */}
        {waiting.length > 0 && (
          <div>
            <h2 className="text-xs font-bold text-stone-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Timer className="w-3.5 h-3.5" /> Waiting ({waiting.length})
            </h2>
            <div className="space-y-2">
              {(() => {
                // Compute ETA for the whole queue at once. The map
                // is keyed by appointmentId so per-row lookup is O(1)
                // and the ticker re-renders refresh the values
                // every 30s without a refetch.
                const etaMap = computeQueueEta(
                  appointments.map((x) => ({
                    id: x.id,
                    startTime: x.startTime,
                    durationMinutes: undefined,
                    type: x.type,
                    status: x.status,
                    workflowStage: x.workflowStage,
                    checkInAt: x.checkInAt,
                  })),
                );
                return waiting.map(a => {
                  const mins = minutesSince(a.checkInAt || a.createdAt);
                  const eta = etaMap.get(a.id);
                  return (
                    <div key={a.id} className="bg-white rounded-2xl border border-stone-100 p-4 flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center text-amber-700 font-bold text-sm shrink-0">
                        {(a.patient?.firstName?.[0] || "?")}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-stone-900 truncate">{aptPatientName(a)}</p>
                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                          <p className="text-[10px] text-stone-500">{a.startTime} | {a.type?.replace(/_/g, " ")}</p>
                          {mins != null && (
                            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${waitColor(mins)}`}>
                              waited {mins}m
                            </span>
                          )}
                          {eta !== undefined && (
                            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${etaTone(eta)}`}>
                              ETA {formatEta(eta)}
                            </span>
                          )}
                        </div>
                      </div>
                      <button onClick={() => startConsultation(a)} disabled={loading}
                        className="px-3 py-2 bg-teal-600 text-white text-xs font-semibold rounded-xl active:scale-95 shrink-0 disabled:opacity-50">
                        Start
                      </button>
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        )}

        {/* Upcoming */}
        {upcoming.length > 0 && (
          <div>
            <h2 className="text-xs font-bold text-stone-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" /> Upcoming ({upcoming.length})
            </h2>
            <div className="space-y-2">
              {upcoming.map(a => (
                <button key={a.id} onClick={async () => { setSelectedAppointment(a); await loadPatientDetail(a.patientId); setScreen("patient-detail"); }}
                  className="w-full bg-white rounded-2xl border border-stone-100 p-4 flex items-center gap-3 active:bg-stone-50 text-left">
                  <div className="text-center shrink-0 w-12">
                    <p className="text-sm font-bold text-stone-900">{a.startTime}</p>
                    <p className="text-[10px] text-stone-400">{a.endTime}</p>
                  </div>
                  <div className="w-px h-8 bg-stone-100" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-stone-900 truncate">{aptPatientName(a)}</p>
                    <p className="text-[10px] text-stone-500">{a.type?.replace(/_/g, " ")} {a.patient?.patientCode ? `| ${a.patient.patientCode}` : ""}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-stone-300 shrink-0" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Completed */}
        {completed.length > 0 && (
          <div>
            <h2 className="text-xs font-bold text-stone-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <CheckCircle className="w-3.5 h-3.5" /> Completed ({completed.length})
            </h2>
            <div className="space-y-2">
              {completed.slice(0, 5).map(a => (
                <button key={a.id} onClick={async () => { setSelectedAppointment(a); await loadPatientDetail(a.patientId); setScreen("patient-detail"); }}
                  className="w-full bg-white rounded-2xl border border-stone-100 p-3 flex items-center gap-3 active:bg-stone-50 text-left opacity-70">
                  <div className="text-center shrink-0 w-10">
                    <p className="text-xs font-bold text-stone-500">{a.startTime}</p>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-stone-600 truncate">{aptPatientName(a)}</p>
                  </div>
                  <CheckCircle className="w-3.5 h-3.5 text-green-400 shrink-0" />
                </button>
              ))}
            </div>
          </div>
        )}

        {appointments.length === 0 && !loading && (
          <div className="text-center py-12">
            <Calendar className="w-10 h-10 text-stone-300 mx-auto mb-3" />
            <p className="text-sm text-stone-500">No appointments today</p>
            <button onClick={refresh} className="mt-3 text-sm text-teal-600 font-medium">Refresh</button>
          </div>
        )}

        {appointments.length === 0 && loading && (
          <div className="space-y-2 pt-4">
            {[0, 1, 2].map(i => (
              <div key={i} className="bg-white rounded-2xl border border-stone-100 p-4 flex items-center gap-3 animate-pulse">
                <div className="w-10 h-10 rounded-full bg-stone-100 shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 bg-stone-100 rounded w-2/3" />
                  <div className="h-2 bg-stone-100 rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Offline indicator — appears above the bottom nav when the
          browser reports offline. The SW continues serving cached
          data in the background; this pill just tells the doctor
          what they're looking at might be stale. */}
      {!isOnline && (
        <div className="fixed bottom-[68px] left-0 right-0 z-30 px-4">
          <div className="mx-auto max-w-md bg-amber-50 border border-amber-300 rounded-xl px-3 py-2 flex items-center gap-2 shadow-lg">
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
            <p className="text-xs text-amber-900 flex-1">
              <span className="font-bold">Offline.</span> Showing cached data — writes will retry when you&apos;re back online.
            </p>
          </div>
        </div>
      )}

      {/* Bottom Nav — backdrop-blur + filled-pill active state for a
          more polished tap target. The pill scales the whole row up
          ~2px when active so it's obvious at a glance which tab is
          live; the badge counter on Today shows waiting + active so
          the doctor can tell at a glance whether anyone needs them. */}
      <div className="fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-md border-t border-stone-100 flex items-center justify-around py-2 pb-safe z-20">
        {[
          { id: "home" as Screen, icon: Activity, label: "Today",   badge: waiting.length + (inProgress ? 1 : 0) + unreadMentions },
          { id: "schedule" as Screen, icon: Calendar, label: "Schedule", badge: 0 },
          { id: "patients" as Screen, icon: Users, label: "Patients",   badge: 0 },
        ].map(t => {
          const active = screen === t.id;
          return (
            <button key={t.id}
              onClick={() => { setScreen(t.id); if (t.id === "patients" && patients.length === 0) loadPatients(); }}
              className={`relative flex flex-col items-center gap-0.5 px-5 py-1.5 rounded-2xl transition-all ${
                active
                  ? "text-teal-700 bg-teal-50 scale-105"
                  : "text-stone-400 active:text-stone-600 active:bg-stone-50"
              }`}>
              <t.icon className={`w-5 h-5 ${active ? "stroke-[2.5]" : ""}`} />
              <span className="text-[10px] font-semibold">{t.label}</span>
              {t.badge > 0 && (
                <span className="absolute -top-0.5 right-2 min-w-[16px] h-[16px] px-1 rounded-full bg-amber-500 text-white text-[9px] font-bold flex items-center justify-center ring-2 ring-white">
                  {t.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================
// Sub-components
// ============================================================
function BeforeAfterCompare({ photos, onClose }: { photos: PhotoDoc[]; onClose: () => void }) {
  // Pre-pick the most-recent photo of each kind. Doctors often have
  // multiple before/after pairs over months — letting them swap is
  // a v2 affordance; v1 just shows the latest of each.
  const befores = photos.filter((p) => photoKind(p.name) === "before");
  const afters  = photos.filter((p) => photoKind(p.name) === "after");
  const [beforeIdx, setBeforeIdx] = useState(0);
  const [afterIdx, setAfterIdx] = useState(0);
  const before = befores[beforeIdx];
  const after  = afters[afterIdx];

  // Slider position 0-100. 0 = full BEFORE, 100 = full AFTER.
  // Defaults to 50 so the doctor sees both halves on open.
  const [pos, setPos] = useState(50);
  const stageRef = useRef<HTMLDivElement | null>(null);

  const updateFromClientX = useCallback((clientX: number) => {
    const stage = stageRef.current;
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    const x = clientX - rect.left;
    const pct = Math.max(0, Math.min(100, (x / rect.width) * 100));
    setPos(pct);
  }, []);

  if (!before || !after) {
    return (
      <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center px-6" onClick={onClose}>
        <p className="text-white text-sm">Need both a Before and an After photo.</p>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 bg-black/80 backdrop-blur shrink-0">
        <p className="text-sm font-semibold text-white">Before ↔ After</p>
        <button onClick={onClose} className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center text-white">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Stage — full-bleed compare. Pointer + touch handlers all
          dispatch through the shared updater; works on mobile and
          desktop. */}
      <div
        ref={stageRef}
        className="flex-1 relative bg-stone-900 overflow-hidden select-none touch-none"
        onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture?.(e.pointerId); updateFromClientX(e.clientX); }}
        onPointerMove={(e) => { if (e.buttons > 0) updateFromClientX(e.clientX); }}
        onTouchStart={(e) => { if (e.touches[0]) updateFromClientX(e.touches[0].clientX); }}
        onTouchMove={(e) => { if (e.touches[0]) updateFromClientX(e.touches[0].clientX); }}
      >
        {/* AFTER fills the full stage as the base layer. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={after.fileUrl}
          alt="After"
          className="absolute inset-0 w-full h-full object-contain pointer-events-none"
          draggable={false}
        />
        {/* BEFORE clipped to (0..pos)% via clip-path, stacked above
            AFTER. Drag the divider to change the reveal. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={before.fileUrl}
          alt="Before"
          className="absolute inset-0 w-full h-full object-contain pointer-events-none"
          style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}
          draggable={false}
        />

        {/* Divider + handle */}
        <div className="absolute inset-y-0 w-0.5 bg-white/80 pointer-events-none" style={{ left: `${pos}%` }} />
        <div
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-10 h-10 rounded-full bg-white shadow-lg flex items-center justify-center pointer-events-none"
          style={{ left: `${pos}%` }}
        >
          <span className="text-stone-900 font-bold text-xs">↔</span>
        </div>

        {/* Corner labels */}
        <span className="absolute top-3 left-3 text-[10px] uppercase tracking-wider font-bold px-2 py-1 rounded bg-amber-500 text-white">Before</span>
        <span className="absolute top-3 right-3 text-[10px] uppercase tracking-wider font-bold px-2 py-1 rounded bg-emerald-500 text-white">After</span>
      </div>

      {/* Bottom strip — let doctor pick a different before / after
          from any other tagged photo on file. */}
      <div className="bg-black/80 backdrop-blur px-3 py-2 shrink-0 space-y-2">
        {befores.length > 1 && (
          <div className="flex gap-2 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
            <span className="text-[10px] font-bold text-amber-200 uppercase tracking-wider self-center shrink-0">B</span>
            {befores.map((p, i) => (
              <button
                key={p.id}
                onClick={() => setBeforeIdx(i)}
                className={`relative w-12 h-12 rounded-lg overflow-hidden shrink-0 ring-2 ${i === beforeIdx ? "ring-amber-400" : "ring-transparent"}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.fileUrl} alt="" className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        )}
        {afters.length > 1 && (
          <div className="flex gap-2 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
            <span className="text-[10px] font-bold text-emerald-200 uppercase tracking-wider self-center shrink-0">A</span>
            {afters.map((p, i) => (
              <button
                key={p.id}
                onClick={() => setAfterIdx(i)}
                className={`relative w-12 h-12 rounded-lg overflow-hidden shrink-0 ring-2 ${i === afterIdx ? "ring-emerald-400" : "ring-transparent"}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.fileUrl} alt="" className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** Compact vitals trend cell — label + last value + sparkline + delta.
 *  Renders nothing if fewer than 2 numeric points in the series. */
function VitalSparkRow({
  label, values, color, unit,
}: { label: string; values: Array<number | null>; color: string; unit: string }) {
  const numeric = values.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  if (numeric.length < 2) return null;
  const last = numeric[numeric.length - 1];
  const first = numeric[0];
  const delta = last - first;
  const deltaTone =
    Math.abs(delta) < 0.5 ? "text-stone-400"
    : delta > 0 ? "text-amber-600"
    : "text-emerald-600";
  const sign = delta > 0 ? "↑" : delta < 0 ? "↓" : "·";
  return (
    <div>
      <div className="flex items-baseline justify-between gap-1 mb-1">
        <p className="text-[10px] text-stone-400 truncate">{label}</p>
        <p className={`text-[10px] font-mono ${deltaTone}`}>
          {sign}{Math.abs(delta).toFixed(unit === "kg" ? 1 : 0)}
        </p>
      </div>
      <Sparkline values={values} color={color} width={120} height={24} className="w-full h-6" />
      <p className="text-[10px] text-stone-500 mt-0.5">
        <span className="font-semibold text-stone-700">{last.toFixed(unit === "kg" ? 1 : 0)}</span>
        <span className="text-stone-400"> {unit}</span>
      </p>
    </div>
  );
}

/** Highlight @mentions inside a chat bubble. Splits on the same
 *  regex the server uses, wrapping each handle in a styled span. */
function renderBodyWithMentions(body: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  const re = /@[a-zA-Z][a-zA-Z0-9._-]{1,40}/g;
  let lastIdx = 0;
  let key = 0;
  for (const match of body.matchAll(re)) {
    const idx = match.index ?? 0;
    if (idx > lastIdx) parts.push(body.slice(lastIdx, idx));
    parts.push(
      <span key={`m-${key++}`} className="font-semibold text-cyan-100 underline-offset-2">
        {match[0]}
      </span>,
    );
    lastIdx = idx + match[0].length;
  }
  if (lastIdx < body.length) parts.push(body.slice(lastIdx));
  return parts;
}

function TimelineRow({ entry }: { entry: { id: string; kind: string; at: string; payload: Record<string, unknown> } }) {
  const dateLabel = new Date(entry.at).toLocaleString("en-PK", {
    timeZone: CLINIC_TZ,
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true,
  });
  const p = entry.payload;
  // Per-kind appearance: dot color, kind label, primary text, sub.
  const config: Record<string, { dot: string; label: string; iconBg: string }> = {
    VISIT:          { dot: "bg-teal-500",     label: "Visit",          iconBg: "bg-teal-100 text-teal-700" },
    NOTE:           { dot: "bg-blue-500",     label: "Note",           iconBg: "bg-blue-100 text-blue-700" },
    PRESCRIPTION:   { dot: "bg-indigo-500",   label: "Rx",             iconBg: "bg-indigo-100 text-indigo-700" },
    PROCEDURE:      { dot: "bg-pink-500",     label: "Procedure",      iconBg: "bg-pink-100 text-pink-700" },
    LAB_ORDERED:    { dot: "bg-rose-400",     label: "Lab ordered",    iconBg: "bg-rose-100 text-rose-700" },
    LAB_COMPLETED:  { dot: "bg-emerald-500",  label: "Lab result",     iconBg: "bg-emerald-100 text-emerald-700" },
    FOLLOWUP:       { dot: "bg-amber-500",    label: "Follow-up",      iconBg: "bg-amber-100 text-amber-700" },
    PHOTO:          { dot: "bg-fuchsia-500",  label: "Photo",          iconBg: "bg-fuchsia-100 text-fuchsia-700" },
  };
  const c = config[entry.kind] || { dot: "bg-stone-400", label: entry.kind, iconBg: "bg-stone-100 text-stone-700" };

  let primary: React.ReactNode = "—";
  let sub: React.ReactNode = null;

  if (entry.kind === "VISIT") {
    primary = `${(p.type as string)?.replace(/_/g, " ").toLowerCase() || "Visit"}${p.startTime ? ` · ${p.startTime}` : ""}`;
    sub = <>{p.doctor as string} <span className="text-stone-400">· {(p.status as string).replace(/_/g, " ")}</span></>;
  } else if (entry.kind === "NOTE") {
    primary = (p.diagnosis as string) || (p.chiefComplaint as string) || "Consultation note";
    sub = <>{p.doctor as string}{p.isSigned ? <span className="text-emerald-600"> · signed</span> : <span className="text-stone-400"> · unsigned</span>}</>;
  } else if (entry.kind === "PRESCRIPTION") {
    const items = (p.items as Array<{ medicineName: string }> | undefined) || [];
    primary = items.slice(0, 2).map((i) => i.medicineName).join(", ") + (items.length > 2 ? ` +${items.length - 2}` : "");
    sub = p.doctor ? <>{p.doctor as string}</> : null;
  } else if (entry.kind === "PROCEDURE") {
    primary = (p.treatmentName as string) || "Procedure";
    sub = <>{(p.doctor as string) || ""}{p.outcome ? <span className="text-stone-400"> · {p.outcome as string}</span> : null}</>;
  } else if (entry.kind === "LAB_ORDERED") {
    primary = `${p.testName as string}${p.testCode ? ` (${p.testCode as string})` : ""}`;
    sub = <span className="text-stone-400">status: {(p.status as string).toLowerCase().replace(/_/g, " ")}</span>;
  } else if (entry.kind === "LAB_COMPLETED") {
    primary = `${p.testName as string}${p.testCode ? ` (${p.testCode as string})` : ""}`;
    sub = <span className="text-emerald-600">result available</span>;
  } else if (entry.kind === "FOLLOWUP") {
    primary = p.reason as string;
    sub = <span className="text-stone-400">due {p.dueDate as string} · {(p.status as string).toLowerCase()}</span>;
  } else if (entry.kind === "PHOTO") {
    return (
      <li className="relative">
        <span className={`absolute -left-[19px] top-1.5 w-3 h-3 rounded-full ring-2 ring-[#FAFAF9] ${c.dot}`} />
        <div className="bg-white rounded-2xl border border-stone-100 p-2.5 flex gap-3 items-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={p.fileUrl as string}
            alt={(p.name as string) || "photo"}
            className="w-14 h-14 rounded-xl object-cover bg-stone-100 shrink-0"
          />
          <div className="flex-1 min-w-0">
            <p className="text-[10px] uppercase tracking-wider text-stone-400 font-bold">Photo</p>
            <p className="text-sm font-medium text-stone-900 truncate">{p.name as string}</p>
            <p className="text-[10px] text-stone-400">{dateLabel}</p>
          </div>
        </div>
      </li>
    );
  }

  return (
    <li className="relative">
      <span className={`absolute -left-[19px] top-2.5 w-3 h-3 rounded-full ring-2 ring-[#FAFAF9] ${c.dot}`} />
      <div className="bg-white rounded-2xl border border-stone-100 p-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-[10px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded ${c.iconBg}`}>{c.label}</span>
          <span className="text-[10px] text-stone-400">{dateLabel}</span>
        </div>
        <p className="text-sm font-medium text-stone-900 mt-1 truncate">{primary}</p>
        {sub && <p className="text-[11px] text-stone-500 mt-0.5">{sub}</p>}
      </div>
    </li>
  );
}

function RxGuardBanner({
  warnings,
  ackedIds,
  onAcknowledge,
}: {
  warnings: GuardWarning[];
  ackedIds: Set<string>;
  onAcknowledge: (id: string) => void;
}) {
  if (warnings.length === 0) return null;
  return (
    <div className="mx-4 mb-2 space-y-2">
      {warnings.map((w) => {
        const ack = ackedIds.has(w.id);
        const isDanger = w.severity === "danger";
        const tone = isDanger
          ? (ack ? "bg-stone-50 border-stone-200" : "bg-red-50 border-red-300")
          : "bg-amber-50 border-amber-200";
        const titleTone = isDanger
          ? (ack ? "text-stone-600" : "text-red-700")
          : "text-amber-800";
        return (
          <div key={w.id} className={`rounded-xl border p-3 flex items-start gap-2 ${tone}`}>
            <AlertTriangle className={`w-4 h-4 shrink-0 mt-0.5 ${isDanger && !ack ? "text-red-600" : isDanger ? "text-stone-400" : "text-amber-600"}`} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <p className={`text-xs font-bold ${titleTone}`}>{w.title}</p>
                <span className={`text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded-full ${
                  isDanger ? "bg-red-200 text-red-900" : "bg-amber-200 text-amber-900"
                }`}>{w.severity}</span>
                {w.affectedItems.length > 0 && (
                  <span className="text-[10px] text-stone-500">· {w.affectedItems.join(", ")}</span>
                )}
              </div>
              <p className="text-[11px] text-stone-700 mt-1 leading-relaxed">{w.detail}</p>
              {w.recommendation && (
                <p className="text-[11px] text-stone-800 mt-1.5 leading-relaxed border-l-2 border-stone-300 pl-2">
                  <span className="font-semibold">Action:</span> {w.recommendation}
                </p>
              )}
              {isDanger && !ack && (
                <button
                  onClick={() => onAcknowledge(w.id)}
                  className="mt-2 text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-red-600 text-white active:scale-95"
                >
                  Acknowledge & continue
                </button>
              )}
              {isDanger && ack && (
                <p className="mt-1 text-[10px] text-stone-500 inline-flex items-center gap-1">
                  <Check className="w-3 h-3" /> Acknowledged
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ToastStack({ toasts }: { toasts: Toast[] }) {
  if (toasts.length === 0) return null;
  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 space-y-2 pointer-events-none">
      {toasts.map(t => (
        <div key={t.id}
          className={`px-4 py-2.5 rounded-xl shadow-lg text-sm font-medium min-w-[220px] text-center animate-[slideDown_0.2s_ease-out] ${
            t.kind === "success" ? "bg-emerald-600 text-white" :
            t.kind === "error" ? "bg-red-600 text-white" :
            "bg-stone-900 text-white"
          }`}>
          {t.text}
        </div>
      ))}
    </div>
  );
}

function ConfirmDialog({ dialog, onCancel }: { dialog: { title: string; body: string; onYes: () => void } | null; onCancel: () => void }) {
  if (!dialog) return null;
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-4" onClick={onCancel}>
      <div className="bg-white rounded-2xl p-5 w-full max-w-sm shadow-xl" onClick={e => e.stopPropagation()}>
        <h3 className="text-base font-bold text-stone-900">{dialog.title}</h3>
        <p className="text-sm text-stone-600 mt-1.5">{dialog.body}</p>
        <div className="flex gap-2 mt-5">
          <button onClick={onCancel} className="flex-1 py-2.5 bg-stone-100 text-stone-700 rounded-xl font-semibold text-sm active:scale-95">Cancel</button>
          <button onClick={dialog.onYes} className="flex-1 py-2.5 bg-teal-600 text-white rounded-xl font-semibold text-sm active:scale-95">Confirm</button>
        </div>
      </div>
    </div>
  );
}

// v56 — AI photo score row shape (subset of fields the viewer renders).
interface PhotoScoreRow {
  condition: string | null;
  severity: "MILD" | "MODERATE" | "SEVERE" | "UNCERTAIN" | null;
  lesionCount: number | null;
  bodyArea: string | null;
  findings: string | null;
  recommendations: string | null;
  confidence: number | null;
  modelId: string;
  promptVersion: string;
  createdAt: string;
}

function PhotoViewer({ photo, onClose }: { photo: PhotoDoc | null; onClose: () => void }) {
  // Hooks must be unconditional — keep them above the early return.
  const [score, setScore] = useState<PhotoScoreRow | null>(null);
  const [scoring, setScoring] = useState(false);
  const [scoreError, setScoreError] = useState<string | null>(null);

  // Fetch any existing score whenever the viewer opens for a new photo.
  useEffect(() => {
    setScore(null);
    setScoreError(null);
    if (!photo) return;
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/patient-documents/${photo.id}/score`, { credentials: "include" }).then((r) => r.json()).catch(() => null);
      if (!cancelled && res?.success && res.data) setScore(res.data as PhotoScoreRow);
    })();
    return () => { cancelled = true; };
  }, [photo]);

  if (!photo) return null;
  const kind = photoKind(photo.name);
  const dateLabel = photo.createdAt ? new Date(photo.createdAt).toLocaleDateString("en-PK", { timeZone: CLINIC_TZ, month: "short", day: "numeric", year: "numeric" }) : "";
  const isImage = (photo.mimeType || "").startsWith("image/");

  async function runScore() {
    if (!photo) return;
    setScoring(true);
    setScoreError(null);
    try {
      const res = await fetch(`/api/patient-documents/${photo.id}/score`, {
        method: "POST", credentials: "include",
      }).then((r) => r.json());
      if (res?.success && res.data) {
        setScore(res.data as PhotoScoreRow);
      } else {
        setScoreError(res?.error || "Scoring failed");
      }
    } catch {
      setScoreError("Network error during scoring");
    } finally {
      setScoring(false);
    }
  }

  const sevTone = (s: PhotoScoreRow["severity"]) =>
    s === "SEVERE" ? "bg-red-500" :
    s === "MODERATE" ? "bg-amber-500" :
    s === "MILD" ? "bg-emerald-500" :
    "bg-stone-400";

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col" onClick={onClose}>
      <div className="flex items-center justify-between px-4 py-3 bg-black/70 backdrop-blur">
        <div className="flex items-center gap-2 min-w-0">
          {kind !== "other" && (
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
              kind === "before" ? "bg-amber-500 text-white" : "bg-emerald-500 text-white"
            }`}>
              {kind === "before" ? "BEFORE" : "AFTER"}
            </span>
          )}
          <div className="min-w-0">
            <p className="text-white text-sm font-medium truncate">{photo.name}</p>
            <p className="text-white/60 text-[10px]">{dateLabel}{photo.uploadedBy?.name ? ` · ${photo.uploadedBy.name}` : ""}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isImage && (
            <button
              onClick={(e) => { e.stopPropagation(); runScore(); }}
              disabled={scoring}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-violet-600 active:bg-violet-700 text-white text-xs font-medium disabled:opacity-60"
              title="Run AI dermatology assessment"
            >
              <Sparkles className={"w-3.5 h-3.5" + (scoring ? " animate-spin" : "")} />
              {scoring ? "Analyzing…" : score ? "Re-analyze" : "Analyze with AI"}
            </button>
          )}
          <button onClick={e => { e.stopPropagation(); onClose(); }} className="p-2 rounded-xl bg-white/10 active:bg-white/20 shrink-0">
            <X className="w-5 h-5 text-white" />
          </button>
        </div>
      </div>
      <div className="flex-1 flex items-center justify-center overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photo.fileUrl} alt={photo.name} className="max-w-full max-h-full object-contain" />
      </div>
      {photo.notes && (
        <div className="px-4 py-3 bg-black/70 text-white text-xs">{photo.notes}</div>
      )}
      {scoreError && (
        <div className="px-4 py-2 bg-red-900/80 text-red-100 text-xs flex items-center gap-2" onClick={e => e.stopPropagation()}>
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          {scoreError}
        </div>
      )}
      {score && (
        <div className="px-4 py-3 bg-black/85 text-white text-xs space-y-1.5 max-h-[40vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] uppercase tracking-wider font-bold text-violet-300">AI Assessment</span>
            {score.condition && <span className="text-white font-medium">{score.condition}</span>}
            {score.severity && (
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${sevTone(score.severity)}`}>
                {score.severity}
              </span>
            )}
            {typeof score.confidence === "number" && (
              <span className="text-white/60 text-[10px]">{score.confidence}% confidence</span>
            )}
          </div>
          {(score.bodyArea || typeof score.lesionCount === "number") && (
            <div className="text-white/70 text-[11px]">
              {score.bodyArea && <span>{score.bodyArea}</span>}
              {score.bodyArea && typeof score.lesionCount === "number" && <span> · </span>}
              {typeof score.lesionCount === "number" && <span>{score.lesionCount} lesion{score.lesionCount === 1 ? "" : "s"}</span>}
            </div>
          )}
          {score.findings && (
            <p className="text-white/90 leading-relaxed"><span className="text-white/50 mr-1">Findings:</span>{score.findings}</p>
          )}
          {score.recommendations && (
            <p className="text-white/90 leading-relaxed"><span className="text-white/50 mr-1">Suggestions:</span>{score.recommendations}</p>
          )}
          <p className="text-[10px] text-white/40 pt-1">
            Informational only — clinical judgment supersedes. {score.modelId} · {new Date(score.createdAt).toLocaleString("en-PK", { timeZone: CLINIC_TZ })}
          </p>
        </div>
      )}
    </div>
  );
}

// ---- util ----
function appendLine(prev: string, added: string): string {
  const p = (prev || "").trim();
  const a = (added || "").trim();
  if (!a) return p;
  if (!p) return a;
  return `${p}\n${a}`;
}

// ============================================================
// v55 — ICD-10 picker (autocomplete on /api/icd10)
// ============================================================
// Lightweight typeahead. Starts with `isCommon=true` codes loaded so
// the dropdown isn't empty on first open. Typing 1+ characters
// re-queries the API. Selected codes render as chips above the input;
// the first chip is the primary diagnosis (UI-implicit ordering).
function Icd10Picker({
  selected,
  onChange,
}: {
  selected: Icd10Row[];
  onChange: (next: Icd10Row[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<Icd10Row[]>([]);
  const [loading, setLoading] = useState(false);

  // Debounced fetch — prevents a request per keystroke.
  useEffect(() => {
    const handle = setTimeout(async () => {
      setLoading(true);
      try {
        const url = `/api/icd10?q=${encodeURIComponent(query)}&limit=20`;
        const res = await fetch(url, { credentials: "include" }).then((r) => r.json());
        if (res?.success && Array.isArray(res.data)) {
          setResults(res.data as Icd10Row[]);
        }
      } catch { /* swallow — picker stays open with stale results */ }
      finally { setLoading(false); }
    }, query ? 180 : 0);
    return () => clearTimeout(handle);
  }, [query]);

  const visible = results.filter((r) => !selected.some((s) => s.code === r.code));

  function add(row: Icd10Row) {
    if (selected.some((s) => s.code === row.code)) return;
    onChange([...selected, row]);
    setQuery("");
  }
  function remove(code: string) {
    onChange(selected.filter((s) => s.code !== code));
  }
  function makePrimary(code: string) {
    const idx = selected.findIndex((s) => s.code === code);
    if (idx <= 0) return;
    const next = [...selected];
    const [picked] = next.splice(idx, 1);
    next.unshift(picked);
    onChange(next);
  }

  return (
    <div className="mt-2">
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {selected.map((c, idx) => {
            const primary = idx === 0;
            return (
              <span
                key={c.code}
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border ${
                  primary
                    ? "bg-teal-50 text-teal-800 border-teal-200"
                    : "bg-stone-50 text-stone-700 border-stone-200"
                }`}
                title={c.description}
              >
                {primary && <span className="text-[9px] uppercase tracking-wider font-bold mr-0.5 text-teal-600">PRIMARY</span>}
                <span className="font-mono">{c.code}</span>
                <span className="text-stone-500 max-w-[180px] truncate">{c.description}</span>
                {!primary && (
                  <button onClick={() => makePrimary(c.code)} className="text-stone-400 hover:text-teal-600 ml-0.5" title="Make primary">★</button>
                )}
                <button onClick={() => remove(c.code)} className="text-stone-400 hover:text-red-500 ml-0.5">
                  <X className="w-3 h-3" />
                </button>
              </span>
            );
          })}
        </div>
      )}

      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder="ICD-10: type 'L70' or 'acne'…"
          className="w-full px-3 py-2 text-xs bg-white border border-stone-200 rounded-lg outline-none focus:border-teal-500"
        />
        {open && (visible.length > 0 || loading) && (
          <div className="absolute z-30 left-0 right-0 mt-1 bg-white rounded-lg border border-stone-200 shadow-lg max-h-64 overflow-y-auto">
            {loading && <div className="px-3 py-2 text-[11px] text-stone-400">Searching…</div>}
            {visible.map((r) => (
              <button
                key={r.code}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => add(r)}
                className="w-full text-left px-3 py-2 hover:bg-teal-50 flex items-center gap-2 border-b border-stone-100 last:border-b-0"
              >
                <span className="font-mono text-xs text-teal-700 shrink-0 w-14">{r.code}</span>
                <span className="text-xs text-stone-700 flex-1 truncate">{r.description}</span>
                {r.category && <span className="text-[10px] text-stone-400 shrink-0 hidden sm:inline">{r.category}</span>}
              </button>
            ))}
            {!loading && visible.length === 0 && (
              <div className="px-3 py-2 text-[11px] text-stone-400">No matches</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
