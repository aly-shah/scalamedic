/**
 * MediCore ERP — Complete Database Seed
 * Populates ALL 39 tables with realistic skincare clinic data.
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import "dotenv/config";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("🌱 Complete seed — populating every table...\n");

  // ---- Load existing entities ----
  const branches = await prisma.branch.findMany();
  const users = await prisma.user.findMany();
  const patients = await prisma.patient.findMany({ orderBy: { patientCode: "asc" } });
  const treatments = await prisma.treatment.findMany();
  const appointments = await prisma.appointment.findMany({ orderBy: { appointmentCode: "asc" } });
  const packages = await prisma.package.findMany();

  const mainBranch = branches.find((b) => b.code === "MAIN")!;
  const doctors = users.filter((u) => u.role === "DOCTOR");
  const receptionist = users.find((u) => u.role === "RECEPTIONIST")!;
  const billingUser = users.find((u) => u.role === "BILLING")!;
  const assistant = users.find((u) => u.role === "ASSISTANT")!;
  const callCenterUser = users.find((u) => u.role === "CALL_CENTER")!;
  const adminUser = users.find((u) => u.role === "ADMIN")!;

  // Skip if already seeded (check for existing consultation notes)
  const existingNotes = await prisma.consultationNote.count();
  if (existingNotes > 0) {
    console.log("⚠️  Tables already have data. Skipping to avoid duplicates.");
    console.log("   Run `npx prisma migrate reset` first to start fresh.\n");
    await printSummary();
    return;
  }

  // ---- 1. Permissions (role-based matrix) ----
  console.log("  1/22 Permissions...");
  const modules = ["DASHBOARD", "PATIENTS", "APPOINTMENTS", "BILLING", "CALL_CENTER", "ROOMS", "TREATMENTS", "AI_TOOLS", "ADMIN", "REPORTS", "LAB", "FOLLOW_UPS"];
  const actions = ["VIEW", "CREATE", "EDIT", "DELETE"];
  const rolePerms: Record<string, string[]> = {
    ADMIN: modules,
    DOCTOR: ["DASHBOARD", "PATIENTS", "APPOINTMENTS", "AI_TOOLS", "LAB", "FOLLOW_UPS", "TREATMENTS"],
    RECEPTIONIST: ["DASHBOARD", "PATIENTS", "APPOINTMENTS", "BILLING", "ROOMS"],
    BILLING: ["DASHBOARD", "BILLING", "PATIENTS", "REPORTS"],
    CALL_CENTER: ["DASHBOARD", "CALL_CENTER", "APPOINTMENTS", "PATIENTS"],
    ASSISTANT: ["DASHBOARD", "PATIENTS", "APPOINTMENTS", "ROOMS"],
  };
  for (const user of users) {
    const allowedModules = rolePerms[user.role] || [];
    for (const mod of allowedModules) {
      for (const action of actions) {
        // non-admins can't delete
        const granted = user.role === "ADMIN" || user.role === "SUPER_ADMIN" || action !== "DELETE";
        await prisma.permission.create({
          data: { userId: user.id, module: mod, action, granted },
        });
      }
    }
  }

  // ---- 2. Medical Histories ----
  console.log("  2/22 Medical histories...");
  const medHistories = [
    { idx: 0, condition: "Polycystic Ovary Syndrome (PCOS)", date: "2020-03-01", status: "CHRONIC" as const, notes: "Contributing to hormonal acne. On birth control." },
    { idx: 0, condition: "Seasonal Allergies", date: "2018-01-01", status: "CHRONIC" as const, notes: "Hay fever, may affect skin sensitivity in spring." },
    { idx: 3, condition: "Hypertension (mild)", date: "2022-06-01", status: "ACTIVE" as const, notes: "Controlled with medication. Consider for procedures." },
    { idx: 4, condition: "Asthma", date: "2015-09-01", status: "CHRONIC" as const, notes: "Well controlled. Uses inhaler as needed." },
    { idx: 8, condition: "Iron Deficiency Anemia", date: "2024-11-01", status: "ACTIVE" as const, notes: "Supplementing. May cause skin pallor and hair thinning." },
    { idx: 9, condition: "Hypothyroidism", date: "2021-05-01", status: "ACTIVE" as const, notes: "On levothyroxine. Can cause dry skin, hair loss." },
    { idx: 12, condition: "Type 2 Diabetes", date: "2023-01-01", status: "ACTIVE" as const, notes: "HbA1c controlled. Impacts wound healing — plan procedures carefully." },
    { idx: 14, condition: "Anxiety Disorder", date: "2022-08-01", status: "ACTIVE" as const, notes: "On SSRIs. No known skin interactions." },
  ];
  for (const mh of medHistories) {
    await prisma.medicalHistory.create({
      data: { patientId: patients[mh.idx].id, condition: mh.condition, diagnosedDate: new Date(mh.date), status: mh.status, notes: mh.notes },
    });
  }

  // ---- 3. Skin Histories ----
  console.log("  3/22 Skin histories...");
  const skinHistories = [
    { idx: 0, condition: "Acne Vulgaris", area: "Face — Chin, Forehead", severity: "MODERATE" as const, onset: "2024-06-01", treatment: "Benzoyl peroxide → Clindamycin gel → Tretinoin (current)", notes: "Hormonal pattern. Worsens premenstrually." },
    { idx: 1, condition: "Post-Inflammatory Scarring", area: "Face — Bilateral Cheeks, Temples", severity: "MODERATE" as const, onset: "2023-01-01", treatment: "Microneedling x2 → CO2 Laser x3 (ongoing)", notes: "Box car + ice pick scars from teenage acne." },
    { idx: 4, condition: "Melasma / Hyperpigmentation", area: "Face — Forehead, Upper Lip, Cheeks", severity: "MILD" as const, onset: "2025-08-01", treatment: "None yet — new patient", notes: "Onset after summer sun exposure." },
    { idx: 5, condition: "Photoaging / Sun Damage", area: "Face, Neck, Hands", severity: "MODERATE" as const, onset: "2020-01-01", treatment: "Topical retinoid, IPL x1", notes: "Outdoor lifestyle. Minimal sunscreen use historically." },
    { idx: 8, condition: "Rosacea — Papulopustular", area: "Face — Bilateral Cheeks, Nose", severity: "MODERATE" as const, onset: "2025-01-01", treatment: "Metronidazole gel (current)", notes: "Flares with stress, alcohol, spicy food." },
    { idx: 9, condition: "Periorbital Hyperpigmentation", area: "Under-eye area", severity: "MILD" as const, onset: "2024-03-01", treatment: "Vitamin C serum, under-eye cream", notes: "Genetic component. Thyroid may contribute." },
    { idx: 12, condition: "Acne Scarring + Active Acne", area: "Face — Full, Back", severity: "SEVERE" as const, onset: "2022-06-01", treatment: "Isotretinoin course completed. Scarring remains.", notes: "Diabetes complicates procedure options." },
    { idx: 14, condition: "Cystic Acne", area: "Face — Jawline, Chin", severity: "MODERATE" as const, onset: "2025-06-01", treatment: "Adapalene + Clindamycin (current)", notes: "Stress-triggered. Nocturnal skin picking noted." },
    { idx: 15, condition: "Eczema / Atopic Dermatitis", area: "Arms, Inner Elbows, Neck", severity: "MILD" as const, onset: "2019-01-01", treatment: "Topical corticosteroids PRN, emollients", notes: "Seasonal flares in winter." },
    { idx: 19, condition: "Fine Lines & Wrinkles", area: "Forehead, Crow's Feet, Nasolabial", severity: "MILD" as const, onset: "2024-01-01", treatment: "Retinol serum, considering Botox", notes: "VIP patient — interested in comprehensive anti-aging plan." },
  ];
  for (const sh of skinHistories) {
    await prisma.skinHistory.create({
      data: { patientId: patients[sh.idx].id, condition: sh.condition, affectedArea: sh.area, severity: sh.severity, onsetDate: new Date(sh.onset), treatmentHistory: sh.treatment, notes: sh.notes, images: [] },
    });
  }

  // ---- 4. Patient Medications ----
  console.log("  4/22 Patient medications...");
  const meds = [
    { idx: 0, name: "Tretinoin Cream 0.025%", dosage: "Pea-sized", frequency: "Every other night", prescriber: doctors[0].name },
    { idx: 0, name: "Clindamycin Phosphate Gel 1%", dosage: "Thin layer", frequency: "Twice daily", prescriber: doctors[0].name },
    { idx: 3, name: "Lisinopril 10mg", dosage: "1 tablet", frequency: "Once daily", prescriber: "External — Dr. Rivera (Cardiology)" },
    { idx: 8, name: "Metronidazole Gel 0.75%", dosage: "Thin layer", frequency: "Twice daily", prescriber: doctors[1].name },
    { idx: 9, name: "Levothyroxine 50mcg", dosage: "1 tablet", frequency: "Once daily (AM)", prescriber: "External — Dr. Park (Endocrinology)" },
    { idx: 14, name: "Adapalene Gel 0.3%", dosage: "Thin layer", frequency: "Once nightly", prescriber: doctors[0].name },
    { idx: 14, name: "Sertraline 50mg", dosage: "1 tablet", frequency: "Once daily", prescriber: "External — Dr. Hayes (Psychiatry)" },
    { idx: 19, name: "Retinol Serum 0.5%", dosage: "3 drops", frequency: "Every other night", prescriber: doctors[1].name },
  ];
  for (const m of meds) {
    await prisma.patientMedication.create({
      data: { patientId: patients[m.idx].id, name: m.name, dosage: m.dosage, frequency: m.frequency, prescriber: m.prescriber, startDate: new Date("2026-01-15"), isActive: true },
    });
  }

  // ---- 5. Insurance ----
  console.log("  5/22 Insurance records...");
  const insurances = [
    { idx: 0, provider: "Blue Cross Blue Shield", policy: "BCBS-224789", coverage: "Dermatology", copay: 30 },
    { idx: 3, provider: "Aetna", policy: "AET-887456", coverage: "Full Medical", copay: 25 },
    { idx: 6, provider: "United Healthcare", policy: "UHC-556123", coverage: "Specialist", copay: 40 },
    { idx: 9, provider: "Cigna", policy: "CGN-334521", coverage: "Dermatology", copay: 35 },
    { idx: 12, provider: "Humana", policy: "HUM-998712", coverage: "Full Medical", copay: 20 },
    { idx: 19, provider: "Blue Cross Blue Shield", policy: "BCBS-112398", coverage: "Premium", copay: 15 },
  ];
  for (const ins of insurances) {
    await prisma.insurance.create({
      data: { patientId: patients[ins.idx].id, provider: ins.provider, policyNumber: ins.policy, coverageType: ins.coverage, copayAmount: ins.copay, expiryDate: new Date("2027-12-31"), isActive: true },
    });
  }

  // ---- 6. Triage Records ----
  console.log("  6/22 Triage records...");
  for (let i = 0; i < Math.min(appointments.length, 6); i++) {
    const apt = appointments[i];
    await prisma.triage.create({
      data: {
        patientId: apt.patientId, appointmentId: apt.id,
        temperature: 36.4 + Math.random() * 0.8, temperatureUnit: "C",
        systolicBP: 110 + Math.floor(Math.random() * 20),
        diastolicBP: 70 + Math.floor(Math.random() * 15),
        heartRate: 65 + Math.floor(Math.random() * 20),
        respiratoryRate: 14 + Math.floor(Math.random() * 4),
        weight: 55 + Math.random() * 30, height: 155 + Math.random() * 30,
        bmi: 20 + Math.random() * 8,
        oxygenSaturation: 97 + Math.random() * 3,
        painLevel: Math.floor(Math.random() * 3),
        notes: "Patient appears well. Vitals within normal range.",
        skinObservations: ["Clear skin, no acute changes", "Mild redness bilateral cheeks", "Active lesions on chin, improving", "Post-procedure healing well", "Slight dryness on forehead", "Sun damage visible on temples"][i],
        moistureLevel: 2 + Math.floor(Math.random() * 3),
        oilinessLevel: 1 + Math.floor(Math.random() * 4),
        urgencyLevel: "NORMAL",
        recordedById: assistant.id,
      },
    });
  }

  // ---- 7. Consultation Notes ----
  console.log("  7/22 Consultation notes...");
  const notes = [
    { aptIdx: 0, complaint: "Follow-up on acne treatment — 2 week check", symptoms: "Mild dryness around chin, slight peeling on forehead. Acne lesions reducing.", exam: "Active lesion count reduced from 12 to 5. No new cystic acne. Mild retinoid dermatitis.", skin: "Skin improving. Comedonal acne resolving. Inflammatory lesions decreasing.", areas: ["Face", "Chin", "Forehead"], severity: "MODERATE" as const, diagnosis: "Acne Vulgaris — Improving on current regimen", plan: "Continue tretinoin every other night. Add moisturizer before tretinoin.", advice: "SPF 50 daily. Avoid picking. Keep hydrated." },
    { aptIdx: 1, complaint: "Laser resurfacing session 3/6 for acne scarring", symptoms: "Patient reports improvement after sessions 1-2. Scarring less prominent.", exam: "Box car scars on cheeks showing 30% improvement. Ice pick scars stable. Good healing from session 2.", skin: "Post-laser recovery complete. Ready for session 3. No hyperpigmentation.", areas: ["Face", "Cheeks", "Temples"], severity: "MODERATE" as const, diagnosis: "Post-inflammatory scarring — Progressive improvement", plan: "Proceed with Fractional CO2 session 3. Energy 25mJ, density 15%.", advice: "Strict sun avoidance 2 weeks. Healing cream 3x daily. No exfoliants 10 days." },
    { aptIdx: 2, complaint: "New consultation — hyperpigmentation on face", symptoms: "Dark patches on forehead and upper lip. Worsened over summer.", exam: "Bilateral melasma on malar prominences. Patchy hyperpigmentation on forehead. Wood's lamp: epidermal pattern.", skin: "Fitzpatrick Type V. Melasma with epidermal component. No dermal involvement.", areas: ["Face", "Forehead", "Upper Lip", "Cheeks"], severity: "MILD" as const, diagnosis: "Melasma — Epidermal type, likely UV-triggered", plan: "Start azelaic acid 20% + SPF 50. Consider chemical peel series after 4 weeks.", advice: "Strict daily sunscreen. Reapply every 2 hours outdoors. Wide-brim hat." },
    { aptIdx: 3, complaint: "Rosacea assessment — first visit", symptoms: "Redness and small bumps on cheeks, worsening over 3 months. Triggered by wine and spicy food.", exam: "Papulopustular rosacea on bilateral cheeks. Erythema extending to nose. No rhinophyma.", skin: "Sensitive skin with telangiectasia. Fitzpatrick Type II. Rosacea subtype 2.", areas: ["Face", "Cheeks", "Nose"], severity: "MODERATE" as const, diagnosis: "Rosacea — Papulopustular (Subtype 2)", plan: "Start metronidazole gel 0.75% BID. Gentle cleanser. Consider IPL after 8 weeks.", advice: "Avoid triggers: alcohol, spicy food, extreme temperatures. Mineral sunscreen only." },
  ];
  for (const n of notes) {
    const apt = appointments[n.aptIdx];
    await prisma.consultationNote.create({
      data: {
        appointmentId: apt.id, patientId: apt.patientId, doctorId: apt.doctorId,
        chiefComplaint: n.complaint, symptoms: n.symptoms, examination: n.exam,
        skinAssessment: n.skin, affectedAreas: n.areas, conditionSeverity: n.severity,
        diagnosis: n.diagnosis, treatmentPlan: n.plan, advice: n.advice,
        followUpDate: new Date("2026-04-19"), followUpNotes: "Review in 2 weeks",
        isSigned: true, signedAt: new Date(),
      },
    });
  }

  // ---- 8. Prescriptions + Items ----
  console.log("  8/22 Prescriptions...");
  const rxData = [
    { aptIdx: 0, items: [
      { name: "Tretinoin Cream 0.025%", dosage: "Pea-sized amount", freq: "Every other night", dur: "3 months", route: "Topical", instr: "Apply to clean dry face. Avoid eye area." },
      { name: "Clindamycin Phosphate Gel 1%", dosage: "Thin layer", freq: "Twice daily (BD)", dur: "3 months", route: "Topical", instr: "Apply to affected areas morning and evening." },
      { name: "Cetaphil Moisturizer", dosage: "As needed", freq: "Twice daily (BD)", dur: "Ongoing", route: "Topical", instr: "Apply before tretinoin at night." },
    ]},
    { aptIdx: 3, items: [
      { name: "Metronidazole Gel 0.75%", dosage: "Thin layer", freq: "Twice daily (BD)", dur: "2 months", route: "Topical", instr: "Apply to affected rosacea areas." },
      { name: "Mineral Sunscreen SPF 50+", dosage: "Generous amount", freq: "Every 2 hours outdoors", dur: "Ongoing", route: "Topical", instr: "Zinc oxide or titanium dioxide only." },
    ]},
    { aptIdx: 2, items: [
      { name: "Azelaic Acid Gel 20%", dosage: "Thin layer", freq: "Twice daily (BD)", dur: "3 months", route: "Topical", instr: "Apply to pigmented areas after cleansing." },
      { name: "EltaMD UV Clear SPF 46", dosage: "1/4 teaspoon", freq: "Every morning", dur: "Ongoing", route: "Topical", instr: "Apply as last step before makeup." },
    ]},
  ];
  for (const rx of rxData) {
    const apt = appointments[rx.aptIdx];
    await prisma.prescription.create({
      data: {
        patientId: apt.patientId, doctorId: apt.doctorId, appointmentId: apt.id,
        notes: "As discussed during consultation. Review at follow-up.",
        items: { create: rx.items.map((i) => ({ medicineName: i.name, dosage: i.dosage, frequency: i.freq, duration: i.dur, route: i.route, instructions: i.instr })) },
      },
    });
  }

  // ---- 9. Procedures ----
  console.log("  9/22 Procedures...");
  const procedureApt = appointments.find((a) => a.type === "PROCEDURE")!;
  const laserTreatment = treatments.find((t) => t.name.includes("CO2"))!;
  await prisma.procedure.create({
    data: {
      appointmentId: procedureApt.id, patientId: procedureApt.patientId, doctorId: procedureApt.doctorId,
      treatmentId: laserTreatment.id, areasTreated: ["Left Cheek", "Right Cheek", "Temples"],
      settings: { energy: "25mJ", density: "15%", passes: 2, spotSize: "120μm" },
      notes: "Session 3 of 6. Good response. Patient tolerated well.",
      outcome: "Treated bilateral cheeks and temples. Immediate erythema and mild edema — expected.",
      consentSigned: true, beforeImages: [], afterImages: [],
    },
  });

  // ---- 10. Lab Tests ----
  console.log("  10/22 Lab tests...");
  const labTests = [
    { pIdx: 0, dIdx: 0, test: "Patch Test — Allergen Panel", code: "LAB-PT", status: "COMPLETED" as const, results: { allergens: ["Salicylic Acid", "Latex"], interpretation: "Positive for salicylic acid and latex" }, tech: "Lab Tech Adams", collected: "2026-04-02", completed: "2026-04-04" },
    { pIdx: 1, dIdx: 1, test: "Blood Work — CBC + Hormones", code: "LAB-CBC", status: "PROCESSING" as const, tech: "Lab Tech Baker", collected: "2026-04-04" },
    { pIdx: 4, dIdx: 1, test: "Skin Biopsy — Pigmented Lesion", code: "LAB-BX", status: "REQUESTED" as const, notes: "Suspicious mole on left shoulder" },
    { pIdx: 8, dIdx: 1, test: "Allergy Panel — Skincare Products", code: "LAB-AP", status: "SAMPLE_COLLECTED" as const, tech: "Lab Tech Adams", collected: "2026-04-05" },
    { pIdx: 14, dIdx: 0, test: "Hormone Panel — Acne Related", code: "LAB-HP", status: "COMPLETED" as const, results: { testosterone: "Normal", dhea_s: "Slightly elevated", cortisol: "Normal", interpretation: "DHEA-S mildly elevated — consider hormonal contribution to acne" }, tech: "Lab Tech Baker", collected: "2026-04-01", completed: "2026-04-03" },
    { pIdx: 12, dIdx: 1, test: "HbA1c — Pre-procedure Check", code: "LAB-A1C", status: "COMPLETED" as const, results: { hba1c: "6.8%", interpretation: "Adequate control for elective procedures" }, tech: "Lab Tech Adams", collected: "2026-03-28", completed: "2026-03-30" },
  ];
  for (const lt of labTests) {
    await prisma.labTest.create({
      data: {
        patientId: patients[lt.pIdx].id, doctorId: doctors[lt.dIdx].id,
        testName: lt.test, testCode: lt.code, status: lt.status, priority: "NORMAL",
        results: lt.results || undefined, technician: lt.tech || null,
        collectedAt: lt.collected ? new Date(lt.collected) : null,
        completedAt: lt.completed ? new Date(lt.completed) : null,
        notes: lt.notes || null,
      },
    });
  }

  // ---- 11. Invoices + Payments ----
  console.log("  11/22 Invoices & payments...");
  const invoices = [
    { num: "INV-2026-0001", pIdx: 0, items: [{ description: "Follow-up Consultation", type: "CONSULTATION", quantity: 1, unitPrice: 100, total: 100 }, { description: "Sunscreen SPF 50", type: "PRODUCT", quantity: 1, unitPrice: 32, total: 32 }], sub: 132, disc: 0, tax: 9.24, total: 141.24, status: "PAID" as const, due: "2026-03-28", payMethod: "CARD" as const },
    { num: "INV-2026-0002", pIdx: 1, items: [{ description: "Fractional CO2 Laser — Session 3", type: "PROCEDURE", quantity: 1, unitPrice: 450, total: 450 }], sub: 450, disc: 0, tax: 31.50, total: 481.50, status: "PENDING" as const, due: "2026-04-19" },
    { num: "INV-2026-0003", pIdx: 2, items: [{ description: "New Patient Consultation", type: "CONSULTATION", quantity: 1, unitPrice: 150, total: 150 }, { description: "Azelaic Acid Gel 20%", type: "PRODUCT", quantity: 1, unitPrice: 40, total: 40 }], sub: 190, disc: 10, tax: 12.60, total: 192.60, status: "PAID" as const, due: "2026-04-12", payMethod: "CASH" as const },
    { num: "INV-2026-0004", pIdx: 3, items: [{ description: "Botox — Forehead + Crow's Feet", type: "PROCEDURE", quantity: 1, unitPrice: 350, total: 350 }, { description: "Dermal Filler — Nasolabial", type: "PROCEDURE", quantity: 1, unitPrice: 500, total: 500 }], sub: 850, disc: 50, tax: 56, total: 856, status: "OVERDUE" as const, due: "2026-03-25" },
    { num: "INV-2026-0005", pIdx: 4, items: [{ description: "Consultation — Hyperpigmentation", type: "CONSULTATION", quantity: 1, unitPrice: 150, total: 150 }], sub: 150, disc: 0, tax: 10.50, total: 160.50, status: "PENDING" as const, due: "2026-04-19" },
    { num: "INV-2026-0006", pIdx: 5, items: [{ description: "IPL Photofacial", type: "PROCEDURE", quantity: 1, unitPrice: 300, total: 300 }], sub: 300, disc: 0, tax: 21, total: 321, status: "PAID" as const, due: "2026-03-30", payMethod: "INSURANCE" as const },
    { num: "INV-2026-0007", pIdx: 8, items: [{ description: "Rosacea Consultation", type: "CONSULTATION", quantity: 1, unitPrice: 150, total: 150 }, { description: "Metronidazole Gel", type: "PRODUCT", quantity: 1, unitPrice: 28, total: 28 }], sub: 178, disc: 0, tax: 12.46, total: 190.46, status: "PAID" as const, due: "2026-04-05", payMethod: "CARD" as const },
    { num: "INV-2026-0008", pIdx: 14, items: [{ description: "Microneedling + PRP", type: "PROCEDURE", quantity: 1, unitPrice: 400, total: 400 }], sub: 400, disc: 0, tax: 28, total: 428, status: "PARTIAL" as const, due: "2026-04-12", paid: 200, payMethod: "DIGITAL_WALLET" as const },
  ];
  for (const inv of invoices) {
    const paid = inv.status === "PAID" ? inv.total : (inv.paid || 0);
    const balance = inv.total - paid;
    const invoice = await prisma.invoice.create({
      data: {
        invoiceNumber: inv.num, patientId: patients[inv.pIdx].id, branchId: mainBranch.id,
        tenantId: mainBranch.tenantId,
        subtotal: inv.sub, discount: inv.disc, discountType: "FIXED",
        tax: inv.tax, total: inv.total, amountPaid: paid, balanceDue: balance,
        status: inv.status, dueDate: new Date(inv.due), createdById: billingUser.id,
        items: {
          create: inv.items.map((it) => ({
            description: it.description,
            quantity: it.quantity,
            unitPrice: it.unitPrice,
            total: it.total,
          })),
        },
      },
    });
    if (paid > 0 && inv.payMethod) {
      await prisma.payment.create({
        data: {
          invoiceId: invoice.id, amount: paid, method: inv.payMethod,
          status: "COMPLETED", reference: `REF-${inv.num}`,
          processedById: billingUser.id, processedAt: new Date(),
        },
      });
    }
  }

  // ---- 12. Patient Packages ----
  console.log("  12/22 Patient packages...");
  await prisma.patientPackage.create({
    data: { patientId: patients[9].id, packageId: packages[0].id, purchaseDate: new Date("2025-12-01"), expiryDate: new Date("2026-05-30"), remainingSessions: { HydraFacial: 2, "Glycolic Acid Peel": 1 }, status: "ACTIVE", invoiceId: "INV-PKG-001" },
  });
  await prisma.patientPackage.create({
    data: { patientId: patients[0].id, packageId: packages[1].id, purchaseDate: new Date("2026-01-15"), expiryDate: new Date("2026-05-15"), remainingSessions: { "LED Light Therapy": 4, "Glycolic Acid Peel": 2 }, status: "ACTIVE", invoiceId: "INV-PKG-002" },
  });
  await prisma.patientPackage.create({
    data: { patientId: patients[19].id, packageId: packages[2].id, purchaseDate: new Date("2025-11-01"), expiryDate: new Date("2026-10-31"), remainingSessions: { Botox: 1, "Dermal Fillers": 1, "Fractional CO2 Laser": 2 }, status: "ACTIVE", invoiceId: "INV-PKG-003" },
  });

  // ---- 13. Patient Documents ----
  console.log("  13/22 Patient documents...");
  const docs = [
    { pIdx: 0, name: "Patch Test Report.pdf", type: "LAB_RESULT" as const, size: 245000 },
    { pIdx: 0, name: "Treatment Consent — Laser.pdf", type: "CONSENT" as const, size: 180000 },
    { pIdx: 1, name: "Before — Acne Scarring (Baseline).jpg", type: "BEFORE_AFTER" as const, size: 1200000 },
    { pIdx: 1, name: "After Session 2 — Scarring.jpg", type: "BEFORE_AFTER" as const, size: 1150000 },
    { pIdx: 8, name: "GP Referral Letter.pdf", type: "REPORT" as const, size: 95000 },
    { pIdx: 12, name: "HbA1c Lab Report.pdf", type: "LAB_RESULT" as const, size: 120000 },
    { pIdx: 14, name: "Before — Acne (Jawline).jpg", type: "BEFORE_AFTER" as const, size: 980000 },
    { pIdx: 19, name: "Insurance Pre-Auth Letter.pdf", type: "REPORT" as const, size: 72000 },
  ];
  for (const d of docs) {
    await prisma.patientDocument.create({
      data: { patientId: patients[d.pIdx].id, name: d.name, type: d.type, fileUrl: `/uploads/${d.name.toLowerCase().replace(/\s/g, "-")}`, fileSize: d.size, mimeType: d.name.endsWith(".pdf") ? "application/pdf" : "image/jpeg", uploadedById: doctors[0].id },
    });
  }

  // ---- 14. Follow-Ups ----
  console.log("  14/22 Follow-ups...");
  const followUps = [
    { pIdx: 0, dIdx: 0, date: "2026-04-19", reason: "Acne treatment progress — 4 week review", status: "PENDING" as const },
    { pIdx: 1, dIdx: 1, date: "2026-04-19", reason: "Post-laser healing check — session 3", status: "PENDING" as const },
    { pIdx: 4, dIdx: 1, date: "2026-05-05", reason: "Melasma — assess response to azelaic acid", status: "PENDING" as const },
    { pIdx: 5, dIdx: 0, date: "2026-04-06", reason: "IPL results check + next session planning", status: "PENDING" as const },
    { pIdx: 8, dIdx: 1, date: "2026-04-12", reason: "Rosacea medication review — 1 week", status: "PENDING" as const },
    { pIdx: 9, dIdx: 0, date: "2026-04-15", reason: "Package progress — HydraFacial results", status: "PENDING" as const },
    { pIdx: 7, dIdx: 2, date: "2026-04-03", reason: "PRP therapy outcome check", status: "MISSED" as const },
    { pIdx: 2, dIdx: 0, date: "2026-03-25", reason: "Post-peel recovery check", status: "COMPLETED" as const },
  ];
  for (const fu of followUps) {
    await prisma.followUp.create({
      data: {
        patientId: patients[fu.pIdx].id, doctorId: doctors[fu.dIdx].id,
        dueDate: new Date(fu.date), reason: fu.reason, status: fu.status,
        completedAt: fu.status === "COMPLETED" ? new Date(fu.date) : null,
      },
    });
  }

  // ---- 15. Communication Logs ----
  console.log("  15/22 Communication logs...");
  const comms = [
    { pIdx: 0, ch: "CALL" as const, dir: "OUTBOUND" as const, subj: "Appointment Reminder", content: "Called to remind about follow-up on April 5. Patient confirmed.", by: receptionist.id },
    { pIdx: 0, ch: "SMS" as const, dir: "OUTBOUND" as const, subj: "Appointment Confirmation", content: "Your appointment with Dr. Emily Chen on Apr 5 at 9:00 AM is confirmed. Reply CANCEL to cancel.", by: receptionist.id },
    { pIdx: 3, ch: "EMAIL" as const, dir: "OUTBOUND" as const, subj: "Invoice Reminder — INV-2026-0004", content: "Gentle reminder: Your invoice of $856 is overdue. Please contact us for payment arrangements.", by: billingUser.id },
    { pIdx: 9, ch: "WHATSAPP" as const, dir: "OUTBOUND" as const, subj: "Package Update", content: "Hi Charlotte! You have 2 HydraFacial sessions remaining. Ready to book?", by: receptionist.id },
    { pIdx: 1, ch: "SMS" as const, dir: "OUTBOUND" as const, subj: "Post-Procedure Instructions", content: "Hi Ethan, remember to apply healing cream 3x daily and avoid sun for 2 weeks after your laser session.", by: doctors[1].id },
    { pIdx: 8, ch: "CALL" as const, dir: "INBOUND" as const, subj: "Prescription Query", content: "Patient called asking about metronidazole gel side effects. Advised mild stinging is normal.", by: receptionist.id },
  ];
  for (const c of comms) {
    await prisma.communicationLog.create({
      data: { patientId: patients[c.pIdx].id, type: c.ch, direction: c.dir, subject: c.subj, content: c.content, sentById: c.by },
    });
  }

  // ---- 16. Call Logs ----
  console.log("  16/22 Call logs...");
  const leads = await prisma.lead.findMany();
  const callData = [
    { leadIdx: 0, type: "INBOUND" as const, dur: 180, notes: "Interested in acne treatment, asked about pricing", outcome: "CALLBACK" as const },
    { leadIdx: 1, type: "OUTBOUND" as const, dur: 300, notes: "Called back about Botox. Explained procedure + pricing.", outcome: "CALLBACK" as const },
    { leadIdx: 2, type: "OUTBOUND" as const, dur: 420, notes: "Discussed laser options. Very interested. Booked consultation.", outcome: "BOOKED" as const },
    { leadIdx: 4, type: "INBOUND" as const, dur: 60, notes: "Asked about chemical peel cost. Said too expensive.", outcome: "NOT_INTERESTED" as const },
    { pIdx: 0, type: "INBOUND" as const, dur: 120, notes: "Olivia Harper confirmed follow-up appointment.", outcome: "INFO_PROVIDED" as const },
    { pIdx: 3, type: "OUTBOUND" as const, dur: 90, notes: "Called about overdue invoice. Said will pay by end of week.", outcome: "CALLBACK" as const },
  ];
  for (const cl of callData) {
    await prisma.callLog.create({
      data: {
        leadId: cl.leadIdx !== undefined ? leads[cl.leadIdx].id : null,
        patientId: cl.pIdx !== undefined ? patients[cl.pIdx].id : null,
        userId: callCenterUser.id, type: cl.type, duration: cl.dur,
        notes: cl.notes, outcome: cl.outcome,
      },
    });
  }

  // ---- 17. Room Allocations ----
  console.log("  17/22 Room allocations...");
  const rooms = await prisma.room.findMany({ where: { type: { not: "WAITING" } }, take: 3 });
  for (let i = 0; i < Math.min(3, rooms.length, appointments.length); i++) {
    await prisma.roomAllocation.create({
      data: {
        patientId: appointments[i].patientId, roomId: rooms[i].id,
        doctorId: appointments[i].doctorId, admissionDate: new Date(),
        status: "ACTIVE",
      },
    });
  }

  // ---- 18. AI Transcriptions ----
  console.log("  18/22 AI transcriptions...");
  const apt0 = appointments[0];
  await prisma.aITranscription.create({
    data: {
      appointmentId: apt0.id, patientId: apt0.patientId, doctorId: apt0.doctorId,
      rawTranscript: `Doctor: How has your skin been since we started the tretinoin?\nPatient: Much better, the breakouts have reduced a lot. But I do get some dryness and peeling on my forehead.\nDoctor: That's normal with retinoids. Let me take a look... Yes, I can see the retinoid dermatitis on your forehead. The good news is your active acne has reduced significantly — from 12 lesions to about 5.\nPatient: Should I keep using it every night?\nDoctor: Let's reduce to every other night and add a moisturizer before applying. This should help with the irritation.\nPatient: Okay, and what about the dark spots from old breakouts?\nDoctor: Those are post-inflammatory hyperpigmentation. They'll fade with the tretinoin and sunscreen. Be patient — it takes a few months.`,
      structuredNote: {
        chiefComplaint: "Follow-up: acne treatment 2-week check",
        subjective: "Patient reports improvement. Breakouts reduced. Experiencing dryness and peeling on forehead.",
        objective: "Active lesions decreased 12 → 5. Mild retinoid dermatitis on forehead. PIH on chin. No new cystic acne.",
        assessment: "Acne vulgaris — improving. Retinoid dermatitis — mild.",
        plan: "Reduce tretinoin to every other night. Add moisturizer before application. Continue clindamycin BID. Follow-up 2 weeks.",
      },
      summary: "Patient showing good improvement on tretinoin with acne reducing from 12 to 5 lesions. Mild retinoid dermatitis managed by reducing frequency. PIH expected to fade with continued treatment.",
      status: "COMPLETED", duration: 480, language: "en",
    },
  });

  // ---- 19. Audit Logs ----
  console.log("  19/22 Audit logs...");
  const auditEntries = [
    { userId: receptionist.id, action: "CREATE", module: "PATIENT", entityType: "Patient", entityId: patients[19].patientCode, details: "Registered new patient: Grace Robinson" },
    { userId: doctors[0].id, action: "CREATE", module: "CONSULTATION", entityType: "ConsultationNote", entityId: "CN-001", details: "Consultation note for Olivia Harper — Acne follow-up" },
    { userId: billingUser.id, action: "CREATE", module: "BILLING", entityType: "Invoice", entityId: "INV-2026-0001", details: "Created invoice $141.24 for Olivia Harper" },
    { userId: billingUser.id, action: "UPDATE", module: "BILLING", entityType: "Payment", entityId: "PAY-001", details: "Recorded card payment $141.24 for INV-2026-0001" },
    { userId: adminUser.id, action: "LOGIN", module: "AUTH", entityType: "Session", entityId: "SESS-001", details: "Admin login from office" },
    { userId: callCenterUser.id, action: "CREATE", module: "CALL_CENTER", entityType: "Lead", entityId: "LD-001", details: "New lead: Rebecca Stone — interested in acne treatment" },
    { userId: receptionist.id, action: "UPDATE", module: "APPOINTMENT", entityType: "Appointment", entityId: "APT-0004", details: "Checked in Emma Wilson at 09:52" },
    { userId: doctors[1].id, action: "CREATE", module: "PROCEDURE", entityType: "Procedure", entityId: "PRC-001", details: "Performed CO2 Laser session 3 for Ethan Brooks" },
    { userId: assistant.id, action: "CREATE", module: "TRIAGE", entityType: "Triage", entityId: "TRI-001", details: "Recorded vitals for Ava Williams" },
    { userId: adminUser.id, action: "UPDATE", module: "ADMIN", entityType: "SystemSetting", entityId: "tax_rate", details: "Updated tax rate from 5% to 7%" },
  ];
  for (const a of auditEntries) {
    await prisma.auditLog.create({
      data: { ...a, ipAddress: "192.168.1." + (100 + Math.floor(Math.random() * 20)), userAgent: "Mozilla/5.0 MediCore-ERP/1.0" },
    });
  }

  // ---- 20. Doctor Leaves ----
  console.log("  20/22 Doctor leaves...");
  await prisma.doctorLeave.create({
    data: { doctorId: doctors[0].id, type: "VACATION", startDate: new Date("2026-04-20"), endDate: new Date("2026-04-25"), reason: "Annual leave", status: "APPROVED", approvedById: adminUser.id },
  });
  await prisma.doctorLeave.create({
    data: { doctorId: doctors[2].id, type: "CONFERENCE", startDate: new Date("2026-04-15"), endDate: new Date("2026-04-16"), reason: "Dermatology Summit 2026", status: "APPROVED", approvedById: adminUser.id },
  });
  await prisma.doctorLeave.create({
    data: { doctorId: doctors[1].id, type: "SICK", startDate: new Date("2026-04-08"), endDate: new Date("2026-04-08"), reason: "Unwell", status: "PENDING" },
  });

  // ---- 21. Patient Tags ----
  console.log("  21/22 Patient tags...");
  const tags = [
    { pIdx: 9, tag: "VIP", color: "#FFD700" },
    { pIdx: 19, tag: "VIP", color: "#FFD700" },
    { pIdx: 0, tag: "Acne Prone", color: "#FF6B6B" },
    { pIdx: 0, tag: "Sensitive Skin", color: "#FFA07A" },
    { pIdx: 1, tag: "Laser Patient", color: "#4ECDC4" },
    { pIdx: 8, tag: "Rosacea", color: "#E8998D" },
    { pIdx: 12, tag: "Diabetes — Caution", color: "#EE5D50" },
    { pIdx: 14, tag: "Acne Prone", color: "#FF6B6B" },
    { pIdx: 9, tag: "Package Holder", color: "#4318FF" },
    { pIdx: 19, tag: "Package Holder", color: "#4318FF" },
    { pIdx: 5, tag: "Sun Damage", color: "#FFB547" },
    { pIdx: 15, tag: "Eczema", color: "#A8DADC" },
    { pIdx: 0, tag: "Loyalty", color: "#05CD99" },
  ];
  for (const t of tags) {
    await prisma.patientTag.create({
      data: { patientId: patients[t.pIdx].id, tag: t.tag, color: t.color },
    });
  }

  // ---- 22. Additional Notifications ----
  console.log("  22/22 Extra notifications...");
  const extraNotifs = [
    { userId: doctors[0].id, title: "Follow-Up Due Tomorrow", message: "Noah Davis — IPL results check scheduled for Apr 6", type: "FOLLOW_UP" as const, link: "/follow-ups" },
    { userId: billingUser.id, title: "Overdue Invoice Alert", message: "INV-2026-0004 ($856) for Liam Johnson is 11 days overdue", type: "BILLING" as const, link: "/billing" },
    { userId: receptionist.id, title: "Low Stock Alert", message: "Mineral Sunscreen SPF 50 (PRD-015) is below reorder level — 4 remaining", type: "ALERT" as const },
    { userId: receptionist.id, title: "Waitlist Opening", message: "Dr. Raj Patel has a cancellation on Apr 8. 2 patients on waitlist.", type: "APPOINTMENT" as const, link: "/appointments" },
    { userId: doctors[1].id, title: "Lab Results Ready", message: "HbA1c results ready for Benjamin Taylor — adequate control", type: "LAB" as const, link: "/lab-results" },
  ];
  for (const n of extraNotifs) {
    await prisma.notification.create({ data: n });
  }

  // ---- Done ----
  await printSummary();
}

async function printSummary() {
  console.log("\n📊 Complete Database Summary:");
  console.log("─".repeat(45));

  const tables = [
    ["branches", prisma.branch],
    ["users", prisma.user],
    ["permissions", prisma.permission],
    ["patients", prisma.patient],
    ["patient_allergies", prisma.patientAllergy],
    ["patient_medications", prisma.patientMedication],
    ["patient_tags", prisma.patientTag],
    ["medical_histories", prisma.medicalHistory],
    ["skin_histories", prisma.skinHistory],
    ["insurances", prisma.insurance],
    ["appointments", prisma.appointment],
    ["rooms", prisma.room],
    ["room_allocations", prisma.roomAllocation],
    ["doctor_schedules", prisma.doctorSchedule],
    ["doctor_leaves", prisma.doctorLeave],
    ["consultation_notes", prisma.consultationNote],
    ["treatments", prisma.treatment],
    ["procedures", prisma.procedure],
    ["prescriptions", prisma.prescription],
    ["prescription_items", prisma.prescriptionItem],
    ["lab_tests", prisma.labTest],
    ["triage_records", prisma.triage],
    ["patient_documents", prisma.patientDocument],
    ["invoices", prisma.invoice],
    ["payments", prisma.payment],
    ["refunds", prisma.refund],
    ["packages", prisma.package],
    ["patient_packages", prisma.patientPackage],
    ["leads", prisma.lead],
    ["call_logs", prisma.callLog],
    ["communication_logs", prisma.communicationLog],
    ["follow_ups", prisma.followUp],
    ["consent_forms", prisma.consentForm],
    ["ai_transcriptions", prisma.aITranscription],
    ["notifications", prisma.notification],
    ["audit_logs", prisma.auditLog],
    ["products", prisma.product],
    ["waitlist", prisma.waitlist],
    ["system_settings", prisma.systemSetting],
  ] as const;

  let total = 0;
  let populated = 0;
  for (const [name, model] of tables) {
    const count = await (model as { count: () => Promise<number> }).count();
    total += count;
    if (count > 0) populated++;
    const bar = count > 0 ? "█".repeat(Math.min(count, 30)) : "░";
    console.log(`  ${name.padEnd(24)} ${String(count).padStart(4)}  ${bar}`);
  }

  console.log("─".repeat(45));
  console.log(`  TOTAL RECORDS: ${total}`);
  console.log(`  TABLES WITH DATA: ${populated}/${tables.length}`);
  console.log("");
}

main()
  .catch((e) => { console.error("❌ Seed failed:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
