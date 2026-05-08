import { PrismaClient, type SkinTypeScale } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { randomUUID } from "crypto";
import "dotenv/config";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

// Pre-generated UUIDs so relations work
const branchIds = {
  main: randomUUID(),
  downtown: randomUUID(),
  westside: randomUUID(),
};

const userIds = {
  superAdmin: randomUUID(),
  admin: randomUUID(),
  drChen: randomUUID(),
  drPatel: randomUUID(),
  drKim: randomUUID(),
  drWilliams: randomUUID(),
  receptionist: randomUUID(),
  billing: randomUUID(),
  callCenter: randomUUID(),
  assistant: randomUUID(),
};

const patientIds = Array.from({ length: 20 }, () => randomUUID());
const treatmentIds = Array.from({ length: 12 }, () => randomUUID());
const packageIds = Array.from({ length: 5 }, () => randomUUID());
const roomIds = Array.from({ length: 10 }, () => randomUUID());

// Simple password hash placeholder (in production use bcrypt)
const passwordHash = "$2b$10$placeholder.hash.for.dev.only.000000000000000000000";

async function main() {
  console.log("🌱 Seeding MediCore database...\n");

  // ---- Tenant ----
  // Single seed tenant; production migrations seed their own
  // canonical tenant via the v36 SQL. This is for local/dev seed
  // only.
  console.log("  Creating tenant...");
  const tenantId = randomUUID();
  await prisma.tenant.create({
    data: {
      id: tenantId,
      slug: "scalamedic-dev",
      name: "ScalaMedic Development Tenant",
      shortName: "ScalaMedic",
      mfaIssuer: "ScalaMedic",
      poweredByLine: "Powered by ScalaMedic",
    },
  });

  // ---- Branches ----
  console.log("  Creating branches...");
  await prisma.branch.createMany({
    data: [
      { id: branchIds.main, tenantId, name: "MediCore Main Clinic", code: "MAIN", address: "123 Medical Plaza, Downtown", phone: "(555) 100-0001", email: "main@medicore.com", timezone: "America/New_York" },
      { id: branchIds.downtown, tenantId, name: "MediCore Downtown", code: "DT", address: "456 City Center Ave", phone: "(555) 100-0002", email: "downtown@medicore.com", timezone: "America/New_York" },
      { id: branchIds.westside, tenantId, name: "MediCore Westside", code: "WS", address: "789 West Blvd, Suite 200", phone: "(555) 100-0003", email: "westside@medicore.com", timezone: "America/New_York" },
    ],
  });

  // ---- Users ----
  console.log("  Creating staff...");
  await prisma.user.createMany({
    data: [
      { id: userIds.superAdmin, tenantId, email: "superadmin@medicore.com", passwordHash, name: "Alex Thompson", phone: "(555) 201-0010", role: "SUPER_ADMIN", branchId: branchIds.main },
      { id: userIds.admin, tenantId, email: "admin@medicore.com", passwordHash, name: "Dr. Sarah Mitchell", phone: "(555) 201-0001", role: "ADMIN", branchId: branchIds.main, speciality: "Dermatology", licenseNumber: "DRM-001" },
      { id: userIds.drChen, tenantId, email: "dr.chen@medicore.com", passwordHash, name: "Dr. Emily Chen", phone: "(555) 201-0002", role: "DOCTOR", branchId: branchIds.main, speciality: "Cosmetic Dermatology", licenseNumber: "DRM-002" },
      { id: userIds.drPatel, tenantId, email: "dr.patel@medicore.com", passwordHash, name: "Dr. Raj Patel", phone: "(555) 201-0003", role: "DOCTOR", branchId: branchIds.main, speciality: "Laser & Skin Surgery", licenseNumber: "DRM-003" },
      { id: userIds.drKim, tenantId, email: "dr.kim@medicore.com", passwordHash, name: "Dr. Lisa Kim", phone: "(555) 201-0004", role: "DOCTOR", branchId: branchIds.downtown, speciality: "Aesthetic Medicine", licenseNumber: "DRM-004" },
      { id: userIds.drWilliams, tenantId, email: "dr.williams@medicore.com", passwordHash, name: "Dr. Mark Williams", phone: "(555) 201-0009", role: "DOCTOR", branchId: branchIds.westside, speciality: "Clinical Dermatology", licenseNumber: "DRM-005" },
      { id: userIds.receptionist, tenantId, email: "reception@medicore.com", passwordHash, name: "Maria Santos", phone: "(555) 201-0005", role: "RECEPTIONIST", branchId: branchIds.main },
      { id: userIds.billing, tenantId, email: "billing@medicore.com", passwordHash, name: "James Wilson", phone: "(555) 201-0006", role: "BILLING", branchId: branchIds.main },
      { id: userIds.callCenter, tenantId, email: "callcenter@medicore.com", passwordHash, name: "Sophie Taylor", phone: "(555) 201-0007", role: "CALL_CENTER", branchId: branchIds.main },
      { id: userIds.assistant, tenantId, email: "nurse@medicore.com", passwordHash, name: "Rachel Green", phone: "(555) 201-0008", role: "ASSISTANT", branchId: branchIds.main },
    ],
  });

  // ---- Treatments ----
  console.log("  Creating treatment catalog...");
  const treatments = [
    { id: treatmentIds[0], name: "Fractional CO2 Laser", code: "TRT-001", category: "LASER" as const, description: "Precision laser for skin resurfacing, acne scars, and wrinkles", duration: 45, basePrice: 450 },
    { id: treatmentIds[1], name: "IPL Photofacial", code: "TRT-002", category: "LASER" as const, description: "Intense pulsed light for sun damage, pigmentation, and redness", duration: 30, basePrice: 300 },
    { id: treatmentIds[2], name: "Glycolic Acid Peel", code: "TRT-003", category: "CHEMICAL_PEEL" as const, description: "Medium-depth peel for acne, pigmentation, and skin texture", duration: 30, basePrice: 150 },
    { id: treatmentIds[3], name: "TCA Peel", code: "TRT-004", category: "CHEMICAL_PEEL" as const, description: "Deep chemical peel for scarring and severe sun damage", duration: 45, basePrice: 250 },
    { id: treatmentIds[4], name: "HydraFacial", code: "TRT-005", category: "FACIAL" as const, description: "Deep cleansing, exfoliation, extraction, and hydration", duration: 60, basePrice: 200 },
    { id: treatmentIds[5], name: "LED Light Therapy", code: "TRT-006", category: "FACIAL" as const, description: "Red and blue light therapy for acne and anti-aging", duration: 20, basePrice: 75 },
    { id: treatmentIds[6], name: "Botox", code: "TRT-007", category: "INJECTABLE" as const, description: "Botulinum toxin for wrinkle reduction", duration: 30, basePrice: 350 },
    { id: treatmentIds[7], name: "Dermal Fillers", code: "TRT-008", category: "INJECTABLE" as const, description: "Hyaluronic acid fillers for volume and contour", duration: 45, basePrice: 500 },
    { id: treatmentIds[8], name: "Microneedling + PRP", code: "TRT-009", category: "OTHER" as const, description: "Collagen induction with platelet-rich plasma", duration: 60, basePrice: 400 },
    { id: treatmentIds[9], name: "Cryotherapy", code: "TRT-010", category: "OTHER" as const, description: "Freezing treatment for warts, skin tags, and lesions", duration: 15, basePrice: 100 },
    { id: treatmentIds[10], name: "Mole Removal", code: "TRT-011", category: "SURGICAL" as const, description: "Surgical excision or shave removal of moles", duration: 30, basePrice: 250 },
    { id: treatmentIds[11], name: "PRP Hair Restoration", code: "TRT-012", category: "INJECTABLE" as const, description: "Platelet-rich plasma injections for hair loss", duration: 45, basePrice: 600 },
  ];
  await prisma.treatment.createMany({ data: treatments });

  // ---- Rooms ----
  console.log("  Creating rooms...");
  await prisma.room.createMany({
    data: [
      { id: roomIds[0], branchId: branchIds.main, name: "Room 1 - Consultation", number: "101", floor: 1, type: "CONSULTATION", capacity: 2 },
      { id: roomIds[1], branchId: branchIds.main, name: "Room 2 - Laser Suite", number: "102", floor: 1, type: "PROCEDURE", capacity: 3, equipment: "CO2 Laser, IPL, LED panel" },
      { id: roomIds[2], branchId: branchIds.main, name: "Room 3 - Procedure", number: "103", floor: 1, type: "PROCEDURE", capacity: 2, equipment: "Microneedling, cryo unit" },
      { id: roomIds[3], branchId: branchIds.main, name: "Room 4 - Consultation", number: "104", floor: 1, type: "CONSULTATION", capacity: 2 },
      { id: roomIds[4], branchId: branchIds.main, name: "Room 5 - Recovery", number: "105", floor: 1, type: "RECOVERY", capacity: 4 },
      { id: roomIds[5], branchId: branchIds.main, name: "Waiting Area", number: "W1", floor: 1, type: "WAITING", capacity: 15 },
      { id: roomIds[6], branchId: branchIds.downtown, name: "Room 1 - Consultation", number: "201", floor: 2, type: "CONSULTATION", capacity: 2 },
      { id: roomIds[7], branchId: branchIds.downtown, name: "Room 2 - Procedure", number: "202", floor: 2, type: "PROCEDURE", capacity: 3, status: "MAINTENANCE" as const, isAvailable: false },
      { id: roomIds[8], branchId: branchIds.westside, name: "Room 1 - Multi-Purpose", number: "301", floor: 3, type: "PROCEDURE", capacity: 3 },
      { id: roomIds[9], branchId: branchIds.westside, name: "Room 2 - Consultation", number: "302", floor: 3, type: "CONSULTATION", capacity: 2 },
    ],
  });

  // ---- Patients ----
  console.log("  Creating patients...");
  const patientsData = [
    { firstName: "Olivia", lastName: "Harper", email: "olivia.h@email.com", phone: "(555) 301-0001", dob: "1992-05-14", gender: "FEMALE", bloodType: "O+", skinType: "TYPE_III", doctorId: userIds.drChen },
    { firstName: "Ethan", lastName: "Brooks", email: "ethan.b@email.com", phone: "(555) 301-0002", dob: "1988-11-22", gender: "MALE", bloodType: "A+", skinType: "TYPE_II", doctorId: userIds.drPatel },
    { firstName: "Sophia", lastName: "Martinez", email: "sophia.m@email.com", phone: "(555) 301-0003", dob: "1995-08-30", gender: "FEMALE", bloodType: "B+", skinType: "TYPE_IV", doctorId: userIds.drChen },
    { firstName: "Liam", lastName: "Johnson", email: "liam.j@email.com", phone: "(555) 301-0004", dob: "1985-03-17", gender: "MALE", bloodType: "AB+", skinType: "TYPE_II", doctorId: userIds.drKim, branch: branchIds.downtown },
    { firstName: "Ava", lastName: "Williams", email: "ava.w@email.com", phone: "(555) 301-0005", dob: "1999-12-05", gender: "FEMALE", bloodType: "O-", skinType: "TYPE_V", doctorId: userIds.drPatel },
    { firstName: "Noah", lastName: "Davis", email: "noah.d@email.com", phone: "(555) 301-0006", dob: "1990-07-21", gender: "MALE", bloodType: "A-", skinType: "TYPE_I", doctorId: userIds.drChen },
    { firstName: "Isabella", lastName: "Garcia", email: "isabella.g@email.com", phone: "(555) 301-0007", dob: "1993-01-10", gender: "FEMALE", bloodType: "B-", skinType: "TYPE_IV", doctorId: userIds.drKim, branch: branchIds.downtown },
    { firstName: "Mason", lastName: "Brown", email: "mason.b@email.com", phone: "(555) 301-0008", dob: "1987-09-03", gender: "MALE", bloodType: "O+", skinType: "TYPE_III", doctorId: userIds.drWilliams, branch: branchIds.westside },
    { firstName: "Emma", lastName: "Wilson", email: "emma.w@email.com", phone: "(555) 301-0009", dob: "1997-04-28", gender: "FEMALE", bloodType: "A+", skinType: "TYPE_II", doctorId: userIds.drPatel },
    { firstName: "Charlotte", lastName: "Lee", email: "charlotte.l@email.com", phone: "(555) 301-0010", dob: "1991-06-12", gender: "FEMALE", bloodType: "AB-", skinType: "TYPE_VI", doctorId: userIds.drChen, isVip: true },
    { firstName: "James", lastName: "Anderson", email: "james.a@email.com", phone: "(555) 301-0011", dob: "1983-02-14", gender: "MALE", bloodType: "O+", skinType: "TYPE_I", doctorId: userIds.drKim, branch: branchIds.downtown },
    { firstName: "Mia", lastName: "Thomas", email: "mia.t@email.com", phone: "(555) 301-0012", dob: "1996-10-08", gender: "FEMALE", bloodType: "B+", skinType: "TYPE_III", doctorId: userIds.drChen },
    { firstName: "Benjamin", lastName: "Taylor", email: "ben.t@email.com", phone: "(555) 301-0013", dob: "1994-08-19", gender: "MALE", bloodType: "A+", skinType: "TYPE_III", doctorId: userIds.drPatel },
    { firstName: "Amelia", lastName: "Moore", email: "amelia.m@email.com", phone: "(555) 301-0014", dob: "1989-12-25", gender: "FEMALE", bloodType: "O+", skinType: "TYPE_II", doctorId: userIds.drWilliams, branch: branchIds.westside },
    { firstName: "Lucas", lastName: "Jackson", email: "lucas.j@email.com", phone: "(555) 301-0015", dob: "2000-03-07", gender: "MALE", bloodType: "AB+", skinType: "TYPE_IV", doctorId: userIds.drChen },
    { firstName: "Harper", lastName: "White", email: "harper.w@email.com", phone: "(555) 301-0016", dob: "1998-06-30", gender: "FEMALE", bloodType: "B-", skinType: "TYPE_I", doctorId: userIds.drPatel },
    { firstName: "Alexander", lastName: "Harris", email: "alex.h@email.com", phone: "(555) 301-0017", dob: "1986-11-11", gender: "MALE", bloodType: "A-", skinType: "TYPE_III", doctorId: userIds.drKim, branch: branchIds.downtown },
    { firstName: "Ella", lastName: "Clark", email: "ella.c@email.com", phone: "(555) 301-0018", dob: "2001-02-15", gender: "FEMALE", bloodType: "O+", skinType: "TYPE_V", doctorId: userIds.drChen },
    { firstName: "Daniel", lastName: "Lewis", email: "daniel.l@email.com", phone: "(555) 301-0019", dob: "1992-09-22", gender: "MALE", bloodType: "A+", skinType: "TYPE_II", doctorId: userIds.drWilliams, branch: branchIds.westside },
    { firstName: "Grace", lastName: "Robinson", email: "grace.r@email.com", phone: "(555) 301-0020", dob: "1995-04-03", gender: "FEMALE", bloodType: "B+", skinType: "TYPE_III", doctorId: userIds.drPatel, isVip: true },
  ];

  for (let i = 0; i < patientsData.length; i++) {
    const p = patientsData[i];
    await prisma.patient.create({
      data: {
        id: patientIds[i],
        patientCode: `PT-${String(i + 1).padStart(4, "0")}`,
        firstName: p.firstName,
        lastName: p.lastName,
        email: p.email,
        phone: p.phone,
        dateOfBirth: new Date(p.dob),
        gender: p.gender as "MALE" | "FEMALE",
        bloodType: p.bloodType,
        skinType: p.skinType as SkinTypeScale,
        branchId: p.branch || branchIds.main,
        tenantId,
        assignedDoctorId: p.doctorId,
        consentGiven: true,
        isVip: p.isVip || false,
        address: `${100 + i} Oak Street`,
        city: "Westville",
        emergencyContact: `Emergency for ${p.firstName}`,
        emergencyPhone: `(555) 999-${String(i + 1).padStart(4, "0")}`,
      },
    });
  }

  // ---- Allergies ----
  console.log("  Creating patient allergies...");
  await prisma.patientAllergy.createMany({
    data: [
      { patientId: patientIds[0], allergen: "Salicylic Acid", severity: "MODERATE", reaction: "Skin rash, redness" },
      { patientId: patientIds[0], allergen: "Latex", severity: "SEVERE", reaction: "Contact dermatitis" },
      { patientId: patientIds[1], allergen: "Retinol", severity: "MILD", reaction: "Excessive dryness" },
      { patientId: patientIds[3], allergen: "Hydroquinone", severity: "MODERATE", reaction: "Irritation" },
      { patientId: patientIds[3], allergen: "Benzoyl Peroxide", severity: "MILD", reaction: "Peeling" },
      { patientId: patientIds[6], allergen: "Fragrance", severity: "MODERATE", reaction: "Contact dermatitis" },
      { patientId: patientIds[13], allergen: "Parabens", severity: "MILD", reaction: "Itching" },
      { patientId: patientIds[17], allergen: "Tea Tree Oil", severity: "MODERATE", reaction: "Redness, swelling" },
    ],
  });

  // ---- Packages (with nested PackageTreatment rows) ----
  console.log("  Creating packages...");
  const packagesSeed = [
    { id: packageIds[0], name: "Glow Up Package", description: "6 HydraFacials + 3 Chemical Peels for complete skin rejuvenation", treatments: [{ name: "HydraFacial", sessions: 6 }, { name: "Glycolic Acid Peel", sessions: 3 }], price: 1500, validityDays: 180 },
    { id: packageIds[1], name: "Acne Clear Plan", description: "10 targeted sessions combining LED therapy and chemical peels", treatments: [{ name: "LED Light Therapy", sessions: 6 }, { name: "Glycolic Acid Peel", sessions: 4 }], price: 800, validityDays: 120 },
    { id: packageIds[2], name: "Anti-Aging Premium", description: "Botox + Fillers + Laser for comprehensive anti-aging", treatments: [{ name: "Botox", sessions: 2 }, { name: "Dermal Fillers", sessions: 1 }, { name: "Fractional CO2 Laser", sessions: 3 }], price: 3200, validityDays: 365 },
    { id: packageIds[3], name: "Hair Restore Bundle", description: "4 PRP sessions for hair restoration", treatments: [{ name: "PRP Hair Restoration", sessions: 4 }], price: 2000, validityDays: 180 },
    { id: packageIds[4], name: "Monthly Maintenance", description: "Monthly HydraFacial + LED combo for ongoing skin health", treatments: [{ name: "HydraFacial", sessions: 12 }, { name: "LED Light Therapy", sessions: 12 }], price: 2400, validityDays: 365 },
  ];
  for (const p of packagesSeed) {
    await prisma.package.create({
      data: {
        id: p.id, name: p.name, description: p.description, price: p.price, validityDays: p.validityDays,
        treatments: { create: p.treatments.map(t => ({ name: t.name, sessions: t.sessions })) },
      },
    });
  }

  // ---- Appointments (today) ----
  console.log("  Creating appointments...");
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const appointments = [
    { code: "APT-0001", patientIdx: 0, doctorId: userIds.drChen, room: roomIds[0], time: "09:00", end: "09:30", type: "FOLLOW_UP" as const, status: "COMPLETED" as const, stage: "HISTORY_UPDATE" as const },
    { code: "APT-0002", patientIdx: 1, doctorId: userIds.drPatel, room: roomIds[1], time: "09:00", end: "09:45", type: "PROCEDURE" as const, status: "IN_PROGRESS" as const, stage: "TREATMENT" as const, notes: "Laser resurfacing session 3 of 6" },
    { code: "APT-0003", patientIdx: 4, doctorId: userIds.drPatel, time: "10:00", end: "10:30", type: "CONSULTATION" as const, status: "WAITING" as const, stage: "WAITING" as const },
    { code: "APT-0004", patientIdx: 8, doctorId: userIds.drChen, time: "10:00", end: "10:30", type: "CONSULTATION" as const, status: "CHECKED_IN" as const, stage: "CHECKIN" as const },
    { code: "APT-0005", patientIdx: 14, doctorId: userIds.drChen, time: "10:30", end: "11:15", type: "PROCEDURE" as const, status: "CONFIRMED" as const, stage: "BOOKED" as const, notes: "Microneedling session" },
    { code: "APT-0006", patientIdx: 17, doctorId: userIds.drChen, time: "11:00", end: "11:30", type: "FOLLOW_UP" as const, status: "CONFIRMED" as const, stage: "BOOKED" as const },
    { code: "APT-0007", patientIdx: 13, doctorId: userIds.drWilliams, time: "09:30", end: "10:15", type: "PROCEDURE" as const, status: "IN_PROGRESS" as const, stage: "TREATMENT" as const, notes: "Chemical peel - glycolic acid", branch: branchIds.westside },
    { code: "APT-0008", patientIdx: 2, doctorId: userIds.drChen, time: "11:30", end: "12:00", type: "REVIEW" as const, status: "SCHEDULED" as const, stage: "BOOKED" as const },
    { code: "APT-0009", patientIdx: 5, doctorId: userIds.drPatel, time: "11:00", end: "11:45", type: "PROCEDURE" as const, status: "SCHEDULED" as const, stage: "BOOKED" as const, notes: "IPL treatment for sun damage", priority: "URGENT" as const },
    { code: "APT-0010", patientIdx: 9, doctorId: userIds.drChen, time: "14:00", end: "14:30", type: "CONSULTATION" as const, status: "SCHEDULED" as const, stage: "BOOKED" as const },
  ];

  for (const apt of appointments) {
    await prisma.appointment.create({
      data: {
        appointmentCode: apt.code,
        patientId: patientIds[apt.patientIdx],
        doctorId: apt.doctorId,
        branchId: apt.branch || branchIds.main,
        tenantId,
        roomId: apt.room || null,
        date: today,
        startTime: apt.time,
        endTime: apt.end,
        durationMinutes: 30,
        type: apt.type,
        status: apt.status,
        workflowStage: apt.stage,
        priority: apt.priority || "NORMAL",
        notes: apt.notes || null,
        createdById: userIds.receptionist,
      },
    });
  }

  // ---- Leads ----
  console.log("  Creating leads...");
  await prisma.lead.createMany({
    data: [
      { name: "Rebecca Stone", phone: "(555) 401-0001", email: "rebecca.s@email.com", source: "CALL", status: "NEW", interest: "Acne Treatment", assignedToId: userIds.callCenter, branchId: branchIds.main, notes: "Called asking about acne treatment options" },
      { name: "Michael Foster", phone: "(555) 401-0002", source: "WEBSITE", status: "CONTACTED", interest: "Anti-aging / Botox", assignedToId: userIds.callCenter, branchId: branchIds.main, callbackDate: new Date(today.getTime() + 86400000) },
      { name: "Jessica Wright", phone: "(555) 401-0003", email: "jess.w@email.com", source: "SOCIAL_MEDIA", status: "INTERESTED", interest: "Laser Treatment", assignedToId: userIds.callCenter, branchId: branchIds.main },
      { name: "Andrew Kim", phone: "(555) 401-0004", source: "REFERRAL", status: "BOOKED", interest: "Hair Loss / PRP", assignedToId: userIds.callCenter, branchId: branchIds.main },
      { name: "Diana Murphy", phone: "(555) 401-0005", source: "WALK_IN", status: "NOT_INTERESTED", interest: "Chemical Peel", assignedToId: userIds.callCenter, branchId: branchIds.downtown },
      { name: "Sandra Mitchell", phone: "(555) 401-0007", source: "WEBSITE", status: "NEW", interest: "Skin Check", assignedToId: userIds.callCenter, branchId: branchIds.westside },
    ],
  });

  // ---- Notifications ----
  console.log("  Creating notifications...");
  await prisma.notification.createMany({
    data: [
      { userId: userIds.admin, title: "New Patient Registration", message: "Ella Clark (PT-0018) has been registered as a new patient", type: "SYSTEM", link: "/patients" },
      { userId: userIds.admin, title: "Overdue Invoice", message: "Invoice INV-2026-0004 for Liam Johnson is overdue ($856)", type: "BILLING", link: "/billing" },
      { userId: userIds.drChen, title: "Upcoming Appointment", message: "Emma Wilson - Rosacea consultation at 10:00 AM", type: "APPOINTMENT", link: "/appointments" },
      { userId: userIds.admin, title: "Follow-Up Due", message: "3 follow-ups are due today", type: "FOLLOW_UP", link: "/follow-ups" },
      { userId: userIds.admin, title: "Lab Results Ready", message: "Patch test results ready for Olivia Harper", type: "LAB", isRead: true },
    ],
  });

  // ---- Verify ----
  const counts = {
    branches: await prisma.branch.count(),
    users: await prisma.user.count(),
    patients: await prisma.patient.count(),
    allergies: await prisma.patientAllergy.count(),
    treatments: await prisma.treatment.count(),
    rooms: await prisma.room.count(),
    packages: await prisma.package.count(),
    appointments: await prisma.appointment.count(),
    leads: await prisma.lead.count(),
    notifications: await prisma.notification.count(),
  };

  console.log("\n✅ Seed complete! Database populated:");
  Object.entries(counts).forEach(([k, v]) => console.log(`   ${k}: ${v}`));
  console.log("");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
