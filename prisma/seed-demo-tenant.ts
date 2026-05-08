/**
 * Bootstrap a fresh demo tenant. Run on the server when standing up
 * a new demo deployment:
 *
 *   npx tsx prisma/seed-demo-tenant.ts \
 *     --slug=demo \
 *     --name="ScalaMedic Demo" \
 *     --hostname=demo.scalamatic.com \
 *     [--password=demo1234]
 *
 * Idempotent: if a tenant with the slug already exists it's reused
 * (and rebadged to isDemo=true if not already). Hostname row is
 * upserted. Then the seeder fills in users/patients/etc. via the
 * shared demo-seed library.
 *
 * The password defaults to "demo1234" — change with --password if
 * you want a non-public demo. All demo users (admin, doctors,
 * receptionists) share this password by design.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { seedDemoTenant } from "../src/lib/demo-seed";

function arg(name: string, fallback?: string): string | undefined {
  const found = process.argv.find((a) => a.startsWith(`--${name}=`));
  return found ? found.slice(name.length + 3) : fallback;
}

async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });

  const slug = arg("slug", "demo")!;
  const name = arg("name", "ScalaMedic Demo")!;
  const hostname = arg("hostname");
  const password = arg("password", "demo1234")!;

  console.log(`▶ Provisioning demo tenant: slug="${slug}" name="${name}"`);

  const tenant = await prisma.tenant.upsert({
    where: { slug },
    update: { isDemo: true, name, isActive: true },
    create: {
      slug,
      name,
      isDemo: true,
      isActive: true,
      plan: "PRO",
      shortName: name.split(" ")[0] ?? "Demo",
      mfaIssuer: "ScalaMedic Demo",
      poweredByLine: "Powered by ScalaMedic",
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
  const summary = await seedDemoTenant({ tenantId: tenant.id, password });

  console.log("✓ Demo tenant ready:");
  console.log(JSON.stringify(summary, null, 2));
  console.log("\nLogin:");
  console.log(`  email:    admin@demo.scalamedic.com`);
  console.log(`  password: ${password}`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
