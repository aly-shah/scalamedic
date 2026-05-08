import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getCurrentTenant } from "@/lib/tenant";

export async function GET() {
  const session = await getSession();

  if (!session) {
    return NextResponse.json(
      { success: false, error: "Not authenticated" },
      { status: 401 }
    );
  }

  // Resolve the tenant alongside the user so the React shell can
  // hydrate brand assets without a second round-trip. Shape change
  // from `data: SessionUser` → `data: { user, tenant }`; all five
  // call sites updated in the same diff.
  const tenant = await getCurrentTenant();

  return NextResponse.json({
    success: true,
    data: { user: session.user, tenant },
  });
}
