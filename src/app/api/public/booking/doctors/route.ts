/**
 * @system ScalaMedic — Public booking: doctor list
 * @route GET /api/public/booking/doctors
 *
 * Anonymous endpoint backing the /book page's "choose your doctor"
 * step. Tenant is derived from the inbound Host header (no session)
 * via tenantIdForHostname() — the same path /api/tenant/current uses.
 *
 * Returns only safe-to-public fields: id, name, speciality, photo,
 * consultation fee, branch name. NEVER the doctor's email, phone,
 * licenseNumber, or any operational metadata that could be used to
 * identify the doctor's contact details directly.
 *
 * Rate limit: per-IP (anonymous), generous (200/hour) since a
 * patient browsing a few options is normal.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { tenantIdForHostname } from "@/lib/tenant";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

function clientIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

export async function GET(request: Request) {
  try {
    const ip = clientIp(request);
    const rl = checkRateLimit(ip, RATE_LIMITS.PUBLIC_BOOKING_READ);
    if (!rl.ok) {
      return NextResponse.json(
        { success: false, error: `Too many requests. Try again in ${Math.ceil(rl.retryAfter / 60)} min.` },
        { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
      );
    }

    const host = request.headers.get("host") || "";
    const tenantId = await tenantIdForHostname(host);
    if (!tenantId) {
      return NextResponse.json(
        { success: false, error: "Booking is not available on this hostname." },
        { status: 404 },
      );
    }

    const doctors = await prisma.user.findMany({
      where: {
        role: "DOCTOR",
        isActive: true,
        tenantId,
      },
      select: {
        id: true,
        name: true,
        speciality: true,
        avatar: true,
        consultationFee: true,
        branch: { select: { id: true, name: true } },
      },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({
      success: true,
      data: doctors.map((d) => ({
        id: d.id,
        name: d.name,
        speciality: d.speciality,
        avatar: d.avatar,
        consultationFee: d.consultationFee ? Number(d.consultationFee) : null,
        branchId: d.branch?.id ?? null,
        branchName: d.branch?.name ?? null,
      })),
    });
  } catch (error) {
    logger.api("GET", "/api/public/booking/doctors", error);
    return NextResponse.json(
      { success: false, error: "Failed to load doctors" },
      { status: 500 },
    );
  }
}
