/**
 * Updates all user passwords to bcrypt hashes so login works.
 * Run: npx tsx prisma/hash-passwords.ts
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";
import "dotenv/config";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  const hash = await bcrypt.hash("password", 12);
  console.log("Updating all user passwords to 'password'...");

  const users = await prisma.user.findMany();
  for (const user of users) {
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: hash },
    });
    console.log(`  Updated: ${user.email}`);
  }

  console.log(`\nDone! ${users.length} users updated.`);
  console.log("Login with any user email + password: 'password'");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
