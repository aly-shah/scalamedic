/**
 * @system MediCore ERP — Reminder Generation
 * @route POST /api/cron/reminders — Generate notifications for upcoming events
 * Call this periodically (e.g., every hour via cron job or external trigger)
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

import { toClinicDay } from "@/lib/utils";
import { logger } from "@/lib/logger";
import { sendMessage, appointmentReminder } from "@/lib/messaging";
export async function POST() {
  try {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = toClinicDay(tomorrow);
    const todayStr = toClinicDay(now);

    let created = 0;
    let waSent = 0;
    let waFailed = 0;

    // 1. Appointment reminders (24h before)
    const upcomingAppts = await prisma.appointment.findMany({
      where: {
        date: new Date(tomorrowStr),
        status: { in: ["SCHEDULED", "CONFIRMED"] },
      },
      include: {
        // Pull phone for the WhatsApp blast — patients without a
        // phone fall back to internal-notification only.
        patient: { select: { id: true, firstName: true, lastName: true, phone: true } },
        doctor: { select: { id: true, name: true } },
      },
    });

    for (const appt of upcomingAppts) {
      // ── Outbound WhatsApp to patient (best-effort) ──
      // The sendMessage() abstraction picks the best channel:
      // Baileys when linked, Cloud API when configured, SMS fallback,
      // log-only otherwise. Failures are logged but don't block the
      // staff Notification — reception still sees who's coming.
      if (appt.patient.phone) {
        // De-dupe via CommunicationLog: don't WhatsApp the same patient
        // twice for the same appointment (cron may run hourly).
        const alreadySent = await prisma.communicationLog.findFirst({
          where: {
            patientId: appt.patient.id,
            type: "WHATSAPP",
            direction: "OUTBOUND",
            content: { contains: appt.appointmentCode },
            createdAt: { gte: new Date(todayStr) },
          },
          select: { id: true },
        });
        if (!alreadySent) {
          const msg = appointmentReminder(
            appt.patient.firstName,
            tomorrowStr,
            appt.startTime,
            appt.doctor.name,
          ) + `\n(Ref: ${appt.appointmentCode})`;
          const r = await sendMessage({ to: appt.patient.phone, message: msg, type: "whatsapp" });
          if (r.success) {
            waSent++;
            await prisma.communicationLog.create({
              data: {
                patientId: appt.patient.id,
                type: "WHATSAPP",
                direction: "OUTBOUND",
                subject: "Appointment reminder (24h)",
                content: msg,
                sentById: appt.doctorId, // attribute to the doctor; reception didn't trigger it
              },
            }).catch(() => { /* log fail, continue */ });
          } else {
            waFailed++;
            logger.error(`WA reminder failed for ${appt.appointmentCode}: ${r.error}`);
          }
        }
      }

      // ── Internal staff notification (existing behavior) ──
      const existing = await prisma.notification.findFirst({
        where: {
          userId: appt.doctorId,
          title: { contains: appt.appointmentCode },
          createdAt: { gte: new Date(todayStr) },
        },
      });
      if (!existing) {
        await prisma.notification.create({
          data: {
            userId: appt.doctorId,
            title: `Tomorrow: ${appt.patient.firstName} ${appt.patient.lastName}`,
            message: `${appt.type.replace("_", " ")} at ${appt.startTime} — ${appt.appointmentCode}`,
            type: "APPOINTMENT",
            link: `/calendar`,
          },
        });
        created++;
      }
    }

    // 2. Overdue follow-up reminders
    const overdueFollowUps = await prisma.followUp.findMany({
      where: {
        status: "PENDING",
        dueDate: { lt: now },
      },
      include: {
        patient: { select: { firstName: true, lastName: true } },
        doctor: { select: { id: true } },
      },
    });

    for (const fu of overdueFollowUps) {
      const existing = await prisma.notification.findFirst({
        where: {
          userId: fu.doctorId,
          title: { contains: "Follow-up overdue" },
          message: { contains: `${fu.patient.firstName}` },
          createdAt: { gte: new Date(todayStr) },
        },
      });
      if (!existing) {
        await prisma.notification.create({
          data: {
            userId: fu.doctorId,
            title: `Follow-up overdue: ${fu.patient.firstName} ${fu.patient.lastName}`,
            message: `${fu.reason} — was due ${toClinicDay(fu.dueDate)}`,
            type: "FOLLOW_UP",
            link: `/follow-ups`,
          },
        });
        created++;
      }
    }

    // 3. Package expiry reminders (expiring in 7 days)
    const expiryDate = new Date(now);
    expiryDate.setDate(expiryDate.getDate() + 7);
    const expiringPackages = await prisma.patientPackage.findMany({
      where: {
        status: "ACTIVE",
        expiryDate: { lte: expiryDate, gte: now },
      },
      include: {
        patient: { select: { firstName: true, lastName: true, assignedDoctorId: true } },
      },
    });

    for (const pkg of expiringPackages) {
      if (pkg.patient.assignedDoctorId) {
        const existing = await prisma.notification.findFirst({
          where: {
            userId: pkg.patient.assignedDoctorId,
            title: { contains: "Package expiring" },
            createdAt: { gte: new Date(todayStr) },
          },
        });
        if (!existing) {
          await prisma.notification.create({
            data: {
              userId: pkg.patient.assignedDoctorId,
              title: `Package expiring: ${pkg.patient.firstName} ${pkg.patient.lastName}`,
              message: `Expires on ${toClinicDay(pkg.expiryDate)}`,
              type: "SYSTEM",
              link: `/patients`,
            },
          });
          created++;
        }
      }
    }

    // 4. Lead callbacks due — alert the assigned agent so they ring
    //    the lead back. We only fire on callbacks within a 24h
    //    window (now → 24h ahead) so a callback set for next week
    //    doesn't spam the agent every cron tick. Closed-out leads
    //    (BOOKED / NOT_INTERESTED) are filtered out.
    const callbackWindowEnd = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const dueCallbacks = await prisma.lead.findMany({
      where: {
        callbackDate: { lte: callbackWindowEnd, not: null },
        status: { notIn: ["BOOKED", "NOT_INTERESTED"] },
      },
      include: {
        assignedTo: { select: { id: true, name: true } },
      },
    });

    for (const lead of dueCallbacks) {
      // De-dupe per (lead, day) — the cron runs hourly but the agent
      // only needs one ping per day per callback.
      const existing = await prisma.notification.findFirst({
        where: {
          userId: lead.assignedToId,
          title: { contains: `Callback: ${lead.name}` },
          createdAt: { gte: new Date(todayStr) },
        },
      });
      if (!existing) {
        const dueLabel = lead.callbackDate
          ? new Date(lead.callbackDate).toLocaleString("en-PK", {
              timeZone: "Asia/Karachi",
              month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: true,
            })
          : "soon";
        await prisma.notification.create({
          data: {
            userId: lead.assignedToId,
            title: `Callback: ${lead.name}`,
            message: `${lead.phone} — due ${dueLabel}${lead.interest ? ` · ${lead.interest}` : ""}`,
            type: "FOLLOW_UP",
            link: `/call-center`,
          },
        });
        created++;
      }
    }

    // 5. Overdue invoice reminders
    const overdueInvoices = await prisma.invoice.findMany({
      where: {
        status: { in: ["PENDING", "PARTIAL"] },
        dueDate: { lt: now },
      },
      include: {
        patient: { select: { firstName: true, lastName: true } },
        createdBy: { select: { id: true } },
      },
    });

    for (const inv of overdueInvoices) {
      const existing = await prisma.notification.findFirst({
        where: {
          userId: inv.createdById,
          title: { contains: inv.invoiceNumber },
          createdAt: { gte: new Date(todayStr) },
        },
      });
      if (!existing) {
        await prisma.notification.create({
          data: {
            userId: inv.createdById,
            title: `Invoice overdue: ${inv.invoiceNumber}`,
            message: `${inv.patient.firstName} ${inv.patient.lastName} — Rs ${Number(inv.balanceDue).toLocaleString()} due`,
            type: "BILLING",
            link: `/billing`,
          },
        });
        created++;

        // Also update invoice status to OVERDUE
        if (inv.status !== "OVERDUE") {
          await prisma.invoice.update({ where: { id: inv.id }, data: { status: "OVERDUE" } });
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: `Reminders processed. Staff notifications: ${created}. WhatsApp: ${waSent} sent${waFailed > 0 ? `, ${waFailed} failed` : ""}.`,
      data: {
        remindersCreated: created,
        whatsappSent: waSent,
        whatsappFailed: waFailed,
        appointmentReminders: upcomingAppts.length,
        overdueFollowUps: overdueFollowUps.length,
        expiringPackages: expiringPackages.length,
        leadCallbacks: dueCallbacks.length,
        overdueInvoices: overdueInvoices.length,
      },
    });
  } catch (error) {
    logger.api("POST", "/api/cron/reminders", error);
    return NextResponse.json({ success: false, error: "Failed to generate reminders" }, { status: 500 });
  }
}
