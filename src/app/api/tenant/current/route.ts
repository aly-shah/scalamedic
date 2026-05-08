/**
 * @system MediCore ERP — Public tenant brand
 * @route GET /api/tenant/current
 *
 * Public (no auth) endpoint that returns the current tenant brand
 * so pre-auth surfaces (login page, signup page) can render the
 * clinic logo + name. Single-tenant deployments resolve to the only
 * active row; future hostname-based dispatch lands here too.
 *
 * The response only exposes brand-safe fields (no secrets) so
 * leaving it un-gated is fine.
 */
import { NextResponse } from "next/server";
import { getCurrentTenant } from "@/lib/tenant";
import { logger } from "@/lib/logger";

export async function GET() {
  try {
    // getCurrentTenant walks the full chain — session tenantId,
    // inbound Host header → tenant_hostnames lookup, then single-
    // tenant fallback. Until v59 the box only had nakhoda, so a
    // direct resolveSingleTenant() worked; once the demo tenant
    // was added the function returned platform defaults because
    // the resolver bailed on >1 active row.
    const tenant = await getCurrentTenant();
    return NextResponse.json({ success: true, data: tenant });
  } catch (error) {
    logger.api("GET", "/api/tenant/current", error);
    return NextResponse.json(
      { success: false, error: "Failed to resolve tenant" },
      { status: 500 },
    );
  }
}
