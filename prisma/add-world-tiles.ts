/**
 * Adds the "Inspired by Love" worldTiles band to the homepage.
 *
 *   npx tsx prisma/add-world-tiles.ts --verify   # resolve and print, write nothing
 *   npx tsx prisma/add-world-tiles.ts            # back up, then write the draft
 *
 * ── This writes a DRAFT and never publishes ──────────────────────────────────
 * Same rule as author-homepage-redesign.ts, and for the same reason: publishing
 * is a server action that also calls revalidateTag(), so writing publishedData
 * from a script would change the database while Next carried on serving the old
 * homepage from cache, with nothing to indicate that had happened. This fills
 * the working draft only. The band is visible immediately in the CMS live
 * preview at /cms/content/homepage; clicking Publish there is what puts it on
 * the storefront, and that is the path that invalidates the cache correctly.
 *
 * ── The copy here is PLACEHOLDER ─────────────────────────────────────────────
 * "Inspired by Love" and its subtitle are stand-ins so the layout can be judged
 * with real photographs in it — they are not authored marketing copy and make
 * no claim about the business. The tile labels and links, by contrast, are real:
 * they are pulled from active categories, so every card goes somewhere.
 * Overwrite all of it in the CMS once the shape is agreed.
 *
 * Idempotent: an existing worldTiles section is REPLACED in place rather than a
 * second one appended, so running this twice produces the same draft.
 */
import { config } from "dotenv";
config();

import { writeFileSync } from "node:fs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const VERIFY_ONLY = process.argv.includes("--verify");

type Json = Record<string, unknown>;

/** How many tiles the band is drawn for. Two columns of two. */
const TILE_COUNT = 4;

async function main() {
  const homepage = await prisma.contentEntry.findFirst({
    where: { contentType: { name: "homepage" } },
  });
  if (!homepage) throw new Error("No homepage entry found. Run `npm run db:seed` first.");

  // Work from the draft when there is one, so this composes with any other
  // unpublished edits rather than silently reverting them.
  const current = (homepage.data ?? homepage.publishedData ?? {}) as Json;
  const sections = Array.isArray(current.sections) ? ([...current.sections] as Json[]) : [];

  // ── The artwork ───────────────────────────────────────────────────────────
  // Categories, because they are the only content in this database guaranteed
  // to have both a photograph and a real destination. Collections would do as
  // well but not all of them carry their own image.
  const categories = await prisma.category.findMany({
    where: { isActive: true, image: { not: null } },
    select: { name: true, slug: true, image: true },
    orderBy: { name: "asc" },
    take: TILE_COUNT,
  });

  if (categories.length === 0) {
    throw new Error(
      "No active categories have images, so every tile would render an empty frame. " +
        "Seed the sample photography first: npx tsx prisma/seed-sample-photography.ts"
    );
  }
  if (categories.length < TILE_COUNT) {
    console.warn(
      `⚠️  Only ${categories.length} categories have artwork; the band wants ${TILE_COUNT}. ` +
        `It will render ${categories.length} tiles — the stagger still works, but the ` +
        `two columns will not be the same height.`
    );
  }

  const section: Json = {
    type: "worldTiles",
    // Placeholder copy — see the note at the top of this file.
    title: "Inspired by Love",
    eyebrow: "The edit",
    subtitle: "Four ways to say it in silver.",
    isActive: true,
    items: categories.map((c) => ({
      image: c.image,
      // Read as the word laid over the photograph.
      title: c.name,
      href: `/category/${c.slug}`,
    })),
  };

  // ── Where it goes ─────────────────────────────────────────────────────────
  // After the LAST leading section that opted into the pinned reveal, never
  // before or among them. The shutter chain is leading and contiguous — it
  // starts at index 0 and stops dead at the first section that has not opted
  // in — so dropping a non-pinned band into that run would silently truncate
  // the chain and cost the homepage its hero reveal. Landing directly after it
  // keeps the band high on the page, which is where it is worth looking at,
  // without touching the motion above it.
  let insertAt = 0;
  while (insertAt < sections.length && sections[insertAt]?.pinnedReveal === true) insertAt++;

  const existingAt = sections.findIndex((s) => s?.type === "worldTiles");
  if (existingAt >= 0) {
    sections[existingAt] = section;
  } else {
    sections.splice(insertAt, 0, section);
  }

  const next: Json = { ...current, sections };

  // ── Report ────────────────────────────────────────────────────────────────
  console.log(`\n${existingAt >= 0 ? "Replacing" : "Inserting"} the worldTiles band at position ${
    existingAt >= 0 ? existingAt : insertAt
  } of ${sections.length}:\n`);
  for (const [i, c] of categories.entries()) {
    // Which crop each tile takes, mirroring the (row + col) parity the renderer
    // uses — printed so the stagger can be checked without opening a browser.
    const col = i % 2;
    const row = Math.floor(i / 2);
    const tall = (row + col) % 2 === 1;
    console.log(
      `  ${(tall ? "7:5 tall " : "16:10     ").padEnd(10)} ${c.name.padEnd(16)} → /category/${c.slug}`
    );
  }
  console.log("\nSection order is now:");
  for (const [i, s] of sections.entries()) {
    const mark = s === section ? " ←" : "";
    console.log(`  ${String(i).padStart(2)}  ${String(s.type ?? "?").padEnd(16)}${
      s.pinnedReveal === true ? " (pinned)" : ""
    }${mark}`);
  }

  if (VERIFY_ONLY) {
    console.log("\n--verify: nothing written.");
    return;
  }

  const backupPath = `prisma/backup-homepage-${Date.now()}.json`;
  writeFileSync(backupPath, JSON.stringify(homepage, null, 2));
  console.log(`\nBacked up the existing entry to ${backupPath}`);

  await prisma.contentEntry.update({
    where: { id: homepage.id },
    /**
     * `data` only — publishedData AND status are both deliberately untouched.
     *
     * Status especially: getPublishedEntry() filters on `status: "published"`,
     * so flipping this entry to "draft" to signal "has unpublished changes"
     * would take the entire homepage off the storefront until someone pressed
     * Publish. The draft/published distinction here is carried by the two data
     * columns, not by the status.
     */
    // `as never` to satisfy Prisma's InputJsonValue, matching the cast
    // author-homepage-redesign.ts uses for the same write.
    data: { data: next as never },
  });

  console.log(
    "\n✅ Draft written. Open /cms/content/homepage to see it in the live preview,\n" +
      "   then click Publish to put it on the storefront."
  );
}

main()
  .catch((err) => {
    console.error("Failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
