/**
 * @system MediCore ERP - Prescription Print View
 * @route GET /api/prescriptions/:id/print - Returns printable HTML prescription
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

import { CLINIC_TZ } from "@/lib/utils";
import { requireAuth } from "@/lib/require-auth";
import { logger } from "@/lib/logger";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if (auth.response) return auth.response;

    const { id } = await params;

    const prescription = await prisma.prescription.findUnique({
      where: { id },
      include: {
        items: true,
        patient: {
          select: {
            firstName: true, lastName: true, patientCode: true,
            phone: true, dateOfBirth: true, gender: true,
            allergies: { select: { allergen: true, severity: true } },
          },
        },
        doctor: { select: { name: true, speciality: true, licenseNumber: true } },
        appointment: { select: { appointmentCode: true, date: true } },
      },
    });

    if (!prescription) {
      return NextResponse.json({ success: false, error: "Prescription not found" }, { status: 404 });
    }

    const p = prescription.patient;
    const d = prescription.doctor;
    const dob = p.dateOfBirth ? new Date(p.dateOfBirth) : null;
    const age = dob ? Math.floor((Date.now() - dob.getTime()) / (365.25 * 24 * 60 * 60 * 1000)) : "—";
    const gender = p.gender === "MALE" ? "M" : p.gender === "FEMALE" ? "F" : "O";
    const allergies = p.allergies.map((a) => a.allergen).join(", ") || "None reported";
    const date = new Date(prescription.createdAt).toLocaleDateString("en-PK", { year: "numeric", month: "long", day: "numeric", timeZone: CLINIC_TZ });

    const itemsHtml = prescription.items.map((item, i) => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #e7e5e4;color:#44403c;font-size:14px;">${i + 1}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e7e5e4;font-weight:600;color:#1c1917;font-size:14px;">${item.medicineName}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e7e5e4;color:#44403c;font-size:14px;">${item.dosage || "—"}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e7e5e4;color:#44403c;font-size:14px;">${item.frequency || "—"}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e7e5e4;color:#44403c;font-size:14px;">${item.duration || "—"}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e7e5e4;color:#57534e;font-size:13px;">${item.route || "—"}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e7e5e4;color:#57534e;font-size:13px;font-style:italic;">${item.instructions || "—"}</td>
      </tr>
    `).join("");

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Prescription — ${p.firstName} ${p.lastName}</title>
  <style>
    @media print { body { margin: 0; } .no-print { display: none !important; } }
    body { font-family: 'Segoe UI', system-ui, sans-serif; color: #1c1917; margin: 0; padding: 0; background: #fff; }
  </style>
</head>
<body>
  <div style="max-width:800px;margin:0 auto;padding:32px 40px;">
    <!-- Header -->
    <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #0d9488;padding-bottom:16px;margin-bottom:24px;">
      <div>
        <h1 style="margin:0;font-size:24px;color:#0d9488;font-weight:700;">MediCore</h1>
        <p style="margin:4px 0 0;font-size:13px;color:#78716c;">Skincare & Dermatology Clinic</p>
      </div>
      <div style="text-align:right;">
        <p style="margin:0;font-size:20px;font-weight:700;color:#1c1917;">PRESCRIPTION</p>
        <p style="margin:4px 0 0;font-size:13px;color:#78716c;">Date: ${date}</p>
      </div>
    </div>

    <!-- Patient + Doctor Info -->
    <div style="display:flex;gap:24px;margin-bottom:24px;">
      <div style="flex:1;background:#fafaf9;border:1px solid #e7e5e4;border-radius:12px;padding:16px;">
        <p style="margin:0 0 4px;font-size:11px;color:#a8a29e;text-transform:uppercase;letter-spacing:1px;font-weight:600;">Patient</p>
        <p style="margin:0;font-size:16px;font-weight:700;color:#1c1917;">${p.firstName} ${p.lastName}</p>
        <p style="margin:4px 0 0;font-size:13px;color:#57534e;">${p.patientCode} &nbsp;|&nbsp; ${age}y / ${gender} &nbsp;|&nbsp; ${p.phone}</p>
        ${p.allergies.length > 0 ? `<p style="margin:8px 0 0;font-size:12px;color:#dc2626;font-weight:600;">Allergies: ${allergies}</p>` : ""}
      </div>
      <div style="flex:1;background:#fafaf9;border:1px solid #e7e5e4;border-radius:12px;padding:16px;">
        <p style="margin:0 0 4px;font-size:11px;color:#a8a29e;text-transform:uppercase;letter-spacing:1px;font-weight:600;">Prescriber</p>
        <p style="margin:0;font-size:16px;font-weight:700;color:#1c1917;">${d.name}</p>
        <p style="margin:4px 0 0;font-size:13px;color:#57534e;">${d.speciality || "General"}</p>
        ${d.licenseNumber ? `<p style="margin:4px 0 0;font-size:12px;color:#78716c;">License: ${d.licenseNumber}</p>` : ""}
      </div>
    </div>

    <!-- Rx Symbol -->
    <div style="margin-bottom:16px;">
      <span style="font-size:28px;font-weight:700;color:#0d9488;font-family:serif;">&#8478;</span>
    </div>

    <!-- Medications Table -->
    <table style="width:100%;border-collapse:collapse;border:1px solid #e7e5e4;border-radius:12px;overflow:hidden;">
      <thead>
        <tr style="background:#f5f5f4;">
          <th style="padding:10px 12px;text-align:left;font-size:11px;color:#78716c;text-transform:uppercase;letter-spacing:1px;font-weight:600;border-bottom:2px solid #e7e5e4;">#</th>
          <th style="padding:10px 12px;text-align:left;font-size:11px;color:#78716c;text-transform:uppercase;letter-spacing:1px;font-weight:600;border-bottom:2px solid #e7e5e4;">Medicine</th>
          <th style="padding:10px 12px;text-align:left;font-size:11px;color:#78716c;text-transform:uppercase;letter-spacing:1px;font-weight:600;border-bottom:2px solid #e7e5e4;">Dosage</th>
          <th style="padding:10px 12px;text-align:left;font-size:11px;color:#78716c;text-transform:uppercase;letter-spacing:1px;font-weight:600;border-bottom:2px solid #e7e5e4;">Frequency</th>
          <th style="padding:10px 12px;text-align:left;font-size:11px;color:#78716c;text-transform:uppercase;letter-spacing:1px;font-weight:600;border-bottom:2px solid #e7e5e4;">Duration</th>
          <th style="padding:10px 12px;text-align:left;font-size:11px;color:#78716c;text-transform:uppercase;letter-spacing:1px;font-weight:600;border-bottom:2px solid #e7e5e4;">Route</th>
          <th style="padding:10px 12px;text-align:left;font-size:11px;color:#78716c;text-transform:uppercase;letter-spacing:1px;font-weight:600;border-bottom:2px solid #e7e5e4;">Instructions</th>
        </tr>
      </thead>
      <tbody>${itemsHtml}</tbody>
    </table>

    ${prescription.notes ? `
    <div style="margin-top:20px;background:#fefce8;border:1px solid #fef08a;border-radius:12px;padding:14px 16px;">
      <p style="margin:0 0 4px;font-size:11px;color:#a16207;text-transform:uppercase;letter-spacing:1px;font-weight:600;">Notes</p>
      <p style="margin:0;font-size:14px;color:#854d0e;">${prescription.notes}</p>
    </div>` : ""}

    <!-- Signature -->
    <div style="margin-top:48px;display:flex;justify-content:flex-end;">
      <div style="text-align:center;min-width:200px;">
        <div style="border-bottom:1px solid #d6d3d1;margin-bottom:8px;height:40px;"></div>
        <p style="margin:0;font-size:14px;font-weight:600;color:#1c1917;">${d.name}</p>
        <p style="margin:2px 0 0;font-size:12px;color:#78716c;">${d.speciality || "Dermatologist"}</p>
        ${d.licenseNumber ? `<p style="margin:2px 0 0;font-size:11px;color:#a8a29e;">Lic. ${d.licenseNumber}</p>` : ""}
      </div>
    </div>

    <!-- Footer -->
    <div style="margin-top:32px;padding-top:16px;border-top:1px solid #e7e5e4;text-align:center;">
      <p style="margin:0;font-size:11px;color:#a8a29e;">This prescription is digitally generated by MediCore ERP. Valid for 30 days from date of issue.</p>
    </div>

    <!-- Print Button -->
    <div class="no-print" style="text-align:center;margin-top:24px;">
      <button onclick="window.print()" style="background:#0d9488;color:white;border:none;padding:12px 32px;border-radius:12px;font-size:14px;font-weight:600;cursor:pointer;">
        Print Prescription
      </button>
    </div>
  </div>
</body>
</html>`;

    return new NextResponse(html, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  } catch (error) {
    logger.api("GET", "/api/prescriptions/[id]/print", error);
    return NextResponse.json({ success: false, error: "Failed to generate prescription" }, { status: 500 });
  }
}
