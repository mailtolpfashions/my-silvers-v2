/**
 * Adds the "The complete collection" rail to the homepage, directly after the
 * existing "The collections" row.
 *
 *   npx tsx prisma/add-collection-spotlight.ts --verify   # print, write nothing
 *   npx tsx prisma/add-collection-spotlight.ts            # back up, write the draft
 *
 * ── It ADDS. It does not replace the collections row ─────────────────────────
 * The `collections` section stays exactly as it is. This is a different kind —
 * `collectionSpotlight` — and the two are meant to sit together: the row is a
 * static three-up of editorial tiles, this is a scrolling rail whose cards
 * carry product photography as well as the collection's artwork. The script
 * asserts the existing row is still present after the edit and refuses to write
 * if it is not.
 *
 * ── This writes a DRAFT and never publishes ──────────────────────────────────
 * Publishing is a server action that also calls revalidateTag(); writing
 * publishedData from here would change the database while Next served the old
 * homepage from cache. Publish in /cms is what invalidates it.
 *
 * Idempotent: an existing collectionSpotlight is REPLACED in place.
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

async function main() {
  const homepage = await prisma.contentEntry.findFirst({
    where: { contentType: { name: "homepage" } },
  });
  if (!homepage) throw new Error("No homepage entry found. Run `npm run db:seed` first.");

  const current = (homepage.data ?? homepage.publishedData ?? {}) as Json;
  const sections = Array.isArray(current.sections) ? ([...current.sections] as Json[]) : [];

  // ── What the rail will actually be able to show ───────────────────────────
  const entries = await prisma.contentEntry.findMany({
    where: { contentType: { name: "collection" }, status: "published" },
    select: { slug: true, publishedData: true },
  });

  const report: string[] = [];
  let withArt = 0;
  for (const e of entries) {
    const d = (e.publishedData ?? {}) as Json;
    const banner = d.heroImage ?? d.thumbnailImage;
    const tag = typeof d.productTag === "string" ? d.productTag.toLowerCase() : "";
    const count = tag
      ? await prisma.product.count({
          where: { isActive: true, stock: { gt: 0 }, tags: { has: tag } },
        })
      : 0;
    if (banner) withArt++;
    report.push(
      `  ${String(e.slug).padEnd(12)} banner=${banner ? "Y" : "n"} ` +
        `tag=${(tag || "-").padEnd(10)} products=${count}${
          tag ? "" : "   ← falls back to newest until this is published"
        }`
    );
  }

  if (withArt === 0) {
    throw new Error(
      "No published collection has a heroImage or thumbnailImage, so every card " +
        "would be an empty frame. Give the collections artwork in /cms first."
    );
  }

  const section: Json = {
    type: "collectionSpotlight",
    title: "The complete collection",
    eyebrow: "Explore",
    subtitle: "Every edit, and a look at what is inside it.",
    limit: 8,
    viewAllHref: "/collections",
    isActive: true,
  };

  // ── Where it goes ─────────────────────────────────────────────────────────
  // Immediately after the existing collections row, by identity rather than by
  // index — the running order has changed repeatedly and an index would land
  // this somewhere arbitrary the next time it does. Falls back to the end.
  const rowAt = sections.findIndex((s) => s?.type === "collections");
  const insertAt = rowAt >= 0 ? rowAt + 1 : sections.length;

  const existingAt = sections.findIndex((s) => s?.type === "collectionSpotlight");
  if (existingAt >= 0) {
    sections[existingAt] = section;
  } else {
    sections.splice(insertAt, 0, section);
  }

  // The whole point of this script is that it adds rather than replaces.
  if (rowAt >= 0 && !sections.some((s) => s?.type === "collections")) {
    throw new Error("Refusing to write: the existing collections row went missing.");
  }

  const next: Json = { ...current, sections };

  // ── Report ────────────────────────────────────────────────────────────────
  console.log("\nPublished collections the rail can draw from:");
  console.log(report.join("\n"));
  console.log(
    `\n${existingAt >= 0 ? "Replacing" : "Inserting"} the spotlight rail at position ${
      existingAt >= 0 ? existingAt : insertAt
    } of ${sections.length}.\n`
  );
  console.log("Section order is now:");
  for (const [i, s] of sections.entries()) {
    const mark = s === section ? " ←" : "";
    console.log(
      `  ${String(i).padStart(2)}  ${String(s.type ?? "?").padEnd(20)} ${String(
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
