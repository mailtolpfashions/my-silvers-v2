/**
 * Create an admin/editor user, or promote an existing one.
 *
 *   npm run admin:create -- you@example.com                 (random password, printed once)
 *   npm run admin:create -- you@example.com "YourPassw0rd"  (your own password)
 *   npm run admin:create -- you@example.com "" editor       (editor instead of admin)
 *
 * Safe to run against production — that is the point of it. Promoting an
 * existing user never touches their password.
 *
 * Note: passing a password as an argument leaves it in your shell history.
 * Prefer the random-password form, or set ADMIN_PASSWORD in the environment.
 */
import "dotenv/config";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const [emailArg, passwordArg, roleArg] = process.argv.slice(2);
const email = emailArg?.trim().toLowerCase();
const role = (roleArg ?? "admin") as "admin" | "editor";

if (!email || !email.includes("@")) {
  console.error("\nUsage: npm run admin:create -- <email> [password] [admin|editor]\n");
  process.exit(1);
}
if (role !== "admin" && role !== "editor") {
  console.error(`\nRole must be "admin" or "editor" — got "${role}".\n`);
  process.exit(1);
}

async function main() {
  const existing = await prisma.user.findUnique({ where: { email } });

  if (existing) {
    if (existing.role === role) {
      console.log(`\n${email} is already ${role} — nothing to do.\n`);
      return;
    }
    await prisma.user.update({ where: { email }, data: { role } });
    console.log(`\n✅ Promoted ${email}: ${existing.role} → ${role}`);
    console.log("   Password unchanged.");
    console.log("   They must sign out and back in — the role lives in the JWT.\n");
    return;
  }

  const password = passwordArg || process.env.ADMIN_PASSWORD || crypto.randomBytes(18).toString("base64url");
  const generated = !passwordArg && !process.env.ADMIN_PASSWORD;

  if (password.length < 8) {
    console.error("\nPassword must be at least 8 characters.\n");
    process.exit(1);
  }

  await prisma.user.create({
    data: { email, name: role === "admin" ? "Admin" : "Editor", passwordHash: await bcrypt.hash(password, 12), role },
  });

  console.log(`\n✅ ${role} created:`);
  console.log(`   Email:    ${email}`);
  if (generated) {
    console.log(`   Password: ${password}`);
    console.log("   (save this now — it is not recoverable)");
  } else {
    console.log("   Password: (the one you supplied)");
  }
  console.log("");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
