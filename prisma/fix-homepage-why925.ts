/**
 * Two homepage repairs, written to the DRAFT only.
 *
 *   npx tsx prisma/fix-homepage-why925.ts --verify   # print what would change
 *   npx tsx prisma/fix-homepage-why925.ts            # back up, write the draft
 *
 * 1. "Why 925" (the `usp` section) had no rows. A section with nothing to show
 *    resolves to null and is dropped, so it never appeared on the site. This
 *    fills it with four rows — two restating claims the homepage already makes
 *    (hallmarked 925, finished by hand: see the story section), and two marked
 *    "Sample —" for delivery and returns. Those two are deliberately vague:
 *    the returns window is an unresolved business decision (see
 *    product-assurances.tsx) and is not a script's to invent. Rewrite them in
 *    the CMS before publishing.
 *
 * 2. "Bestsellers" pointed its "View all" at /products?sort=featured, which
 *    lists FEATURED pieces first — a different flag. It now points at the new
 *    sort=bestseller.
 *
 * Draft only, never publishedData: publishing goes through the server action so
 * the cache is revalidated. Open CMS → Homepage, check, and press Publish.
 *
 * Idempotent: a usp section that already has rows is left alone, and the link
 * is only changed while it still holds the old value.
 */
import { config } from "dotenv";
config();

import { writeFileSync } from "node:fs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
  }),
});

const VERIFY_ONLY = process.argv.includes("--verify");

type Json = Record<string, unknown>;

const USP_ROWS = [
  {
    icon: "shield-check",
    title: "Hallmarked 925 silver",
    text: "Every piece is sterling silver, hallmarked before it is shaped.",
  },
  {
    icon: "sparkles",
    title: "Finished by hand",
    text: "Polished by craftspeople, not by a machine.",
  },
  {
    icon: "truck",
    title: "Delivery",
    text: "Sample — state your delivery promise here before launch.",
  },
  {
    icon: "rotate-ccw",
    title: "Returns",
    text: "Sample — state your returns window here before launch.",
  },
];

async function main() {
  const homepage = await prisma.contentEntry.findFirst({
    where: { contentType: { name: "homepage" } },
  });
  if (!homepage) throw new Error("No homepage entry found.");

  const draft = (homepage.data ?? {}) as Json;
  const sections = Array.isArray(draft.sections) ? (draft.sections as Json[]) : [];
  const changes: string[] = [];

  const nextSections = sections.map((s, i) => {
    if (s.type === "usp" && (!Array.isArray(s.items) || s.items.length === 0)) {
      changes.push(`#${i + 1} usp "${s.title ?? ""}": added ${USP_ROWS.length} rows`);
      return { ...s, items: USP_ROWS };
    }
    if (
      s.type === "products" &&
      s.source === "bestseller" &&
      s.viewAllHref === "/products?sort=featured"
    ) {
      changes.push(`#${i + 1} products "${s.title ?? ""}": View all → /products?sort=bestseller`);
      return { ...s, viewAllHref: "/products?sort=bestseller" };
    }
    return s;
  });

  if (changes.length === 0) {
    console.log("Nothing to change — the draft is already fixed.");
    return;
  }
  console.log(changes.map((c) => `  ${c}`).join("\n"));

  if (VERIFY_ONLY) {
    console.log("\n--verify: nothing written.");
    return;
  }

  const backupPath = `prisma/backup-homepage-${Date.now()}.json`;
  writeFileSync(
    backupPath,
    JSON.stringify({ data: homepage.data, publishedData: homepage.publishedData }, null, 2)
  );

  await prisma.contentEntry.update({
    where: { id: homepage.id },
    data: { data: { ...draft, sections: nextSections } as never },
  });
  console.log(`\nHomepage DRAFT written. Backup: ${backupPath}`);
  console.log("Open CMS → Homepage, rewrite the two 'Sample —' rows, then Publish.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
