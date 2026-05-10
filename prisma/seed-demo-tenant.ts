/**
 * Bootstrap a fresh demo tenant. Run on the server when standing up
 * a new demo deployment:
 *
 *   npx tsx prisma/seed-demo-tenant.ts \
 *     --slug=demo \
 *     --name="ScalaMedic Demo" \
 *     --hostname=demo.scalamedic.com \
 *     [--region=PK|US] \
 *     [--password=demo1234]
 *
 * Idempotent: if a tenant with the slug already exists it's reused
 * (and rebadged to isDemo=true + the region's currency/locale/tax
 * scheme if those have drifted). Hostname row is upserted. Then the
 * seeder fills in users/patients/etc. via the shared demo-seed
 * library, using the region profile.
 *
 * Region defaults to PK (Pakistani names, PKR pricing, +92 phones).
 * Pass --region=US for the demo-us tenant: American names, USD
 * pricing, +1 phones, US payer panel, 0% medical / 8% cosmetic tax.
 *
 * The password defaults to "demo1234" — change with --password if
 * you want a non-public demo. All demo users (admin, doctors,
 * receptionists) share this password by design.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { seedDemoTenant, type DemoRegion } from "../src/lib/demo-seed";

function arg(name: string, fallback?: string): string | undefined {
  const found = process.argv.find((a) => a.startsWith(`--${name}=`));
  return found ? found.slice(name.length + 3) : fallback;
}

// Tenant fields per region — must match the table in
// src/lib/demo-seed.ts:profileFor(). Set on the tenant row at
// upsert-time, before seedDemoTenant even sees the tenant.
const REGION_TENANT_FIELDS: Record<DemoRegion, { currency: string; locale: string; taxScheme: "PK" | "US"; adminEmail: string }> = {
  PK: { currency: "PKR", locale: "en-PK", taxScheme: "PK", adminEmail: "admin@demo.scalamedic.com" },
  US: { currency: "USD", locale: "en-US", taxScheme: "US", adminEmail: "admin@demo-us.scalamedic.com" },
};

async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });

  const slug = arg("slug", "demo")!;
  const name = arg("name", "ScalaMedic Demo")!;
  const hostname = arg("hostname");
  const password = arg("password", "demo1234")!;
  const regionArg = (arg("region", "PK") || "PK").toUpperCase();
  if (regionArg !== "PK" && regionArg !== "US") {
    console.error(`✗ Unsupported --region=${regionArg}. Allowed: PK, US.`);
    process.exit(1);
  }
  const region = regionArg as DemoRegion;
  const regionFields = REGION_TENANT_FIELDS[region];

  console.log(`▶ Provisioning demo tenant: slug="${slug}" name="${name}" region=${region}`);

  const tenant = await prisma.tenant.upsert({
    where: { slug },
    update: {
      isDemo: true,
      name,
      isActive: true,
      currency: regionFields.currency,
      locale: regionFields.locale,
      taxScheme: regionFields.taxScheme,
    },
    create: {
      slug,
      name,
      isDemo: true,
      isActive: true,
      plan: "PRO",
      shortName: name.split(" ")[0] ?? "Demo",
      mfaIssuer: "ScalaMedic Demo",
      poweredByLine: "Powered by ScalaMedic",
      currency: regionFields.currency,
      locale: regionFields.locale,
      taxScheme: regionFields.taxScheme,
    },
  });

  if (hostname) {
    await prisma.tenantHostname.upsert({
      where: { hostname: hostname.toLowerCase() },
      update: { tenantId: tenant.id, isPrimary: true },
      create: { tenantId: tenant.id, hostname: hostname.toLowerCase(), isPrimary: true },
    });
    console.log(`  ✓ hostname ${hostname} → ${slug}`);
  }

  console.log("▶ Seeding demo data…");
  // Re-import via the application client so triggers + composite-key
  // logic stay in one place. (seedDemoTenant uses src/lib/prisma)
  const summary = await seedDemoTenant({ tenantId: tenant.id, password, region });

  console.log("✓ Demo tenant ready:");
  console.log(JSON.stringify(summary, null, 2));
  console.log("\nLogin:");
  console.log(`  email:    ${regionFields.adminEmail}`);
  console.log(`  password: ${password}`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
