// Shared caller-match logic. Used by:
//   - GET  /api/calls/match           (UI on-demand)
//   - POST /api/calls/incoming        (dialer webhook — inline, avoids a
//                                      server-to-self fetch that fails over
//                                      public HTTPS inside the Next.js runtime)
import { prisma } from "@/lib/prisma";

function normalizePhone(phone: string): string {
  return phone.replace(/[^0-9]/g, "").slice(-10);
}

export async function matchCaller(phone: string) {
  const normalized = normalizePhone(phone);

  // Guard against empty search terms — Prisma `contains: ""` matches every row.
  // WhatsApp events pass the sender's display name as `phone` (notifications
  // don't expose the number), so a sender with no digits must not match anyone.
  if (normalized.length < 4) {
    return {
      matchType: "none" as const,
      phone,
      patient: null,
      otherPatients: [],
      lead: null,
      otherLeads: [],
      recentAppointments: [],
      recentCalls: [],
    };
  }

  const patients = await prisma.patient.findMany({
    where: {
      OR: [
        { phone: { contains: normalized } },
        { phone: { contains: phone } },
        { emergencyPhone: { contains: normalized } },
      ],
      isActive: true,
    },
    select: {
      id: true, patientCode: true, firstName: true, lastName: true, phone: true,
      gender: true, dateOfBirth: true, email: true,
      assignedDoctor: { select: { id: true, name: true } },
      branch: { select: { id: true, name: true } },
      allergies: { select: { allergen: true } },
      tags: { select: { tag: true } },
    },
    take: 3,
  });

  const leads = await prisma.lead.findMany({
    where: {
      OR: [
        { phone: { contains: normalized } },
        { phone: { contains: phone } },
      ],
    },
    select: {
      id: true, name: true, phone: true, email: true, source: true, status: true,
      interest: true, notes: true, callbackDate: true,
      assignedTo: { select: { id: true, name: true } },
      branch: { select: { id: true, name: true } },
    },
    take: 3,
  });

  let recentAppointments: unknown[] = [];
  if (patients.length > 0) {
    recentAppointments = await prisma.appointment.findMany({
      where: { patientId: patients[0].id },
      select: { id: true, date: true, startTime: true, type: true, status: true, doctor: { select: { name: true } } },
      orderBy: { date: "desc" },
      take: 3,
    });
  }

  const recentCalls = await prisma.callLog.findMany({
    where: {
      OR: [
        ...(patients.length > 0 ? [{ patientId: patients[0].id }] : []),
        ...(leads.length > 0 ? [{ leadId: leads[0].id }] : []),
      ],
    },
    select: { id: true, type: true, outcome: true, notes: true, duration: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: 5,
  });

  const matchType = patients.length > 0 ? "patient" : leads.length > 0 ? "lead" : "none";

  return {
    matchType,
    phone,
    patient: patients[0] || null,
    otherPatients: patients.slice(1),
    lead: leads[0] || null,
    otherLeads: leads.slice(1),
    recentAppointments,
    recentCalls,
  };
}
