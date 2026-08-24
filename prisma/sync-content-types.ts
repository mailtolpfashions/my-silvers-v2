/**
 * Pushes the content-type FIELD DEFINITIONS to a database, and nothing else.
 *
 *   npx tsx prisma/sync-content-types.ts --verify   # print the diff, write nothing
 *   npx tsx prisma/sync-content-types.ts            # upsert the definitions
 *
 * ── Why this is not just `npm run db:seed` ──────────────────────────────────
 * The seed also creates a default homepage entry, an admin user and the sample
 * catalogue. Changing one field's label should not run any of that. This is the
 * narrow version: the same upsert `seedContentTypes()` performs, on its own.
 *
 * ⚠️  Definitions only — this never touches ContentEntry, so no authored
 * content is at risk. A field REMOVED from a type still leaves its values in
 * every entry's JSON; they are simply no longer rendered by the CMS form. That
 * is deliberate, and it is what makes a definition change reversible.
 */
import { config } from "dotenv";
config();

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { systemContentTypes } from "./content-types";

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
  }),
});

const VERIFY_ONLY = process.argv.includes("--verify");

async function main() {
  for (const ct of systemContentTypes) {
    const existing = await prisma.contentType.findUnique({ where: { name: ct.name } });
    const changed =
      !existing || JSON.stringify(existing.fields) !== JSON.stringify(ct.fields);

    if (!changed) {
      console.log(`   ${ct.name}: unchanged`);
      continue;
    }

    if (VERIFY_ONLY) {
      console.log(`   ${ct.name}: WOULD ${existing ? "update" : "create"}`);
      continue;
    }

    await prisma.contentType.upsert({
      where: { name: ct.name },
      update: {
        label: ct.label,
        icon: ct.icon,
        isSingleton: ct.isSingleton,
        fields: ct.fields,
      },
      create: { ...ct, isSystem: true },
    });
    console.log(`✅ ${ct.name}: ${existing ? "updated" : "created"}`);
  }

  if (VERIFY_ONLY) console.log("\n--verify: nothing written.");
}

main()
  .catch((err) => {
    console.error("sync-content-types failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
