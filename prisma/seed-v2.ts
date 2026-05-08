import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import "dotenv/config";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("🌱 Seeding new tables (v2 migration)...\n");

  // Get existing user IDs
  const doctors = await prisma.user.findMany({ where: { role: "DOCTOR" } });
  const patients = await prisma.patient.findMany({ take: 5 });
  const appointments = await prisma.appointment.findMany({ take: 3 });
  const branches = await prisma.branch.findMany();

  if (doctors.length === 0 || patients.length === 0) {
    console.log("⚠️  No existing data found. Run the v1 seed first: npx tsx prisma/seed.ts");
    return;
  }

  const mainBranch = branches.find((b) => b.code === "MAIN")!;

  // ---- Doctor Schedules ----
  console.log("  Creating doctor schedules...");
  const days = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"] as const;

  for (const doctor of doctors) {
    const workDays = doctor.branchId === mainBranch.id
      ? days
      : days.slice(0, 5); // non-main branches: Mon-Fri only

    for (const day of workDays) {
      const isSaturday = day === "SATURDAY";
      await prisma.doctorSchedule.create({
        data: {
          doctorId: doctor.id,
          dayOfWeek: day,
          startTime: isSaturday ? "09:00" : "08:30",
          endTime: isSaturday ? "14:00" : "17:30",
          breakStart: isSaturday ? null : "13:00",
          breakEnd: isSaturday ? null : "14:00",
          slotMinutes: 30,
          maxPatients: isSaturday ? 8 : 16,
          isActive: true,
          effectiveFrom: new Date("2026-01-01"),
        },
      });
    }
  }

  // ---- Consent Forms ----
  console.log("  Creating consent forms...");
  const consentTemplates = [
    { title: "Laser Treatment Consent", templateKey: "CONSENT-LASER", content: "I, the undersigned patient, hereby consent to undergo laser treatment as described by my treating physician. I understand the potential risks including but not limited to: temporary redness, swelling, blistering, scarring, pigmentation changes, and infection. I have been informed of alternative treatments and have had the opportunity to ask questions." },
    { title: "Chemical Peel Consent", templateKey: "CONSENT-PEEL", content: "I consent to undergo chemical peel treatment. I understand that results may vary and that multiple sessions may be required. Risks include redness, peeling, sensitivity, pigmentation changes, and in rare cases scarring. I agree to follow all pre and post-treatment instructions." },
    { title: "Injectable Treatment Consent (Botox/Fillers)", templateKey: "CONSENT-INJECTABLE", content: "I consent to injectable treatment with botulinum toxin and/or dermal fillers. I understand the risks including bruising, swelling, asymmetry, infection, allergic reaction, and in rare cases vascular occlusion. I confirm I am not pregnant or breastfeeding." },
    { title: "General Treatment Consent", templateKey: "CONSENT-GENERAL", content: "I consent to the dermatological treatment recommended by my physician. I have been informed about the nature of the procedure, expected outcomes, potential risks, and alternatives. I agree to follow the prescribed pre and post-treatment care instructions." },
    { title: "Photography Consent (Before/After)", templateKey: "CONSENT-PHOTO", content: "I consent to clinical photographs being taken before, during, and after my treatment for the purposes of medical records and treatment planning. I understand these images will be stored securely and may be used for educational purposes with my identity protected." },
  ];

  for (let i = 0; i < Math.min(patients.length, 5); i++) {
    const template = consentTemplates[i % consentTemplates.length];
    await prisma.consentForm.create({
      data: {
        patientId: patients[i].id,
        appointmentId: appointments[i]?.id || null,
        title: template.title,
        templateKey: template.templateKey,
        content: template.content,
        status: i < 3 ? "SIGNED" : "PENDING",
        signedAt: i < 3 ? new Date() : null,
        witnessName: i < 3 ? "Maria Santos" : null,
      },
    });
  }

  // ---- Products / Inventory ----
  console.log("  Creating product inventory...");
  const products = [
    { name: "CeraVe Moisturizing Cream", sku: "PRD-001", category: "MOISTURIZER" as const, brand: "CeraVe", costPrice: 12, sellPrice: 24.99, quantity: 45, unit: "jar" },
    { name: "EltaMD UV Clear SPF 46", sku: "PRD-002", category: "SUNSCREEN" as const, brand: "EltaMD", costPrice: 18, sellPrice: 39.99, quantity: 30, unit: "tube" },
    { name: "SkinCeuticals C E Ferulic", sku: "PRD-003", category: "SERUM" as const, brand: "SkinCeuticals", costPrice: 85, sellPrice: 169, quantity: 12, unit: "bottle", reorderLevel: 8 },
    { name: "La Roche-Posay Toleriane Cleanser", sku: "PRD-004", category: "CLEANSER" as const, brand: "La Roche-Posay", costPrice: 8, sellPrice: 16.99, quantity: 50, unit: "bottle" },
    { name: "Tretinoin Cream 0.025%", sku: "PRD-005", category: "TREATMENT" as const, brand: "Generic", costPrice: 5, sellPrice: 35, quantity: 25, unit: "tube" },
    { name: "Hydroquinone Cream 4%", sku: "PRD-006", category: "TREATMENT" as const, brand: "Generic", costPrice: 8, sellPrice: 45, quantity: 15, unit: "tube" },
    { name: "Azelaic Acid Gel 15%", sku: "PRD-007", category: "TREATMENT" as const, brand: "Generic", costPrice: 10, sellPrice: 40, quantity: 20, unit: "tube" },
    { name: "Glycolic Acid Cleanser 10%", sku: "PRD-008", category: "CLEANSER" as const, brand: "MediCore", costPrice: 6, sellPrice: 28, quantity: 35, unit: "bottle" },
    { name: "Hyaluronic Acid Serum", sku: "PRD-009", category: "SERUM" as const, brand: "MediCore", costPrice: 10, sellPrice: 42, quantity: 22, unit: "bottle" },
    { name: "Niacinamide 10% + Zinc", sku: "PRD-010", category: "SERUM" as const, brand: "The Ordinary", costPrice: 4, sellPrice: 12.99, quantity: 60, unit: "bottle" },
    { name: "Post-Procedure Recovery Kit", sku: "PRD-011", category: "TREATMENT" as const, brand: "MediCore", costPrice: 25, sellPrice: 65, quantity: 8, reorderLevel: 10, unit: "kit" },
    { name: "Dermaroller 0.5mm", sku: "PRD-012", category: "TOOL" as const, brand: "MediCore", costPrice: 5, sellPrice: 29.99, quantity: 3, reorderLevel: 5, unit: "piece" },
    { name: "Collagen Supplements (30ct)", sku: "PRD-013", category: "SUPPLEMENT" as const, brand: "Vital Proteins", costPrice: 15, sellPrice: 39.99, quantity: 18, unit: "bottle" },
    { name: "Vitamin C Serum 20%", sku: "PRD-014", category: "SERUM" as const, brand: "MediCore", costPrice: 12, sellPrice: 48, quantity: 0, reorderLevel: 5, unit: "bottle" },
    { name: "Mineral Sunscreen SPF 50", sku: "PRD-015", category: "SUNSCREEN" as const, brand: "MediCore", costPrice: 10, sellPrice: 32, quantity: 4, reorderLevel: 10, unit: "tube" },
  ];

  for (const p of products) {
    await prisma.product.create({
      data: {
        name: p.name,
        sku: p.sku,
        category: p.category,
        brand: p.brand,
        costPrice: p.costPrice,
        sellPrice: p.sellPrice,
        quantity: p.quantity,
        reorderLevel: p.reorderLevel || 5,
        unit: p.unit,
        branchId: mainBranch.id,
        expiryDate: new Date("2027-06-30"),
      },
    });
  }

  // ---- Waitlist ----
  console.log("  Creating waitlist entries...");
  await prisma.waitlist.createMany({
    data: [
      { patientId: patients[3].id, patientName: `${patients[3].firstName} ${patients[3].lastName}`, phone: patients[3].phone ?? "", doctorId: doctors[0].id, preferredDate: new Date("2026-04-10"), preferredTime: "10:00", appointmentType: "PROCEDURE", priority: "NORMAL", notes: "Wants laser session, flexible on time" },
      { patientId: patients[4].id, patientName: `${patients[4].firstName} ${patients[4].lastName}`, phone: patients[4].phone ?? "", doctorId: doctors[1].id, preferredDate: new Date("2026-04-08"), appointmentType: "CONSULTATION", priority: "URGENT", notes: "Skin reaction, needs earliest available" },
      { patientId: patients[2].id, patientName: `${patients[2].firstName} ${patients[2].lastName}`, phone: patients[2].phone ?? "", appointmentType: "FOLLOW_UP", priority: "NORMAL", notes: "Any doctor, any day this week" },
    ],
  });

  // ---- System Settings ----
  console.log("  Creating system settings...");
  const settings = [
    { key: "clinic_name", value: "MediCore Skincare Clinic", group: "general", label: "Clinic Name", type: "string" },
    { key: "clinic_email", value: "info@medicore.com", group: "general", label: "Clinic Email", type: "string" },
    { key: "clinic_phone", value: "(555) 100-0001", group: "general", label: "Clinic Phone", type: "string" },
    { key: "tax_rate", value: "7", group: "billing", label: "Tax Rate (%)", type: "number" },
    { key: "invoice_prefix", value: "INV", group: "billing", label: "Invoice Prefix", type: "string" },
    { key: "invoice_due_days", value: "14", group: "billing", label: "Default Due Days", type: "number" },
    { key: "currency", value: "USD", group: "billing", label: "Currency", type: "string" },
    { key: "default_slot_minutes", value: "30", group: "appointments", label: "Default Slot Duration (min)", type: "number" },
    { key: "buffer_minutes", value: "5", group: "appointments", label: "Buffer Between Appointments (min)", type: "number" },
    { key: "max_daily_appointments", value: "20", group: "appointments", label: "Max Appointments Per Doctor/Day", type: "number" },
    { key: "allow_online_booking", value: "true", group: "appointments", label: "Allow Online Booking", type: "boolean" },
    { key: "working_hours_start", value: "08:30", group: "appointments", label: "Working Hours Start", type: "string" },
    { key: "working_hours_end", value: "17:30", group: "appointments", label: "Working Hours End", type: "string" },
    { key: "sms_notifications", value: "true", group: "notifications", label: "SMS Notifications", type: "boolean" },
    { key: "email_notifications", value: "true", group: "notifications", label: "Email Notifications", type: "boolean" },
    { key: "whatsapp_notifications", value: "false", group: "notifications", label: "WhatsApp Notifications", type: "boolean" },
    { key: "appointment_reminder_hours", value: "24", group: "notifications", label: "Reminder Before (hours)", type: "number" },
    { key: "follow_up_reminder_days", value: "1", group: "notifications", label: "Follow-up Reminder (days before)", type: "number" },
  ];

  for (const s of settings) {
    await prisma.systemSetting.create({ data: s });
  }

  // ---- Summary ----
  const counts = {
    doctorSchedules: await prisma.doctorSchedule.count(),
    consentForms: await prisma.consentForm.count(),
    products: await prisma.product.count(),
    waitlist: await prisma.waitlist.count(),
    systemSettings: await prisma.systemSetting.count(),
  };

  console.log("\n✅ V2 seed complete!");
  Object.entries(counts).forEach(([k, v]) => console.log(`   ${k}: ${v}`));

  // Full database summary
  console.log("\n📊 Full database summary:");
  const allCounts = {
    branches: await prisma.branch.count(),
    users: await prisma.user.count(),
    patients: await prisma.patient.count(),
    patientAllergies: await prisma.patientAllergy.count(),
    treatments: await prisma.treatment.count(),
    rooms: await prisma.room.count(),
    appointments: await prisma.appointment.count(),
    packages: await prisma.package.count(),
    leads: await prisma.lead.count(),
    notifications: await prisma.notification.count(),
    doctorSchedules: await prisma.doctorSchedule.count(),
    consentForms: await prisma.consentForm.count(),
    products: await prisma.product.count(),
    waitlist: await prisma.waitlist.count(),
    systemSettings: await prisma.systemSetting.count(),
  };
  Object.entries(allCounts).forEach(([k, v]) => console.log(`   ${k}: ${v}`));
  console.log(`   TOTAL RECORDS: ${Object.values(allCounts).reduce((a, b) => a + b, 0)}`);
  console.log("");
}

main()
  .catch((e) => { console.error("❌ Seed failed:", e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
