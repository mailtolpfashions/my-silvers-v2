/**
 * Adds a SECOND worldTiles band to the homepage, drawn in the staggered 2×2
 * arrangement rather than the full-width row.
 *
 *   npx tsx prisma/add-stagger-tiles.ts --verify   # resolve and print, write nothing
 *   npx tsx prisma/add-stagger-tiles.ts            # back up, then write the draft
 *
 * ── It does NOT touch the existing band ──────────────────────────────────────
 * The "Inspired by Love" row of four stays exactly as it is. This is an
 * additional section that happens to use the same kind with `layout: stagger`,
 * which is why the layout is a field on worldTiles rather than a second section
 * kind — see the note on that field in server/products/homepage-sections.ts.
 * The script refuses to touch any existing worldTiles section that is not
 * already staggered, so re-running it can never flatten or re-point the row.
 *
 * ── This writes a DRAFT and never publishes ──────────────────────────────────
 * Same rule as the other authoring scripts: publishing is a server action that
 * also calls revalidateTag(), so writing publishedData from here would change
 * the database while Next carried on serving the old homepage from cache. This
 * fills the working draft only; Publish in /cms is what invalidates the cache.
 *
 * ── The copy is PLACEHOLDER ──────────────────────────────────────────────────
 * "Made for the occasion" and its subtitle are stand-ins so the arrangement can
 * be judged with real photographs in it. They are not authored marketing copy
 * and make no claim about the business. The tile labels and links are real —
 * pulled from active categories, so every card goes somewhere.
 *
 * Idempotent: an existing staggered band is REPLACED in place.
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

/**
 * Exactly four. The stagger is four tiles in two columns with offset seams —
 * see STAGGER_PLACEMENT in homepage-section.tsx, which is index-aligned with
 * this count. Any other number falls back to the plain row at render time.
 */
const TILE_COUNT = 4;

async function main() {
  const homepage = await prisma.contentEntry.findFirst({
    where: { contentType: { name: "homepage" } },
  });
  if (!homepage) throw new Error("No homepage entry found. Run `npm run db:seed` first.");

  const current = (homepage.data ?? homepage.publishedData ?? {}) as Json;
  const sections = Array.isArray(current.sections) ? ([...current.sections] as Json[]) : [];

  // ── The artwork ───────────────────────────────────────────────────────────
  // Skips the four the existing row already uses where it can, so the two bands
  // are not the same four photographs shown twice on one page. Falls back to
  // reusing them if the catalogue has no others — a repeated picture is better
  // than an empty frame.
  const existingRow = sections.find(
    (s) => s?.type === "worldTiles" && s?.layout !== "stagger"
  );
  const taken = new Set(
    (Array.isArray(existingRow?.items) ? (existingRow.items as Json[]) : [])
      .map((it) => String(it.image ?? ""))
      .filter(Boolean)
  );

  const all = await prisma.category.findMany({
    where: { isActive: true, image: { not: null } },
    select: { name: true, slug: true, image: true },
    orderBy: { name: "asc" },
  });

  // Unused artwork first, then top up from the rest — rather than falling back
  // to `all` wholesale, which re-picked the same four the row already had and
  // put the identical photographs on the page twice.
  const fresh = all.filter((c) => !taken.has(c.image ?? ""));
  const reused = all.filter((c) => taken.has(c.image ?? ""));
  const chosen = [...fresh, ...reused].slice(0, TILE_COUNT);

  if (chosen.length === 0) {
    throw new Error(
      "No active categories have images, so every tile would render an empty frame. " +
        "Seed the sample photography first: npx tsx prisma/seed-sample-photography.ts"
    );
  }
  if (chosen.length < TILE_COUNT) {
    console.warn(
      `⚠️  Only ${chosen.length} categories have artwork; the stagger needs ${TILE_COUNT}. ` +
        `The renderer will fall back to a plain row until a fourth exists.`
    );
  }
  if (fresh.length < TILE_COUNT) {
    console.warn(
      `⚠️  Fewer than ${TILE_COUNT} categories are unused by the existing row, so this ` +
        `band reuses some of the same photographs. Point them at different artwork in /cms.`
    );
  }

  const section: Json = {
    type: "worldTiles",
    layout: "stagger",
    // Placeholder — see the note at the top of this file.
    title: "Made for the occasion",
    eyebrow: "The world of MY Silvers",
    subtitle: "A companion for every occasion.",
    isActive: true,
    items: chosen.map((c) => ({
      image: c.image,
      title: c.name,
      href: `/category/${c.slug}`,
    })),
  };

  // ── Where it goes ─────────────────────────────────────────────────────────
  // After the LAST product grid, which puts it low on the page rather than
  // directly under the existing row of four — two doorway bands back to back
  // would read as the same section drawn twice. Found by scanning, not by a
  // fixed index: the running order has changed several times already.
  let insertAt = sections.length;
  for (const [i, s] of sections.entries()) {
    if (s?.type === "products") insertAt = i + 1;
  }

  const existingAt = sections.findIndex(
    (s) => s?.type === "worldTiles" && s?.layout === "stagger"
  );
  if (existingAt >= 0) {
    sections[existingAt] = section;
  } else {
    sections.splice(insertAt, 0, section);
  }

  const next: Json = { ...current, sections };

  // ── Report ────────────────────────────────────────────────────────────────
  console.log(
    `\n${existingAt >= 0 ? "Replacing" : "Inserting"} the staggered band at position ${
      existingAt >= 0 ? existingAt : insertAt
    } of ${sections.length}.\n`
  );
  for (const c of chosen) console.log(`  ${c.name.padEnd(14)} → /category/${c.slug}`);
  console.log("\nSection order is now:");
  for (const [i, s] of sections.entries()) {
    const mark = s === section ? " ←" : "";
    const layout = s.type === "worldTiles" ? ` [${String(s.layout ?? "row")}]` : "";
    console.log(
      `  ${String(i).padStart(2)}  ${String(s.type ?? "?").padEnd(15)}${layout.padEnd(11)} ${String(
        s.title ?? ""
      )}${mark}`
    );
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
    // `data` only — publishedData and status untouched, for the reason in the
    // header. See add-world-tiles.ts for the full note.
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
