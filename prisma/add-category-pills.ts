/**
 * Adds the round "shop by category" pill row to the homepage.
 *
 *   npx tsx prisma/add-category-pills.ts --verify   # resolve and print, write nothing
 *   npx tsx prisma/add-category-pills.ts            # back up, then write the draft
 *
 * ── Why this exists rather than just re-running author-homepage-redesign.ts ──
 * That script is the canonical running order and it carries this section too,
 * but it REBUILDS the sections array from its own list. Anything added since by
 * a companion script — the worldTiles band from add-world-tiles.ts, today — is
 * not in that list and would be silently dropped on the way past. So the same
 * split as add-world-tiles.ts: the authoring script owns the shape of a fresh
 * homepage, and a small script like this one makes a single additive change to
 * a homepage that already exists.
 *
 * ── This writes a DRAFT and never publishes ──────────────────────────────────
 * Publishing is a server action that also calls revalidateTag(), so writing
 * publishedData from a script would change the database while Next carried on
 * serving the old homepage from cache, with nothing to indicate that had
 * happened. This fills the working draft only. The row is visible immediately
 * in the CMS live preview at /cms/content/homepage; clicking Publish there is
 * what puts it on the storefront, and that is the path that invalidates the
 * cache correctly.
 *
 * Idempotent: an existing categoryPills section is REPLACED in place rather
 * than a second one appended, so running this twice produces the same draft.
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

/** Matches the `limit` the authoring script gives this section. */
const PILL_LIMIT = 6;

async function main() {
  const homepage = await prisma.contentEntry.findFirst({
    where: { contentType: { name: "homepage" } },
  });
  if (!homepage) throw new Error("No homepage entry found. Run `npm run db:seed` first.");

  // Work from the draft when there is one, so this composes with any other
  // unpublished edits rather than silently reverting them.
  const current = (homepage.data ?? homepage.publishedData ?? {}) as Json;
  const sections = Array.isArray(current.sections) ? ([...current.sections] as Json[]) : [];

  // The renderer drops any category without artwork, and returns nothing at all
  // when that leaves it empty — so check here, where it can be said out loud,
  // rather than letting the section quietly not appear after a Publish.
  const usable = await prisma.category.count({
    where: { isActive: true, image: { not: null } },
  });
  if (usable === 0) {
    throw new Error(
      "No active categories have images, so this section would render nothing. " +
        "Seed the sample photography first: npx tsx prisma/seed-sample-photography.ts"
    );
  }
  if (usable < PILL_LIMIT) {
    console.warn(
      `⚠️  Only ${usable} categories have artwork; the row is drawn for up to ${PILL_LIMIT}. ` +
        `It will render ${usable} pills, which still reads fine — the row is centred and wraps.`
    );
  }

  // No heading fields: the pills carry their own names, and a title over a row
  // of labelled circles says it twice. An editor can add one in the CMS.
  const section: Json = {
    type: "categoryPills",
    limit: PILL_LIMIT,
    isActive: true,
  };

  // ── Where it goes ─────────────────────────────────────────────────────────
  // Directly after the LAST product grid, which is what puts it between
  // Bestsellers and the journal on the current page. Found by scanning rather
  // than by a fixed index: the running order has already changed twice, and an
  // index would land this somewhere arbitrary the next time it does.
  //
  // Falls back to the end of the page if there is no product section at all,
  // which is a homepage this script has no opinion about.
  let insertAt = sections.length;
  for (const [i, s] of sections.entries()) {
    if (s?.type === "products") insertAt = i + 1;
  }

  const existingAt = sections.findIndex((s) => s?.type === "categoryPills");
  if (existingAt >= 0) {
    sections[existingAt] = section;
  } else {
    sections.splice(insertAt, 0, section);
  }

  const next: Json = { ...current, sections };

  // ── Report ────────────────────────────────────────────────────────────────
  console.log(
    `\n${existingAt >= 0 ? "Replacing" : "Inserting"} the categoryPills row at position ${
      existingAt >= 0 ? existingAt : insertAt
    } of ${sections.length}.`
  );
  console.log(`${usable} active categories have artwork; up to ${PILL_LIMIT} will be drawn.\n`);
  console.log("Section order is now:");
  for (const [i, s] of sections.entries()) {
    const mark = s === section ? " ←" : "";
    console.log(
      `  ${String(i).padStart(2)}  ${String(s.type ?? "?").padEnd(16)}${
        s.pinnedReveal === true ? " (pinned)" : ""
      }  ${String(s.title ?? "")}${mark}`
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
    /**
     * `data` only — publishedData AND status are both deliberately untouched.
     *
     * Status especially: getPublishedEntry() filters on `status: "published"`,
     * so flipping this entry to "draft" to signal "has unpublished changes"
     * would take the entire homepage off the storefront until someone pressed
     * Publish. The draft/published distinction here is carried by the two data
     * columns, not by the status.
     */
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
