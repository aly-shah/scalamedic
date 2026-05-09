/**
 * Demo data seeder. Given a tenant marked isDemo=true, wipes its
 * existing clinical data and regenerates a realistic dermatology-
 * clinic shape so prospects can explore the product without
 * touching real patient records.
 *
 * Safety: refuses to run unless tenant.isDemo === true. Wipes only
 * data scoped to the tenant's branches (no cross-tenant leakage).
 *
 * Shape produced:
 *   - 1 ADMIN, 3 DOCTORs, 2 RECEPTIONISTs (all share the same demo password)
 *   - ~40 patients with varied gender/age/skin types
 *   - 60-80 appointments spanning the last 30 days + next 21 days
 *   - Signed consultation notes for ~70% of past appointments
 *   - 15-20 prescriptions, 6-8 lab tests, 25-30 invoices
 *   - Most past invoices PAID, some PENDING/PARTIAL for the dashboard's
 *     "outstanding" widgets to have something to show
 */
import { createHash, randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";
import { Prisma } from "@prisma/client";

/** Deterministic SHA-256 hex used to satisfy the
 *  consultation_notes_signedcontenthash_when_signed CHECK on demo
 *  rows. Not the real canonical-content hash — see lib/consultation-
 *  note-hash.ts for the production helper. */
function hashFor(seed: string): string {
  return createHash("sha256").update(`demo-seed:${seed}`).digest("hex");
}

export type DemoSeedSummary = {
  branchId: string;
  users: { admin: number; doctors: number; receptionists: number };
  patients: number;
  appointments: { past: number; upcoming: number };
  consultationNotes: number;
  prescriptions: number;
  labTests: number;
  invoices: { paid: number; pendingOrPartial: number };
  pharmacyLines: number;
  products: number;
  packages: number;
  patientPackages: number;
  qrTokens: { appointment: number; invoice: number };
  insurances: number;
  claims: Record<"DRAFT" | "SUBMITTED" | "IN_REVIEW" | "APPROVED" | "PARTIAL" | "DENIED" | "PAID" | "APPEALED", number>;
};

const DEMO_DOCTORS = [
  { name: "Dr. Aisha Khan",       email: "aisha@demo.scalamedic.com",   speciality: "Dermatology",   licenseNumber: "PMC-DEMO-101", consultationFee: 3500 },
  { name: "Dr. Imran Siddiqui",   email: "imran@demo.scalamedic.com",   speciality: "Cosmetology",   licenseNumber: "PMC-DEMO-102", consultationFee: 4500 },
  { name: "Dr. Sana Malik",       email: "sana@demo.scalamedic.com",    speciality: "Trichology",    licenseNumber: "PMC-DEMO-103", consultationFee: 4000 },
];

const DEMO_RECEPTIONISTS = [
  { name: "Hira Ahmed",  email: "hira@demo.scalamedic.com" },
  { name: "Bilal Tariq", email: "bilal@demo.scalamedic.com" },
];

const DEMO_ADMIN = { name: "Demo Admin", email: "admin@demo.scalamedic.com" };

// Pakistani-region first/last name pool — feels appropriate for the clinic.
// Pairs first name + likely gender; last names chosen separately.
const FIRST_NAMES: Array<[string, "MALE" | "FEMALE"]> = [
  ["Ayesha", "FEMALE"], ["Hassan", "MALE"], ["Zainab", "FEMALE"], ["Bilal", "MALE"],
  ["Sara", "FEMALE"], ["Ahmed", "MALE"], ["Fatima", "FEMALE"], ["Usman", "MALE"],
  ["Maryam", "FEMALE"], ["Ali", "MALE"], ["Nadia", "FEMALE"], ["Tariq", "MALE"],
  ["Hina", "FEMALE"], ["Faisal", "MALE"], ["Sadia", "FEMALE"], ["Kamran", "MALE"],
  ["Rabia", "FEMALE"], ["Junaid", "MALE"], ["Sana", "FEMALE"], ["Imran", "MALE"],
  ["Aisha", "FEMALE"], ["Adeel", "MALE"], ["Mehwish", "FEMALE"], ["Bilqees", "FEMALE"],
  ["Saad", "MALE"], ["Anum", "FEMALE"], ["Hamza", "MALE"], ["Iqra", "FEMALE"],
  ["Zeeshan", "MALE"], ["Lubna", "FEMALE"], ["Haroon", "MALE"], ["Sumaira", "FEMALE"],
  ["Asad", "MALE"], ["Naila", "FEMALE"], ["Faraz", "MALE"], ["Mehreen", "FEMALE"],
  ["Yasir", "MALE"], ["Komal", "FEMALE"], ["Salman", "MALE"], ["Shaista", "FEMALE"],
];
const LAST_NAMES = [
  "Khan", "Ahmed", "Ali", "Malik", "Siddiqui", "Hussain", "Raza", "Rahman",
  "Iqbal", "Sheikh", "Qureshi", "Hashmi", "Awan", "Butt", "Shah", "Rizvi",
];

const SKIN_PRESENTATIONS = [
  {
    complaint: "Persistent acne on cheeks and forehead with occasional cysts",
    examination: "Mixed comedonal and inflammatory acne, Grade III. No scarring yet.",
    skinAssessment: "Sebaceous gland hyperactivity. T-zone oily, cheeks combination.",
    diagnosis: "Acne vulgaris, moderate (Grade III)",
    severity: "MODERATE" as const,
    plan: "Topical adapalene 0.1% nightly + benzoyl peroxide 2.5% AM. If no response in 8 weeks, consider oral isotretinoin 20 mg OD.",
    advice: "Avoid picking. Use non-comedogenic moisturizer. Apply broad-spectrum SPF 50+ daily.",
    affectedAreas: ["Face", "Forehead", "Chin"],
    rx: [
      { medicineName: "Adapalene 0.1% gel", dosage: "Pea-sized", frequency: "Once at night", duration: "8 weeks", route: "Topical", instructions: "Apply 30 min after washing. Skip on irritated days." },
      { medicineName: "Benzoyl peroxide 2.5%", dosage: "Thin layer", frequency: "Once in morning", duration: "8 weeks", route: "Topical", instructions: "Avoid contact with hair / fabric (bleaches)." },
      { medicineName: "Doxycycline 100 mg", dosage: "1 cap", frequency: "Once daily", duration: "6 weeks", route: "Oral", instructions: "Take with food. Avoid sun exposure." },
    ],
  },
  {
    complaint: "Symmetric dark patches on both cheeks worsening with sun",
    examination: "Centrofacial melasma pattern. Pigmentation deeper on malar prominences.",
    skinAssessment: "Mixed epidermal-dermal pigment on Wood's lamp.",
    diagnosis: "Melasma — centrofacial type",
    severity: "MILD" as const,
    plan: "Triple combination cream (hydroquinone 4% / tretinoin 0.05% / fluocinolone 0.01%) at night for 8 weeks. Strict photoprotection.",
    advice: "Broad-spectrum SPF 50+ every 2 hours when outdoors. Wide-brimmed hat. Avoid hormonal triggers if possible.",
    affectedAreas: ["Face", "Cheeks"],
    rx: [
      { medicineName: "Triple combination cream (HQ 4% / Tret 0.05% / FA 0.01%)", dosage: "Pea-sized", frequency: "Once at night", duration: "8 weeks", route: "Topical", instructions: "Stop and review at 8 weeks. Do not use during pregnancy." },
      { medicineName: "Sunscreen SPF 50+ tinted", dosage: "Two-finger length", frequency: "Reapply every 2 hours", duration: "Indefinite", route: "Topical", instructions: "Tinted formulation gives visible-light protection." },
    ],
  },
  {
    complaint: "Hair shedding for 3 months, more than usual on shower",
    examination: "Diffuse thinning of crown. Pull test mildly positive (5-7 hairs).",
    skinAssessment: "Telogen effluvium pattern. No scalp inflammation.",
    diagnosis: "Telogen effluvium, post-illness",
    severity: "MILD" as const,
    plan: "Reassurance — typically self-resolves in 3-6 months. Iron + vitamin D screening. Topical minoxidil 5% to support regrowth.",
    advice: "Gentle shampoo, avoid tight hairstyles. Recheck at 3 months.",
    affectedAreas: ["Scalp"],
    rx: [
      { medicineName: "Minoxidil 5% solution", dosage: "1 mL", frequency: "Twice daily", duration: "6 months", route: "Topical", instructions: "Apply to dry scalp. Initial increased shedding for 2-4 weeks is expected." },
      { medicineName: "Ferrous sulphate 200 mg", dosage: "1 tab", frequency: "Once daily", duration: "3 months", route: "Oral", instructions: "Take with vitamin C / orange juice for better absorption." },
    ],
  },
  {
    complaint: "Itchy red patches on elbows and knees, scaly",
    examination: "Well-demarcated erythematous plaques with silvery scale on extensor surfaces.",
    skinAssessment: "Classic plaque psoriasis distribution. ~5% BSA involvement.",
    diagnosis: "Psoriasis vulgaris",
    severity: "MODERATE" as const,
    plan: "Topical calcipotriol-betamethasone combination once daily for 4 weeks, then taper.",
    advice: "Emollients liberally. Avoid trauma to plaques (Koebner). Stress management.",
    affectedAreas: ["Elbows", "Knees", "Scalp"],
    rx: [
      { medicineName: "Calcipotriol + Betamethasone gel", dosage: "Thin layer", frequency: "Once daily", duration: "4 weeks", route: "Topical", instructions: "Apply only to plaques. Do not exceed 100 g/week." },
      { medicineName: "Emollient cream", dosage: "Generous", frequency: "Twice daily", duration: "Indefinite", route: "Topical", instructions: "Use plain emollient between flares." },
    ],
  },
  {
    complaint: "Persistent redness across cheeks with visible blood vessels",
    examination: "Erythematotelangiectatic rosacea. No papules or pustules. Mild flushing on examination.",
    skinAssessment: "Vascular reactivity prominent. Stinging on application of products.",
    diagnosis: "Rosacea — erythematotelangiectatic subtype",
    severity: "MILD" as const,
    plan: "Topical brimonidine for symptomatic flushing. Avoid known triggers (alcohol, spicy food, heat).",
    advice: "Gentle skincare only — no exfoliants or astringents. SPF 50+ mineral.",
    affectedAreas: ["Face", "Cheeks", "Nose"],
    rx: [
      { medicineName: "Brimonidine 0.33% gel", dosage: "Pea-sized for whole face", frequency: "Once daily as needed", duration: "PRN", route: "Topical", instructions: "Use only on days you need redness reduction. Don't use daily long-term." },
      { medicineName: "Mineral SPF 50+ (Zinc oxide based)", dosage: "Two-finger length", frequency: "Daily AM", duration: "Indefinite", route: "Topical", instructions: "Avoid chemical filters which may sting." },
    ],
  },
  {
    complaint: "Multiple skin tags and small dark moles for cosmetic removal",
    examination: "Multiple soft pedunculated acrochordons on neck and axilla. 6-8 benign-appearing seborrheic keratoses on trunk.",
    skinAssessment: "All lesions clinically benign; dermoscopy unremarkable.",
    diagnosis: "Acrochordons (skin tags) + seborrheic keratoses",
    severity: "MILD" as const,
    plan: "Electrocautery removal scheduled. No biopsy indicated.",
    advice: "Keep area clean post-procedure. Avoid sun exposure on treated areas for 2 weeks. SPF on healed areas.",
    affectedAreas: ["Neck", "Axilla", "Trunk"],
    rx: [
      { medicineName: "Mupirocin 2% ointment", dosage: "Thin layer", frequency: "Twice daily", duration: "5 days", route: "Topical", instructions: "Apply to electrocautery sites only." },
    ],
  },
  {
    complaint: "Unwanted facial hair on upper lip and chin",
    examination: "Coarse terminal hair on upper lip and chin. No virilization signs.",
    skinAssessment: "Hirsutism, mild. Ferriman-Gallwey ~6.",
    diagnosis: "Idiopathic hirsutism",
    severity: "MILD" as const,
    plan: "Long-pulse alexandrite laser hair reduction — series of 6 sessions, 6 weeks apart.",
    advice: "Avoid sun 2 weeks before/after each session. No plucking/waxing between sessions; shaving only.",
    affectedAreas: ["Face", "Upper lip", "Chin"],
    rx: [],
  },
  {
    complaint: "Painful boils in armpits, recurrent",
    examination: "Multiple inflammatory nodules and one draining sinus in left axilla. Hurley stage II.",
    skinAssessment: "Hidradenitis suppurativa.",
    diagnosis: "Hidradenitis suppurativa, Hurley stage II",
    severity: "MODERATE" as const,
    plan: "Clindamycin topical + oral doxycycline 12 weeks. Refer dermatology MDT for biologic evaluation if no improvement.",
    advice: "Loose-fitting clothing. Antibacterial wash. Weight management. Smoking cessation strongly advised.",
    affectedAreas: ["Axilla"],
    rx: [
      { medicineName: "Clindamycin 1% lotion", dosage: "Thin film", frequency: "Twice daily", duration: "12 weeks", route: "Topical", instructions: "Apply after washing." },
      { medicineName: "Doxycycline 100 mg", dosage: "1 cap", frequency: "Twice daily", duration: "12 weeks", route: "Oral", instructions: "Take with food. Avoid sun." },
    ],
  },
];

const TREATMENT_LINES = [
  { description: "Consultation - Dermatology", unit: 3500, taxRate: 0.03 },
  { description: "Chemical Peel - Glycolic 30%", unit: 8500, taxRate: 0.08 },
  { description: "Laser Hair Reduction - Upper Lip (1 session)", unit: 4500, taxRate: 0.08 },
  { description: "Laser Hair Reduction - Full Face (1 session)", unit: 12000, taxRate: 0.08 },
  { description: "HydraFacial - Signature", unit: 9500, taxRate: 0.08 },
  { description: "Microneedling with PRP", unit: 18000, taxRate: 0.08 },
  { description: "Botox - Glabella (per session)", unit: 22000, taxRate: 0.08 },
  { description: "Skin tag removal (electrocautery, up to 5)", unit: 6500, taxRate: 0.03 },
  { description: "Acne extraction facial", unit: 5500, taxRate: 0.03 },
  { description: "Routine skin biopsy + histopathology", unit: 7500, taxRate: 0.03 },
];

// Pharmacy retail catalog the demo branch dispenses. Tax 0.08 (cosmetic
// rate from lib/tax-rates.ts) since most clinic OTC retail sits in the
// cosmetic bucket — admin can reclassify per-product later. SKU prefix
// "DEMO-" makes these unmistakably demo data; the seeder upserts by SKU
// so re-runs keep the same product ids.
const DEMO_PRODUCTS = [
  { sku: "DEMO-CL-01",   name: "Gentle Foaming Cleanser",      category: "CLEANSER"   as const, brand: "DermaPro",   costPrice: 850,  sellPrice: 1500, unit: "tube",   quantity: 40 },
  { sku: "DEMO-MOIST-01",name: "Hydra Daily Moisturizer",      category: "MOISTURIZER" as const, brand: "DermaPro",   costPrice: 1100, sellPrice: 2200, unit: "bottle", quantity: 28 },
  { sku: "DEMO-SPF-01",  name: "Tinted SPF 50+",                category: "SUNSCREEN"  as const, brand: "SkinShield", costPrice: 1400, sellPrice: 2800, unit: "tube",   quantity: 35 },
  { sku: "DEMO-SER-01",  name: "Vitamin C 15% Serum",           category: "SERUM"      as const, brand: "DermaPro",   costPrice: 1800, sellPrice: 3500, unit: "bottle", quantity: 22 },
  { sku: "DEMO-SER-02",  name: "Niacinamide 10% Serum",         category: "SERUM"      as const, brand: "DermaPro",   costPrice: 1600, sellPrice: 3200, unit: "bottle", quantity: 18 },
  { sku: "DEMO-SER-03",  name: "Retinol 0.5% Serum",            category: "SERUM"      as const, brand: "SkinShield", costPrice: 2200, sellPrice: 4500, unit: "bottle", quantity: 14 },
  { sku: "DEMO-TRT-01",  name: "Adapalene 0.1% Gel",            category: "TREATMENT"  as const, brand: "Generic",    costPrice: 450,  sellPrice: 950,  unit: "tube",   quantity: 50 },
  { sku: "DEMO-TRT-02",  name: "Benzoyl Peroxide 2.5% Gel",     category: "TREATMENT"  as const, brand: "Generic",    costPrice: 380,  sellPrice: 800,  unit: "tube",   quantity: 45 },
  { sku: "DEMO-SUP-01",  name: "Biotin 5000mcg (60 caps)",      category: "SUPPLEMENT" as const, brand: "VitaCo",     costPrice: 1200, sellPrice: 2400, unit: "bottle", quantity: 30 },
  { sku: "DEMO-SUP-02",  name: "Zinc Picolinate (60 caps)",     category: "SUPPLEMENT" as const, brand: "VitaCo",     costPrice: 900,  sellPrice: 1800, unit: "bottle", quantity: 25 },
  { sku: "DEMO-HAIR-01", name: "Minoxidil 5% Solution",         category: "HAIR"       as const, brand: "RegrowRx",   costPrice: 1700, sellPrice: 3400, unit: "bottle", quantity: 20 },
  { sku: "DEMO-TOOL-01", name: "Soft-bristle facial brush",     category: "TOOL"       as const, brand: "Generic",    costPrice: 250,  sellPrice: 600,  unit: "piece",  quantity: 60 },
];

// Multi-session bundles. Names prefixed "[Demo]" so they're identifiable
// in the catalog and we can clean them up later via name filter without
// touching tenant-supplied packages. PackageBranch ties them to the demo
// branch; PackageTreatment children carry denormalized snapshots
// (treatmentId optional — set null since the demo doesn't seed a real
// Treatment catalog).
const DEMO_PACKAGES = [
  {
    name: "[Demo] Acne Clearance — 6 sessions",
    description: "Six fortnightly sessions: chemical peel + extraction + photofacial.",
    price: 42000, validityDays: 180, maxRedemptions: 6,
    treatments: [
      { name: "Chemical Peel - Glycolic 30%", sessions: 3 },
      { name: "Acne extraction facial",       sessions: 3 },
    ],
  },
  {
    name: "[Demo] Laser Hair Reduction — Full Face × 6",
    description: "Six sessions of full-face LHR, spaced 4-6 weeks apart.",
    price: 60000, validityDays: 360, maxRedemptions: 6,
    treatments: [
      { name: "Laser Hair Reduction - Full Face (1 session)", sessions: 6 },
    ],
  },
  {
    name: "[Demo] HydraFacial Glow — 4 sessions",
    description: "Four monthly HydraFacials for sustained radiance.",
    price: 32000, validityDays: 150, maxRedemptions: 4,
    treatments: [
      { name: "HydraFacial - Signature", sessions: 4 },
    ],
  },
  {
    name: "[Demo] Anti-Ageing Bundle — 3 sessions",
    description: "Three sessions of microneedling with PRP plus a Botox top-up.",
    price: 70000, validityDays: 240, maxRedemptions: 3,
    treatments: [
      { name: "Microneedling with PRP",         sessions: 3 },
      { name: "Botox - Glabella (per session)", sessions: 1 },
    ],
  },
];

// ---------- Helpers ----------

function pick<T>(arr: T[], idx: number): T { return arr[((idx % arr.length) + arr.length) % arr.length]; }
function rand(seed: number, hi: number): number {
  // Mulberry32-ish; deterministic so re-seed produces stable shapes per call
  let t = seed * 0x6d2b79f5 + 0x9e3779b9;
  t = (t ^ (t >>> 15)) >>> 0;
  t = (t * (t | 1)) >>> 0;
  return t % Math.max(1, hi);
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(0, 0, 0, 0);
  return d;
}
function daysFromNow(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + n);
  d.setHours(0, 0, 0, 0);
  return d;
}
function pad(n: number, w: number): string { return String(n).padStart(w, "0"); }

// ---------- Wipe ----------

async function wipeDemoTenantData(tenantId: string): Promise<void> {
  const branches = await prisma.branch.findMany({ where: { tenantId }, select: { id: true } });
  const branchIds = branches.map((b) => b.id);

  const [patients, appointments, invoices, users, leads] = await Promise.all([
    branchIds.length
      ? prisma.patient.findMany({ where: { branchId: { in: branchIds } }, select: { id: true } })
      : Promise.resolve([]),
    branchIds.length
      ? prisma.appointment.findMany({ where: { branchId: { in: branchIds } }, select: { id: true } })
      : Promise.resolve([]),
    branchIds.length
      ? prisma.invoice.findMany({ where: { branchId: { in: branchIds } }, select: { id: true } })
      : Promise.resolve([]),
    prisma.user.findMany({ where: { tenantId }, select: { id: true } }),
    branchIds.length
      ? prisma.lead.findMany({ where: { branchId: { in: branchIds } }, select: { id: true } })
      : Promise.resolve([]),
  ]);

  const patientIds = patients.map((p) => p.id);
  const appointmentIds = appointments.map((a) => a.id);
  const invoiceIds = invoices.map((i) => i.id);
  const userIds = users.map((u) => u.id);
  const leadIds = leads.map((l) => l.id);

  await prisma.$transaction(async (tx) => {
    // v58 — Insurance claims block invoice deletion (Restrict FK).
    // Must clear claims before the invoice tree.
    if (patientIds.length) {
      await tx.insuranceClaim.deleteMany({ where: { patientId: { in: patientIds } } });
    }

    // Invoice tree
    if (invoiceIds.length) {
      await tx.payment.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
      await tx.refund.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
      await tx.invoiceItem.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
      await tx.qrToken.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
      await tx.invoice.deleteMany({ where: { id: { in: invoiceIds } } });
    }

    // Clinical records keyed by patient
    if (patientIds.length) {
      await tx.consultationNoteRevision.deleteMany({ where: { consultationNote: { patientId: { in: patientIds } } } });
      await tx.consultationNote.deleteMany({ where: { patientId: { in: patientIds } } });
      await tx.prescriptionItem.deleteMany({ where: { prescription: { patientId: { in: patientIds } } } });
      await tx.prescription.deleteMany({ where: { patientId: { in: patientIds } } });
      await tx.labTestResult.deleteMany({ where: { labTest: { patientId: { in: patientIds } } } });
      await tx.labTest.deleteMany({ where: { patientId: { in: patientIds } } });
      await tx.procedure.deleteMany({ where: { patientId: { in: patientIds } } });
      await tx.followUp.deleteMany({ where: { patientId: { in: patientIds } } });
      await tx.aITranscription.deleteMany({ where: { patientId: { in: patientIds } } });
      await tx.aISuggestion.deleteMany({ where: { patientId: { in: patientIds } } });
      await tx.communicationLog.deleteMany({ where: { patientId: { in: patientIds } } });
      await tx.callLog.deleteMany({ where: { patientId: { in: patientIds } } });
      await tx.triage.deleteMany({ where: { patientId: { in: patientIds } } });
      await tx.consentForm.deleteMany({ where: { patientId: { in: patientIds } } });
      await tx.waitlist.deleteMany({ where: { patientId: { in: patientIds } } });
      await tx.roomAllocation.deleteMany({ where: { patientId: { in: patientIds } } });
      await tx.patientDocument.deleteMany({ where: { patientId: { in: patientIds } } });
      await tx.patientPackage.deleteMany({ where: { patientId: { in: patientIds } } });
      await tx.patientInvite.deleteMany({ where: { patientId: { in: patientIds } } });
      await tx.patientAllergy.deleteMany({ where: { patientId: { in: patientIds } } });
      await tx.patientMedication.deleteMany({ where: { patientId: { in: patientIds } } });
      await tx.medicalHistory.deleteMany({ where: { patientId: { in: patientIds } } });
      await tx.skinHistory.deleteMany({ where: { patientId: { in: patientIds } } });
      await tx.insurance.deleteMany({ where: { patientId: { in: patientIds } } });
      await tx.patientTag.deleteMany({ where: { patientId: { in: patientIds } } });
    }

    if (appointmentIds.length) {
      await tx.qrToken.deleteMany({ where: { appointmentId: { in: appointmentIds } } });
      await tx.appointment.deleteMany({ where: { id: { in: appointmentIds } } });
    }

    // Cold-lead cleanup. Lead.assignedToId Restricts to User and
    // CallLog.userId Restricts to User, so any CallLog/CommunicationLog
    // attributed to a demo user (with no patient match — typical for
    // cold dialer rows) blocks the user delete below. Wipe by user
    // and by lead to catch every path.
    if (userIds.length) {
      await tx.callLog.deleteMany({ where: { userId: { in: userIds } } });
      await tx.communicationLog.deleteMany({ where: { sentById: { in: userIds } } });
    }
    if (leadIds.length) {
      await tx.callLog.deleteMany({ where: { leadId: { in: leadIds } } });
      await tx.communicationLog.deleteMany({ where: { leadId: { in: leadIds } } });
      await tx.lead.deleteMany({ where: { id: { in: leadIds } } });
    }

    if (patientIds.length) {
      await tx.patient.deleteMany({ where: { id: { in: patientIds } } });
    }

    // Per-tenant user-side data
    if (userIds.length) {
      await tx.permission.deleteMany({ where: { userId: { in: userIds } } });
      await tx.notification.deleteMany({ where: { userId: { in: userIds } } });
      await tx.doctorSchedule.deleteMany({ where: { doctorId: { in: userIds } } });
      await tx.doctorLeave.deleteMany({ where: { OR: [{ doctorId: { in: userIds } }, { approvedById: { in: userIds } }] } });
      await tx.blockedSlot.deleteMany({ where: { OR: [{ doctorId: { in: userIds } }, { createdById: { in: userIds } }] } });
      await tx.revokedSession.deleteMany({ where: { userId: { in: userIds } } });
      // AuditLog: scoped wipe by userId so we drop only this tenant's
      // audit history. AuditLog has no tenantId column (it's global,
      // FK userId is SetNull), so a demo-cloned-from-prod tenant ships
      // with prod's full audit trail visible under /admin/audit until
      // we explicitly clear it. AuditLog.userId is SetNull on user
      // delete, so technically not required for FK integrity — done
      // here for PII reasons.
      await tx.auditLog.deleteMany({ where: { userId: { in: userIds } } });
      await tx.user.deleteMany({ where: { id: { in: userIds } } });
    }
  }, { timeout: 60000 });
}

// ---------- Tenant master-data backfill ----------
// v59 (payers) and v60 (denial reasons) ran their seeds at migration
// apply time. Tenants created later are missing the master rows, so
// the demo seeder (and any future "new tenant" bootstrap that needs
// these tables populated) calls this first. Upsert-by-(tenantId,code)
// keeps it idempotent across re-seeds.

const SEED_PAYERS: Array<{ name: string; code: string; email: string | null; phone: string | null }> = [
  { name: "EFU Life Assurance",      code: "EFU-LIFE",     email: "health@efulife.com",     phone: "+92-21-111-338-111" },
  { name: "Adamjee Life Assurance",  code: "ADAMJEE-LIFE", email: "health@adamjeelife.com", phone: "+92-21-111-2326-3245" },
  { name: "Jubilee Life Insurance",  code: "JUBILEE-LIFE", email: "health@jubileelife.com", phone: "+92-21-111-111-554" },
  { name: "State Life Insurance",    code: "STATE-LIFE",   email: null,                     phone: "+92-21-99202800" },
  { name: "NICL National Insurance", code: "NICL",         email: null,                     phone: "+92-21-99211212" },
  { name: "IGI Life",                code: "IGI-LIFE",     email: "info@igi.com.pk",        phone: "+92-21-111-308-308" },
  { name: "Allianz EFU Health",      code: "ALLIANZ-EFU",  email: "efuhealth@efuhealth.com",phone: "+92-21-3453-2960-2" },
  { name: "Salaam Family Takaful",   code: "SALAAM-TKFL",  email: "info@salaamtakaful.com", phone: "+92-21-111-878-787" },
  { name: "TPL Life",                code: "TPL-LIFE",     email: "info@tpllife.com",       phone: "+92-21-111-000-300" },
  { name: "Self-pay (no insurer)",   code: "SELFPAY",      email: null,                     phone: null },
];

const SEED_DENIAL_REASONS: Array<{ code: string; description: string; isCommon: boolean }> = [
  { code: "AUTH-MISSING",  description: "Pre-authorization not obtained",                       isCommon: true  },
  { code: "AUTH-EXPIRED",  description: "Pre-authorization expired before service date",        isCommon: false },
  { code: "NOT-COVERED",   description: "Service not covered under the plan",                   isCommon: true  },
  { code: "NOT-MEDICAL",   description: "Procedure deemed cosmetic / not medically necessary",  isCommon: true  },
  { code: "PATIENT-INELIG",description: "Patient not eligible on the date of service",          isCommon: true  },
  { code: "POLICY-LAPSED", description: "Policy lapsed or premium unpaid",                      isCommon: false },
  { code: "DUPLICATE",     description: "Duplicate claim submission",                           isCommon: false },
  { code: "DOC-MISSING",   description: "Supporting documentation incomplete",                  isCommon: true  },
  { code: "DX-MISMATCH",   description: "Diagnosis does not support the procedure billed",      isCommon: true  },
  { code: "CODING-ERROR",  description: "Incorrect coding (CPT / ICD-10)",                      isCommon: false },
  { code: "NETWORK-OOO",   description: "Provider is out-of-network",                           isCommon: false },
  { code: "FREQ-LIMIT",    description: "Frequency / annual limit exceeded",                    isCommon: false },
  { code: "TIMELY-FILE",   description: "Claim submitted after timely-filing deadline",         isCommon: false },
  { code: "COB",           description: "Coordination of benefits — primary payer first",       isCommon: false },
  { code: "OTHER",         description: "Other reason — see free-text notes",                   isCommon: true  },
];

async function ensureTenantMasterData(tenantId: string): Promise<void> {
  // Payers
  for (const p of SEED_PAYERS) {
    const existing = await prisma.payer.findUnique({
      where: { tenantId_code: { tenantId, code: p.code } },
    });
    if (existing) continue;
    await prisma.payer.create({
      data: {
        tenantId,
        name: p.name,
        code: p.code,
        contactEmail: p.email,
        contactPhone: p.phone,
        isActive: true,
      },
    });
  }
  // Denial reasons
  for (const r of SEED_DENIAL_REASONS) {
    const existing = await prisma.denialReason.findUnique({
      where: { tenantId_code: { tenantId, code: r.code } },
    });
    if (existing) continue;
    await prisma.denialReason.create({
      data: {
        tenantId,
        code: r.code,
        description: r.description,
        isCommon: r.isCommon,
        isActive: true,
      },
    });
  }
}

// ---------- Seed ----------

export async function seedDemoTenant(opts: {
  tenantId: string;
  password: string;
}): Promise<DemoSeedSummary> {
  const tenant = await prisma.tenant.findUnique({ where: { id: opts.tenantId } });
  if (!tenant) throw new Error(`Tenant ${opts.tenantId} not found`);
  if (!tenant.isDemo) throw new Error("Refusing to seed: tenant.isDemo is false");

  // v59 / v60 master data is seeded by the migrations at apply time,
  // but only for tenants that existed then. New tenants (created via
  // /api/tenant/onboard or this demo bootstrap) miss the seed — so we
  // backfill here before relying on the data downstream.
  await ensureTenantMasterData(opts.tenantId);

  await wipeDemoTenantData(opts.tenantId);

  // Branch — reuse if one exists, otherwise create. v52 keeps existing
  // branches under a demo tenant alive on reset; only patients/users get
  // wiped.
  let branch = await prisma.branch.findFirst({ where: { tenantId: opts.tenantId, isActive: true } });
  if (!branch) {
    const code = `D${opts.tenantId.replace(/-/g, "").slice(0, 6).toUpperCase()}`;
    branch = await prisma.branch.create({
      data: {
        name: "Demo Skin Clinic",
        code,
        address: "Plot 12, Demo Street, Karachi",
        phone: "+92-300-0000000",
        email: `clinic+${code.toLowerCase()}@demo.scalamedic.com`,
        timezone: "Asia/Karachi",
        tenantId: opts.tenantId,
        isActive: true,
      },
    });
  }

  // ---- Demo product catalog ----
  // findFirst-or-create rather than upsert: products_sku_key is a
  // *partial* unique index (WHERE sku IS NOT NULL), and Postgres'
  // ON CONFLICT (sku) needs a non-partial unique to match — Prisma's
  // upsert would 42P10. Reuses the same product id across re-runs so
  // historic invoice-item references survive.
  const productRecords: Array<{ id: string; sku: string; sellPrice: number; name: string }> = [];
  for (const p of DEMO_PRODUCTS) {
    const existing = await prisma.product.findFirst({ where: { sku: p.sku } });
    const data = {
      name: p.name,
      category: p.category,
      brand: p.brand,
      costPrice: new Prisma.Decimal(p.costPrice),
      sellPrice: new Prisma.Decimal(p.sellPrice),
      quantity: p.quantity,
      unit: p.unit,
      branchId: branch.id,
      isActive: true,
    };
    const product = existing
      ? await prisma.product.update({ where: { id: existing.id }, data })
      : await prisma.product.create({ data: { sku: p.sku, ...data } });
    productRecords.push({ id: product.id, sku: p.sku, sellPrice: p.sellPrice, name: p.name });
  }

  // ---- Demo package catalog ----
  // Package has no tenantId/branchId (it's global); we tag identifiers
  // with a "[Demo] " prefix and tie availability via PackageBranch.
  // findFirst-or-create by name so re-runs reuse the same package id.
  // PackageTreatment children are wipe-and-recreate so name/sessions
  // updates from the constants land on next seed.
  const packageRecords: Array<{ id: string; name: string; price: number; treatments: Array<{ name: string; sessions: number }> }> = [];
  for (const pkg of DEMO_PACKAGES) {
    let p = await prisma.package.findFirst({ where: { name: pkg.name } });
    if (!p) {
      p = await prisma.package.create({
        data: {
          name: pkg.name,
          description: pkg.description,
          price: new Prisma.Decimal(pkg.price),
          validityDays: pkg.validityDays,
          maxRedemptions: pkg.maxRedemptions,
          isActive: true,
        },
      });
    } else {
      // Refresh price/description/validity so constants stay authoritative.
      await prisma.package.update({
        where: { id: p.id },
        data: {
          description: pkg.description,
          price: new Prisma.Decimal(pkg.price),
          validityDays: pkg.validityDays,
          maxRedemptions: pkg.maxRedemptions,
          isActive: true,
        },
      });
    }
    await prisma.packageBranch.upsert({
      where: { packageId_branchId: { packageId: p.id, branchId: branch.id } },
      update: {},
      create: { packageId: p.id, branchId: branch.id },
    });
    await prisma.packageTreatment.deleteMany({ where: { packageId: p.id } });
    await prisma.packageTreatment.createMany({
      data: pkg.treatments.map((t) => ({
        packageId: p!.id,
        name: t.name,
        sessions: t.sessions,
      })),
    });
    packageRecords.push({ id: p.id, name: pkg.name, price: pkg.price, treatments: pkg.treatments });
  }

  const passwordHash = await hashPassword(opts.password);

  // ---- Users ----
  const adminUser = await prisma.user.create({
    data: {
      email: DEMO_ADMIN.email,
      passwordHash,
      name: DEMO_ADMIN.name,
      role: "ADMIN",
      branchId: branch.id,
      tenantId: opts.tenantId,
      isActive: true,
    },
  });

  const doctors: Array<{ id: string; name: string; consultationFee: number }> = [];
  for (const d of DEMO_DOCTORS) {
    const u = await prisma.user.create({
      data: {
        email: d.email,
        passwordHash,
        name: d.name,
        role: "DOCTOR",
        branchId: branch.id,
        tenantId: opts.tenantId,
        speciality: d.speciality,
        licenseNumber: d.licenseNumber,
        consultationFee: d.consultationFee,
        isActive: true,
      },
    });
    doctors.push({ id: u.id, name: u.name, consultationFee: d.consultationFee });
  }

  const receptionists: Array<{ id: string; name: string }> = [];
  for (const r of DEMO_RECEPTIONISTS) {
    const u = await prisma.user.create({
      data: {
        email: r.email,
        passwordHash,
        name: r.name,
        role: "RECEPTIONIST",
        branchId: branch.id,
        tenantId: opts.tenantId,
        isActive: true,
      },
    });
    receptionists.push({ id: u.id, name: u.name });
  }

  // ---- Patients ----
  const patients: Array<{ id: string; gender: "MALE" | "FEMALE"; doctorId: string; presentation: typeof SKIN_PRESENTATIONS[number] }> = [];
  const PATIENT_COUNT = 40;
  for (let i = 0; i < PATIENT_COUNT; i++) {
    const [first, gender] = pick(FIRST_NAMES, i);
    const last = pick(LAST_NAMES, i + 7);
    const ageYears = 18 + rand(i + 100, 50); // 18-68
    const dob = new Date();
    dob.setFullYear(dob.getFullYear() - ageYears);
    dob.setMonth(rand(i + 200, 12));
    dob.setDate(1 + rand(i + 300, 27));
    const skinTypeIdx = rand(i + 400, 6);
    const skinType = (["TYPE_I", "TYPE_II", "TYPE_III", "TYPE_IV", "TYPE_V", "TYPE_VI"] as const)[skinTypeIdx];
    const phoneSuffix = pad(1000 + i * 7, 7);
    const presentation = pick(SKIN_PRESENTATIONS, i);
    const doctor = pick(doctors, i);

    const p = await prisma.patient.create({
      data: {
        patientCode: `PT-${pad(i + 1, 4)}`,
        firstName: first,
        lastName: last,
        email: `${first.toLowerCase()}.${last.toLowerCase()}+${i + 1}@demo.scalamedic.com`,
        phone: `+923${pad(rand(i + 500, 90) + 10, 2)}${phoneSuffix}`,
        dateOfBirth: dob,
        gender,
        nationality: "Pakistani",
        tenantId: opts.tenantId,
        city: pick(["Karachi", "Lahore", "Islamabad", "Hyderabad"], i),
        skinType,
        branchId: branch.id,
        assignedDoctorId: doctor.id,
        consentGiven: true,
        isActive: true,
        source: pick(["WALK_IN", "REFERRAL", "WEBSITE", "SOCIAL_MEDIA", "CALL"] as const, i),
      },
    });

    // Allergies (~30% have one)
    if (i % 3 === 0) {
      await prisma.patientAllergy.create({
        data: {
          patientId: p.id,
          allergen: pick(["Sulfa drugs", "Penicillin", "Latex", "Fragrance", "Nickel"], i),
          severity: pick(["MILD", "MODERATE", "SEVERE"] as const, i),
        },
      });
    }

    // Skin history (most patients have one)
    if (i % 4 !== 0) {
      await prisma.skinHistory.create({
        data: {
          patientId: p.id,
          condition: presentation.diagnosis,
          affectedArea: presentation.affectedAreas.join(", "),
          severity: presentation.severity,
          notes: presentation.complaint,
        },
      });
    }

    patients.push({ id: p.id, gender, doctorId: doctor.id, presentation });
  }

  // ---- Appointments — pinned May 7-18, 2026 window, ~50 slots ----
  // Pinned date window so the demo always shows a populated calendar
  // straddling the seed run's "today": past days are completed visits
  // with signed notes + invoices, today is mid-flow, future days are
  // scheduled bookings for the upcoming-week dashboards. Bump these
  // constants when the window goes stale (after 2026-05-18).
  const WINDOW_START = new Date(2026, 4, 7);  // 2026-05-07 (month 4 = May)
  const WINDOW_DAYS = 12;                     // through 2026-05-18 inclusive
  const TARGET_APPT_COUNT = 50;

  type Slot = { doctorId: string; date: string; startTime: string };
  const usedSlots = new Set<string>();
  const slotKey = (s: Slot) => `${s.doctorId}|${s.date}|${s.startTime}`;
  const SLOTS = ["09:00", "09:30", "10:00", "10:30", "11:00", "11:30", "12:00", "14:00", "14:30", "15:00", "15:30", "16:00", "16:30"];

  function nextSlot(doctorId: string, date: Date): { startTime: string; endTime: string } | null {
    const ds = date.toISOString().slice(0, 10);
    for (const t of SLOTS) {
      if (!usedSlots.has(slotKey({ doctorId, date: ds, startTime: t }))) {
        usedSlots.add(slotKey({ doctorId, date: ds, startTime: t }));
        const [h, m] = t.split(":").map(Number);
        const eM = m + 30;
        const endH = h + Math.floor(eM / 60);
        const endM = eM % 60;
        return { startTime: t, endTime: `${pad(endH, 2)}:${pad(endM, 2)}` };
      }
    }
    return null;
  }

  // "Today" boundary for past/future status decisions. Local midnight,
  // matching daysAgo()/daysFromNow() elsewhere in this file.
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let aptCounter = 1;
  let pastAppointmentsCount = 0;
  let upcomingAppointmentsCount = 0;
  let consultationNotesCount = 0;
  let prescriptionsCount = 0;

  // Day-driven loop. For each day in the window schedule ~5 visits;
  // patients round-robin, doctor = patient's assigned doctor. Status
  // comes from the day's relation to "today" — past days entirely
  // COMPLETED, today is mid-flow (first two slots done, third
  // CHECKED_IN, rest SCHEDULED), future days entirely SCHEDULED.
  let createdAppts = 0;
  let patientCursor = 0;
  const apptsPerDay = Math.ceil(TARGET_APPT_COUNT / WINDOW_DAYS);

  for (let d = 0; d < WINDOW_DAYS && createdAppts < TARGET_APPT_COUNT; d++) {
    const date = new Date(WINDOW_START);
    date.setDate(WINDOW_START.getDate() + d);
    date.setHours(0, 0, 0, 0);

    const isPast = date < today;
    const isToday = date.getTime() === today.getTime();

    for (let k = 0; k < apptsPerDay && createdAppts < TARGET_APPT_COUNT; k++) {
      const pat = patients[patientCursor % patients.length];
      patientCursor++;
      const slot = nextSlot(pat.doctorId, date);
      if (!slot) continue;

      const status: "COMPLETED" | "SCHEDULED" | "CHECKED_IN" =
        isPast ? "COMPLETED"
        : isToday && k < 2 ? "COMPLETED"
        : isToday && k === 2 ? "CHECKED_IN"
        : "SCHEDULED";

      const [sH, sM] = slot.startTime.split(":").map(Number);
      const slotStartMs = date.getTime() + (sH * 60 + sM) * 60_000;
      const checkin = status !== "SCHEDULED"
        ? new Date(slotStartMs + 5 * 60_000)
        : null;
      const checkout = status === "COMPLETED"
        ? new Date(slotStartMs + 35 * 60_000)
        : null;
      const stage =
        status === "COMPLETED" ? "CHECKOUT"
        : status === "CHECKED_IN" ? "WAITING"
        : "BOOKED";

      const apt = await prisma.appointment.create({
        data: {
          appointmentCode: `APT-${pad(aptCounter++, 4)}`,
          patientId: pat.id,
          doctorId: pat.doctorId,
          branchId: branch.id,
          tenantId: opts.tenantId,
          date,
          startTime: slot.startTime,
          endTime: slot.endTime,
          durationMinutes: 30,
          type: pick(["CONSULTATION", "FOLLOW_UP", "PROCEDURE", "REVIEW"] as const, createdAppts),
          status,
          workflowStage: stage,
          createdById: pick(receptionists, createdAppts).id,
          // Booking-time = 2 days before the slot for past visits, now for upcoming.
          createdAt: isPast ? new Date(slotStartMs - 2 * 86_400_000) : new Date(),
          checkinTime: checkin,
          checkoutTime: checkout,
        },
      });

      if (status === "COMPLETED") pastAppointmentsCount++;
      else upcomingAppointmentsCount++;

      // Signed consultation note for ~70% of completed visits.
      if (status === "COMPLETED" && rand(createdAppts + 800, 100) < 70) {
        const presentation = pat.presentation;
        await prisma.consultationNote.create({
          data: {
            appointmentId: apt.id,
            patientId: pat.id,
            doctorId: pat.doctorId,
            chiefComplaint: presentation.complaint,
            examination: presentation.examination,
            skinAssessment: presentation.skinAssessment,
            affectedAreas: presentation.affectedAreas,
            conditionSeverity: presentation.severity,
            diagnosis: presentation.diagnosis,
            treatmentPlan: presentation.plan,
            advice: presentation.advice,
            isSigned: true,
            // CHECK signedAt >= createdAt (v43): pin createdAt to checkin
            // so signed-at-checkout ordering holds.
            createdAt: checkin ?? apt.date,
            updatedAt: checkout ?? apt.date,
            signedAt: checkout,
            signedById: pat.doctorId,
            // CHECK signedcontenthash_when_signed: 64-char hex required
            // when isSigned=true. Deterministic fake (sha256 "demo:<id>")
            // — not the real canonical hash, identifiable as non-prod.
            signedContentHash: hashFor(`demo:${apt.id}`),
          },
        });
        consultationNotesCount++;

        // Rx for ~60% of signed notes.
        if (presentation.rx.length && rand(createdAppts + 900, 100) < 60) {
          await prisma.prescription.create({
            data: {
              patientId: pat.id,
              doctorId: pat.doctorId,
              appointmentId: apt.id,
              notes: "Standard regimen for diagnosis above.",
              isActive: true,
              items: {
                create: presentation.rx.map((it) => ({
                  medicineName: it.medicineName,
                  dosage: it.dosage,
                  frequency: it.frequency,
                  duration: it.duration,
                  route: it.route,
                  instructions: it.instructions,
                })),
              },
            },
          });
          prescriptionsCount++;
        }
      }

      createdAppts++;
    }
  }

  // ---- Lab tests for ~15% of patients ----
  let labTestsCount = 0;
  for (let i = 0; i < patients.length; i++) {
    if (rand(i + 1200, 100) >= 15) continue;
    const pat = patients[i];
    const testName = pick(["Complete Blood Count", "Liver Function Test", "Thyroid Profile (TSH/T3/T4)", "Vitamin D 25-OH", "Iron + Ferritin", "ANA"], i);
    const isCompleted = rand(i + 1300, 100) < 70;
    const completedAt = isCompleted ? daysAgo(rand(i + 1400, 14)) : null;
    // CHECK lab_tests_collectedAt_when_collected requires collectedAt
    // for SAMPLE_COLLECTED / PROCESSING / COMPLETED. PROCESSING means
    // sample was already taken; collectedAt is ~1 day ago.
    const collectedAt = completedAt
      ? new Date(completedAt.getTime() - 2 * 24 * 60 * 60 * 1000)
      : daysAgo(1 + rand(i + 1410, 3));
    await prisma.labTest.create({
      data: {
        patientId: pat.id,
        doctorId: pat.doctorId,
        testName,
        testCode: `LT-${pad(i + 1, 4)}`,
        status: isCompleted ? "COMPLETED" : "PROCESSING",
        priority: "NORMAL",
        collectedAt,
        completedAt,
        notes: isCompleted ? "Within reference ranges. No flags." : null,
      },
    });
    labTestsCount++;
  }

  // ---- Invoices ----
  // For every past appointment, an invoice with a treatment line + consultation
  // line. ~75% PAID, ~15% PARTIAL, ~10% PENDING. Tax computed per-line.
  const completedApts = await prisma.appointment.findMany({
    where: { branchId: branch.id, status: "COMPLETED" },
    select: { id: true, patientId: true, date: true, doctorId: true },
  });

  let paidInvoices = 0;
  let openInvoices = 0;
  let pharmacyLinesAdded = 0;
  let invCounter = 1;
  const year = new Date().getFullYear();

  type SeedLine = {
    description: string;
    qty: number;
    unit: number;
    taxRate: number;
    productId?: string;
    packageId?: string;
  };

  for (let i = 0; i < completedApts.length; i++) {
    const apt = completedApts[i];
    const treatment = pick(TREATMENT_LINES, i + 1); // skip "Consultation" sometimes via offset
    const consultLine = TREATMENT_LINES[0];
    const doctor = doctors.find((d) => d.id === apt.doctorId)!;

    // Consultation + treatment, plus an optional pharmacy line on
    // ~30% of visits — mirrors the dispense-on-checkout flow where a
    // doctor's recommended retail product gets billed alongside the
    // consult. Tax 0.08 (cosmetic) for OTC retail.
    const lines: SeedLine[] = [
      { description: consultLine.description, qty: 1, unit: doctor.consultationFee, taxRate: consultLine.taxRate },
      { description: treatment.description,   qty: 1, unit: treatment.unit,         taxRate: treatment.taxRate },
    ];
    if (productRecords.length > 0 && rand(i + 1700, 100) < 30) {
      const product = pick(productRecords, i);
      const qty = 1 + rand(i + 1750, 2);
      lines.push({
        description: product.name,
        qty,
        unit: product.sellPrice,
        taxRate: 0.08,
        productId: product.id,
      });
      pharmacyLinesAdded++;
    }

    const subtotal = lines.reduce((s, l) => s + l.qty * l.unit, 0);
    const tax = lines.reduce((s, l) => s + Math.round(l.qty * l.unit * l.taxRate * 100) / 100, 0);
    const total = subtotal + tax;

    const r = rand(i + 1500, 100);
    const status: "PAID" | "PARTIAL" | "PENDING" = r < 75 ? "PAID" : r < 90 ? "PARTIAL" : "PENDING";
    const amountPaid = status === "PAID" ? total : status === "PARTIAL" ? Math.round(total * 0.5 * 100) / 100 : 0;
    const balanceDue = Math.max(0, total - amountPaid);

    const invoice = await prisma.invoice.create({
      data: {
        invoiceNumber: `INV-${year}-${pad(invCounter++, 4)}`,
        patientId: apt.patientId,
        appointmentId: apt.id,
        branchId: branch.id,
        tenantId: opts.tenantId,
        subtotal: new Prisma.Decimal(subtotal),
        discount: new Prisma.Decimal(0),
        tax: new Prisma.Decimal(tax),
        total: new Prisma.Decimal(total),
        amountPaid: new Prisma.Decimal(amountPaid),
        balanceDue: new Prisma.Decimal(balanceDue),
        status,
        createdById: pick(receptionists, i).id,
        createdAt: apt.date,
        items: {
          create: lines.map((l) => ({
            description: l.description,
            quantity: l.qty,
            unitPrice: new Prisma.Decimal(l.unit),
            tax: new Prisma.Decimal(Math.round(l.qty * l.unit * l.taxRate * 100) / 100),
            total: new Prisma.Decimal(l.qty * l.unit + Math.round(l.qty * l.unit * l.taxRate * 100) / 100),
            productId: l.productId,
            packageId: l.packageId,
          })),
        },
      },
    });

    if (amountPaid > 0) {
      await prisma.payment.create({
        data: {
          invoiceId: invoice.id,
          amount: new Prisma.Decimal(amountPaid),
          method: pick(["CASH", "CARD", "BANK_TRANSFER"] as const, i),
          status: "COMPLETED",
          processedById: pick(receptionists, i).id,
          processedAt: apt.date,
        },
      });
    }

    if (status === "PAID") paidInvoices++;
    else openInvoices++;
  }

  // ---- Package sales (dedicated PAID invoices, no appointment link) ----
  // Six representative package purchases spread across patients. Each
  // gets its own invoice (status PAID), one InvoiceItem with packageId,
  // a Payment row, and a PatientPackage with remainingSessions JSON
  // matching the package's PackageTreatment definitions. Tax 0.08
  // (cosmetic) — packages are predominantly aesthetic bundles.
  let patientPackagesCount = 0;
  if (packageRecords.length > 0) {
    const SALES = Math.min(6, patients.length);
    for (let i = 0; i < SALES; i++) {
      const pat = patients[(i * 5 + 3) % patients.length];
      const pkg = pick(packageRecords, i);

      const purchaseDate = daysAgo(rand(i + 2200, 18) + 1);
      const expiry = new Date(purchaseDate);
      expiry.setDate(expiry.getDate() + 180);

      const subtotal = pkg.price;
      const taxAmount = Math.round(pkg.price * 0.08 * 100) / 100;
      const total = subtotal + taxAmount;

      const remaining = Object.fromEntries(pkg.treatments.map((t) => [t.name, t.sessions]));

      const invoice = await prisma.invoice.create({
        data: {
          invoiceNumber: `INV-${year}-${pad(invCounter++, 4)}`,
          patientId: pat.id,
          branchId: branch.id,
          tenantId: opts.tenantId,
          subtotal: new Prisma.Decimal(subtotal),
          discount: new Prisma.Decimal(0),
          tax: new Prisma.Decimal(taxAmount),
          total: new Prisma.Decimal(total),
          amountPaid: new Prisma.Decimal(total),
          balanceDue: new Prisma.Decimal(0),
          status: "PAID",
          createdById: pick(receptionists, i).id,
          createdAt: purchaseDate,
          items: {
            create: [{
              description: pkg.name,
              quantity: 1,
              unitPrice: new Prisma.Decimal(subtotal),
              tax: new Prisma.Decimal(taxAmount),
              total: new Prisma.Decimal(total),
              packageId: pkg.id,
            }],
          },
        },
      });

      await prisma.payment.create({
        data: {
          invoiceId: invoice.id,
          amount: new Prisma.Decimal(total),
          method: pick(["CASH", "CARD", "BANK_TRANSFER"] as const, i),
          status: "COMPLETED",
          processedById: pick(receptionists, i).id,
          processedAt: purchaseDate,
        },
      });

      await prisma.patientPackage.create({
        data: {
          patientId: pat.id,
          packageId: pkg.id,
          purchaseDate,
          expiryDate: expiry,
          remainingSessions: remaining,
          status: "ACTIVE",
          invoiceId: invoice.id,
        },
      });

      paidInvoices++;
      patientPackagesCount++;
    }
  }

  // ---- QR tokens (one per appointment + one per appointment-less invoice) ----
  // Pre-create receipt QRs so they're visible on the demo without
  // having to "print" first. The token row is just the opaque 16-byte
  // base64url id (matching lib/qr-tokens.ts:generateRawToken); the URL
  // printed in the QR is composed at render-time from
  // NEXT_PUBLIC_QR_BASE_URL with NEXT_PUBLIC_APP_URL fallback (see
  // components/billing/receipt-bits.tsx). Set the env on the demo box
  // to control the encoded host. Per qr-tokens.ts, appointment-scoped
  // tokens are reused across that appointment's invoices, so we only
  // create invoice-scoped tokens for invoices with no appointment link
  // (i.e. package sales).
  const aptForQr = await prisma.appointment.findMany({
    where: { branchId: branch.id },
    select: { id: true },
  });
  let qrAppointmentTokens = 0;
  if (aptForQr.length) {
    await prisma.qrToken.createMany({
      data: aptForQr.map((a) => ({
        token: randomBytes(16).toString("base64url"),
        appointmentId: a.id,
        createdById: adminUser.id,
      })),
    });
    qrAppointmentTokens = aptForQr.length;
  }

  const standaloneInvoices = await prisma.invoice.findMany({
    where: { branchId: branch.id, appointmentId: null },
    select: { id: true },
  });
  let qrInvoiceTokens = 0;
  if (standaloneInvoices.length) {
    await prisma.qrToken.createMany({
      data: standaloneInvoices.map((inv) => ({
        token: randomBytes(16).toString("base64url"),
        invoiceId: inv.id,
        createdById: adminUser.id,
      })),
    });
    qrInvoiceTokens = standaloneInvoices.length;
  }

  // ---- v59/v60 demo: Insurance + Claims ----
  // Pull this tenant's payers (seeded by v59) and denial reasons
  // (seeded by v60). The seeder runs after migrations so both should
  // be present; if for some reason they're not, we silently skip the
  // claim-demo step rather than crash.
  const tenantPayers = await prisma.payer.findMany({
    where: { tenantId: opts.tenantId, isActive: true },
    select: { id: true, name: true },
  });
  const tenantDenialReasons = await prisma.denialReason.findMany({
    where: { tenantId: opts.tenantId, isActive: true },
    select: { id: true, code: true, description: true },
  });

  let insurancesCount = 0;
  const claimCounts = { DRAFT: 0, SUBMITTED: 0, IN_REVIEW: 0, APPROVED: 0, PARTIAL: 0, DENIED: 0, PAID: 0, APPEALED: 0 };

  if (tenantPayers.length > 0) {
    // Give ~50% of patients an insurance policy. The patient-insurance
    // form's payer picker is the same code path; the seeder writes
    // both payerId and the denormalized provider name.
    const insuredPatientIds: string[] = [];
    for (let i = 0; i < patients.length; i++) {
      if (rand(i + 2000, 100) >= 50) continue;
      const payer = pick(tenantPayers, i);
      await prisma.insurance.create({
        data: {
          patientId: patients[i].id,
          provider: payer.name,
          payerId: payer.id,
          policyNumber: `${payer.id.slice(0, 4).toUpperCase()}-${pad(100000 + i * 91, 6)}`,
          coverageType: pick(["full", "partial", "medical", "cosmetic"] as const, i),
          copayAmount: new Prisma.Decimal((1 + rand(i + 2100, 5)) * 500),
          isActive: true,
        },
      });
      insurancesCount++;
      insuredPatientIds.push(patients[i].id);
    }

    // Now create a spread of claims across the lifecycle. We pick
    // PAID invoices for insured patients and stage each at a different
    // status so the demo shows the full DRAFT→PAID journey + a couple
    // of DENIED/APPEALED rows for the picker UI.
    const paidInvForInsured = await prisma.invoice.findMany({
      where: {
        branchId: branch.id,
        status: "PAID",
        patientId: { in: insuredPatientIds },
      },
      include: {
        patient: { select: { id: true, insurance: { where: { isActive: true }, take: 1, select: { id: true } } } },
        appointment: {
          select: {
            consultationNotes: {
              where: { isSigned: true },
              take: 1,
              orderBy: { signedAt: "desc" },
              select: { icd10Codes: true },
            },
          },
        },
      },
      take: 16,
    });

    // Lifecycle plan — spread states across the available invoices.
    type ClaimPlan =
      | { kind: "DRAFT" }
      | { kind: "SUBMITTED" }
      | { kind: "IN_REVIEW" }
      | { kind: "APPROVED" }
      | { kind: "PARTIAL" }
      | { kind: "DENIED"; codeId: string | null; reason: string }
      | { kind: "PAID" }
      | { kind: "APPEALED"; codeId: string | null; reason: string };

    const denialAuth = tenantDenialReasons.find((r) => r.code === "AUTH-MISSING") ?? tenantDenialReasons[0] ?? null;
    const denialDoc = tenantDenialReasons.find((r) => r.code === "DOC-MISSING") ?? tenantDenialReasons[0] ?? null;

    const plans: ClaimPlan[] = [
      { kind: "DRAFT" },
      { kind: "DRAFT" },
      { kind: "SUBMITTED" },
      { kind: "SUBMITTED" },
      { kind: "IN_REVIEW" },
      { kind: "APPROVED" },
      { kind: "APPROVED" },
      { kind: "PARTIAL" },
      { kind: "PARTIAL" },
      { kind: "DENIED", codeId: denialAuth?.id ?? null, reason: "Pre-authorization not on file at the date of service." },
      { kind: "DENIED", codeId: denialDoc?.id ?? null, reason: "Procedure note + lab report not attached to the original submission." },
      { kind: "APPEALED", codeId: denialAuth?.id ?? null, reason: "Appealed: pre-auth was obtained before service, copy now attached." },
      { kind: "PAID" },
      { kind: "PAID" },
      { kind: "PAID" },
      { kind: "PAID" },
    ];

    const year = new Date().getFullYear();
    let claimNum = 1;

    for (let i = 0; i < paidInvForInsured.length && i < plans.length; i++) {
      const inv = paidInvForInsured[i];
      const insuranceId = inv.patient.insurance[0]?.id;
      if (!insuranceId) continue;
      const plan = plans[i];
      const claimedAmount = Number(inv.total);
      const diagnosisCodes = inv.appointment?.consultationNotes[0]?.icd10Codes ?? [];

      const baseSubmittedAt = inv.createdAt;
      const submittedAt = ["DRAFT"].includes(plan.kind) ? null
        : new Date(baseSubmittedAt.getTime() + 24 * 60 * 60 * 1000);
      const decidedAt = ["DRAFT", "SUBMITTED", "IN_REVIEW"].includes(plan.kind) ? null
        : new Date(baseSubmittedAt.getTime() + 5 * 24 * 60 * 60 * 1000);
      const paidAt = plan.kind === "PAID"
        ? new Date(baseSubmittedAt.getTime() + 12 * 24 * 60 * 60 * 1000)
        : null;

      // Approved amount differs by status: APPROVED == claimed, PARTIAL ~70%,
      // DENIED == 0, APPEALED == claimed (assume the appeal got it back),
      // PAID == claimed (or partial-paid would be 70%; we do full).
      let approvedAmount: number | null = null;
      let paidAmount = 0;
      let denialReason: string | null = null;
      let denialReasonCodeId: string | null = null;
      let status: ClaimPlan["kind"] = plan.kind;

      if (plan.kind === "APPROVED" || plan.kind === "PAID" || plan.kind === "APPEALED") {
        approvedAmount = claimedAmount;
      } else if (plan.kind === "PARTIAL") {
        approvedAmount = Math.round(claimedAmount * 0.7 * 100) / 100;
      } else if (plan.kind === "DENIED") {
        approvedAmount = 0;
        denialReason = plan.reason;
        denialReasonCodeId = plan.codeId;
      }
      if (plan.kind === "PAID") {
        paidAmount = claimedAmount;
      }
      if (plan.kind === "APPEALED") {
        // Originally denied, then appealed — keep the historical denial
        // text on the row so the demo shows that part of the audit trail.
        denialReason = plan.reason;
        denialReasonCodeId = plan.codeId;
      }

      await prisma.insuranceClaim.create({
        data: {
          claimNumber: `CLM-${year}-${pad(claimNum++, 4)}`,
          invoiceId: inv.id,
          patientId: inv.patientId,
          insuranceId,
          branchId: branch.id,
          tenantId: opts.tenantId,
          diagnosisCodes,
          claimedAmount: new Prisma.Decimal(claimedAmount),
          approvedAmount: approvedAmount != null ? new Prisma.Decimal(approvedAmount) : null,
          paidAmount: new Prisma.Decimal(paidAmount),
          copayCollected: new Prisma.Decimal(0),
          status,
          submittedAt,
          decidedAt,
          paidAt,
          denialReason,
          denialReasonCodeId,
          createdById: adminUser.id,
          // v58 CHECKs (submittedAt >= createdAt, etc.) require we
          // pin createdAt to the invoice date — past-dated submittedAt
          // would otherwise violate the constraint.
          createdAt: inv.createdAt,
          updatedAt: paidAt ?? decidedAt ?? submittedAt ?? inv.createdAt,
        },
      });
      claimCounts[status] += 1;
    }
  }

  return {
    branchId: branch.id,
    users: { admin: 1, doctors: doctors.length, receptionists: receptionists.length },
    patients: patients.length,
    appointments: { past: pastAppointmentsCount, upcoming: upcomingAppointmentsCount },
    consultationNotes: consultationNotesCount,
    prescriptions: prescriptionsCount,
    labTests: labTestsCount,
    invoices: { paid: paidInvoices, pendingOrPartial: openInvoices },
    pharmacyLines: pharmacyLinesAdded,
    products: productRecords.length,
    packages: packageRecords.length,
    patientPackages: patientPackagesCount,
    qrTokens: { appointment: qrAppointmentTokens, invoice: qrInvoiceTokens },
    insurances: insurancesCount,
    claims: claimCounts,
  };
}
