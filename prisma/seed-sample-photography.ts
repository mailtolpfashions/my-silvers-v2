/**
 * Replaces the demo catalogue's placehold.co text images with real photography.
 *
 *   npx tsx prisma/seed-sample-photography.ts --dry-run   # search only, write nothing
 *   npx tsx prisma/seed-sample-photography.ts             # upload, assign, publish
 *
 * ── Why it uploads instead of hotlinking ─────────────────────────────────────
 * src/server/media/url-allowlist.ts only permits res.cloudinary.com (plus
 * placehold.co outside production). Pointing image fields at Pexels would be
 * rejected at write time, and widening that allowlist to load test data would
 * weaken a real control. So every photo is pulled into Cloudinary first and the
 * database only ever sees a Cloudinary URL — which also means this exercises the
 * production image path (AVIF, the q_90 tier, the responsive ladder) rather than
 * a host that bypasses it.
 *
 * Cloudinary fetches each photo from Pexels server-side, so nothing is
 * downloaded to this machine.
 *
 * ── These are SAMPLES, and they are not your jewellery ───────────────────────
 * Everything lands under `mysilvers/samples/`, one folder, so the whole set can
 * be found, audited and deleted in a single operation when real photography
 * arrives:
 *
 *   npx tsx prisma/seed-sample-photography.ts --purge
 *
 * A product card showing a photo of an item you do not sell is misleading to a
 * shopper, so this is for localhost and staging. Do not publish it to customers.
 *
 * Idempotent: an already-uploaded sample is reused rather than re-fetched.
 */
import { config } from "dotenv";
config();

import { v2 as cloudinary } from "cloudinary";
import { writeFileSync } from "node:fs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const DRY_RUN = process.argv.includes("--dry-run");
const PURGE = process.argv.includes("--purge");

const SAMPLE_FOLDER = "mysilvers/samples";
const PEXELS_KEY = process.env.PEXELS_API_KEY;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

type Json = Record<string, unknown>;
type Photo = { id: number; url: string; w: number; h: number; credit: string };

/**
 * One search per category, plus the mood queries the homepage needs.
 *
 * Portrait orientation for anything that fills a tile — the storefront crops to
 * 4:5 and 5:7, and a landscape source loses its subject to the crop.
 */
const CATEGORY_QUERIES: Record<string, string> = {
  Rings: "silver ring jewelry",
  Earrings: "silver earrings jewelry",
  Necklaces: "silver necklace jewelry",
  Bracelets: "silver bracelet jewelry",
  Anklets: "anklet jewelry",
  Pendants: "silver pendant necklace",
};

const MOOD_QUERIES: Record<string, string> = {
  hero: "silver jewelry elegant",
  bridal: "bridal jewelry",
  everyday: "minimal jewelry",
  office: "elegant woman jewelry",
  oxidised: "oxidised silver jewelry",
  story: "jewelry workshop craft",
};

// ── Pexels ────────────────────────────────────────────────────────────────────

async function search(query: string, perPage: number): Promise<Photo[]> {
  const url = new URL("https://api.pexels.com/v1/search");
  url.searchParams.set("query", query);
  url.searchParams.set("per_page", String(Math.min(perPage, 80)));
  // Portrait reads better in every tile the storefront has; see note above.
  url.searchParams.set("orientation", "portrait");

  const res = await fetch(url, { headers: { Authorization: PEXELS_KEY! } });
  if (!res.ok) {
    throw new Error(`Pexels ${res.status} for "${query}" — ${await res.text()}`);
  }
  const json = (await res.json()) as {
    photos: { id: number; width: number; height: number; photographer: string; src: { original: string } }[];
  };
  return json.photos.map((p) => ({
    id: p.id,
    url: p.src.original,
    w: p.width,
    h: p.height,
    credit: p.photographer,
  }));
}

// ── Cloudinary ────────────────────────────────────────────────────────────────

/** Existing sample public_ids, so a re-run costs no uploads and no API quota. */
async function existingSamples(): Promise<Set<string>> {
  const found = new Set<string>();
  let cursor: string | undefined;
  do {
    const res = await cloudinary.api.resources({
      type: "upload",
      prefix: SAMPLE_FOLDER,
      max_results: 500,
      next_cursor: cursor,
    });
    for (const r of res.resources) found.add(r.public_id);
    cursor = res.next_cursor;
  } while (cursor);
  return found;
}

/**
 * Cloudinary serialises context as `key=value|key=value`, so a value carrying
 * `=`, `|` or a newline is rejected outright with "Invalid encoding in context".
 * Photographer names are free text from a third party and do contain them, so
 * everything is stripped to plain ASCII and truncated before it goes near the
 * API. Metadata is a nicety here; losing an exotic character from a credit
 * matters far less than losing the upload.
 */
function safeContext(value: string): string {
  return value
    .replace(/[=|&,\r\n]/g, " ")
    .replace(/[^\x20-\x7E]/g, "")
    .trim()
    .slice(0, 80);
}

/**
 * Hands Cloudinary the Pexels URL and lets it do the fetching. `overwrite:false`
 * plus a deterministic public_id is what makes a second run a no-op.
 */
async function upload(photo: Photo, publicId: string): Promise<string> {
  const res = await cloudinary.uploader.upload(photo.url, {
    public_id: publicId,
    overwrite: false,
    resource_type: "image",
    // Cap the stored original. Pexels serves up to 6000px; nothing on the
    // storefront is delivered above 2048 (see deviceSizes in next.config.ts),
    // and storing the full size only burns quota.
    transformation: [{ width: 2048, height: 2048, crop: "limit", quality: "auto:good" }],
    context: {
      source: "pexels",
      pexels_id: String(photo.id),
      credit: safeContext(photo.credit),
    },
  });
  return res.secure_url as string;
}

async function purge() {
  console.log(`Deleting everything under ${SAMPLE_FOLDER}/ …`);
  const res = await cloudinary.api.delete_resources_by_prefix(SAMPLE_FOLDER);
  console.log("Deleted:", Object.keys(res.deleted ?? {}).length, "assets");
  console.log("\nNote: this removes the files but does NOT reset the database.");
  console.log("Re-run `npm run db:seed:demo` to put the placeholders back.");
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  if (PURGE) return purge();

  if (!PEXELS_KEY) {
    console.error(
      [
        "",
        "PEXELS_API_KEY is not set.",
        "",
        "  1. Get a free key at https://www.pexels.com/api/  (no card, 200 req/hour)",
        "  2. Add to .env:   PEXELS_API_KEY=your_key_here",
        "  3. Re-run this script",
        "",
      ].join("\n")
    );
    process.exitCode = 1;
    return;
  }

  const cached = DRY_RUN ? new Set<string>() : await existingSamples();
  console.log(`Cloudinary already holds ${cached.size} sample(s).\n`);

  // ── 1. Fetch ───────────────────────────────────────────────────────────────
  // 30 per category covers ~20 products each with room to vary; the mood slots
  // need only a handful.
  const pool: Record<string, Photo[]> = {};
  for (const [name, query] of Object.entries(CATEGORY_QUERIES)) {
    pool[name] = await search(query, 30);
    console.log(`  ${String(pool[name].length).padStart(2)} photos  ${name.padEnd(10)} "${query}"`);
  }
  for (const [slot, query] of Object.entries(MOOD_QUERIES)) {
    pool[`mood:${slot}`] = await search(query, 6);
    console.log(`  ${String(pool[`mood:${slot}`].length).padStart(2)} photos  ${slot.padEnd(10)} "${query}"`);
  }

  if (DRY_RUN) {
    console.log("\n--dry-run: nothing uploaded, nothing written.");
    return;
  }

  // ── 2. Upload ──────────────────────────────────────────────────────────────
  const urls: Record<string, string[]> = {};
  let uploaded = 0;
  let reused = 0;
  const failures: string[] = [];

  for (const [key, photos] of Object.entries(pool)) {
    urls[key] = [];
    for (const [i, photo] of photos.entries()) {
      const slug = key.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
      const publicId = `${SAMPLE_FOLDER}/${slug}-${i}`;
      if (cached.has(publicId)) {
        urls[key].push(cloudinary.url(publicId, { secure: true }));
        reused++;
        continue;
      }
      try {
        urls[key].push(await upload(photo, publicId));
        uploaded++;
        process.stdout.write(`\r  uploaded ${uploaded}…`);
      } catch (e) {
        // One unusable source photo must not cost the whole run. The pools are
        // deliberately larger than the slots that consume them, so a handful of
        // skips changes nothing downstream.
        failures.push(`${publicId}: ${(e as Error).message}`);
      }
    }
  }
  console.log(`\n  ${uploaded} uploaded, ${reused} reused, ${failures.length} skipped.`);
  if (failures.length) {
    console.log("  skipped:");
    failures.slice(0, 10).forEach((f) => console.log(`    ${f}`));
    if (failures.length > 10) console.log(`    …and ${failures.length - 10} more`);
  }
  console.log();

  // A category whose entire pool failed would silently leave its products on
  // placeholders, so say so rather than reporting a clean run.
  for (const name of Object.keys(CATEGORY_QUERIES)) {
    if (!urls[name]?.length) console.log(`  ⚠  no usable photos for ${name}`);
  }

  // ── 3. Categories ──────────────────────────────────────────────────────────
  const categories = await prisma.category.findMany({ select: { id: true, name: true } });
  for (const cat of categories) {
    const pick = urls[cat.name]?.[0];
    if (!pick) {
      console.log(`  skip category ${cat.name} — no photo found`);
      continue;
    }
    await prisma.category.update({ where: { id: cat.id }, data: { image: pick } });
    console.log(`  category  ${cat.name}`);
  }

  // ── 4. Products ────────────────────────────────────────────────────────────
  // Only placeholder-backed products are touched, so the one real photo already
  // in the catalogue (Elegant Pink Bracelet) is left exactly as it is.
  const products = await prisma.product.findMany({
    select: { id: true, name: true, images: true, category: { select: { name: true } } },
  });

  let touched = 0;
  const perCategoryCursor: Record<string, number> = {};

  for (const p of products) {
    const isPlaceholder = p.images.length === 0 || p.images.every((u) => u.includes("placehold.co"));
    if (!isPlaceholder) continue;

    const catName = p.category?.name ?? "Rings";
    const options = urls[catName]?.length ? urls[catName] : urls["Rings"];
    if (!options?.length) continue;

    // Round-robin within the category, so a grid of 20 rings is 20 different
    // photographs rather than the same one repeated.
    const n = perCategoryCursor[catName] ?? 0;
    perCategoryCursor[catName] = n + 1;

    // Two images per product: the card shot and one alternate for the gallery.
    const primary = options[n % options.length];
    const secondary = options[(n + 7) % options.length];

    await prisma.product.update({
      where: { id: p.id },
      data: { images: primary === secondary ? [primary] : [primary, secondary] },
    });
    touched++;
  }
  console.log(`  products  ${touched} updated\n`);

  // ── 5. CMS entries ─────────────────────────────────────────────────────────
  /**
   * Every image-bearing key the CMS uses, across every content type. An earlier
   * version walked only homepage.sections and looked for `image`, which left the
   * hero carousel (homepage.slides[].media) on placeholders — the single most
   * visible image on the site. Matching on the key name at any depth means a new
   * section shape does not silently reintroduce that.
   */
  const IMAGE_KEYS = new Set([
    "image",
    "media",
    "heroImage",
    "thumbnailImage",
    "coverImage",
    "backgroundImage",
    "storyImage",
  ]);

  /**
   * Slug/title hints → the mood pool that suits them, so the bridal collection
   * gets bridal photography rather than whatever came next in the queue. Falls
   * back to a round-robin over everything when nothing matches.
   */
  const MOOD_HINTS: [RegExp, string][] = [
    [/bridal|wedding/i, "mood:bridal"],
    [/everyday|daily|minimal/i, "mood:everyday"],
    [/office|work|quiet/i, "mood:office"],
    [/oxidis|oxidiz|antique/i, "mood:oxidised"],
    [/story|studio|craft|care|guide|hallmark/i, "mood:story"],
    [/ring/i, "Rings"],
    [/earring/i, "Earrings"],
    [/necklace/i, "Necklaces"],
    [/bracelet/i, "Bracelets"],
    [/anklet/i, "Anklets"],
    [/pendant/i, "Pendants"],
  ];

  const fallbackPool = [
    ...(urls["mood:hero"] ?? []),
    ...(urls["mood:everyday"] ?? []),
    ...(urls["mood:bridal"] ?? []),
    ...(urls["mood:office"] ?? []),
    ...(urls["mood:oxidised"] ?? []),
    ...(urls["mood:story"] ?? []),
  ].filter(Boolean);

  let fallbackIndex = 0;

  /** Picks a photo for one field, preferring a pool the entry's own text implies. */
  function pickFor(hintText: string): string | undefined {
    for (const [re, key] of MOOD_HINTS) {
      if (re.test(hintText) && urls[key]?.length) {
        // Rotate within the matched pool so two bridal fields differ.
        return urls[key][fallbackIndex++ % urls[key].length];
      }
    }
    if (!fallbackPool.length) return undefined;
    return fallbackPool[fallbackIndex++ % fallbackPool.length];
  }

  function swapPlaceholders(node: unknown, hint: string): unknown {
    if (Array.isArray(node)) return node.map((v) => swapPlaceholders(v, hint));
    if (node && typeof node === "object") {
      const src = node as Json;
      // Local hint wins: a slide with its own title should draw on that rather
      // than on the entry's title.
      const localHint =
        [src.title, src.slug, src.name, src.heading, src.eyebrow]
          .filter((v) => typeof v === "string")
          .join(" ") || hint;
      const out: Json = {};
      for (const [k, v] of Object.entries(src)) {
        if (IMAGE_KEYS.has(k) && typeof v === "string" && v.includes("placehold.co")) {
          out[k] = pickFor(localHint) ?? v;
        } else {
          out[k] = swapPlaceholders(v, localHint);
        }
      }
      return out;
    }
    return node;
  }

  const entries = await prisma.contentEntry.findMany({
    select: {
      id: true,
      data: true,
      publishedData: true,
      contentType: { select: { name: true } },
    },
  });

  const backup = `prisma/backup-homepage-${Date.now()}.json`;
  writeFileSync(backup, JSON.stringify(entries, null, 2));
  console.log(`  backup    ${backup}  (all ${entries.length} CMS entries)`);

  const perType: Record<string, number> = {};

  for (const entry of entries) {
    const hint = JSON.stringify(
      (entry.data as Json)?.title ?? (entry.data as Json)?.slug ?? entry.contentType.name
    );
    const nextDraft = swapPlaceholders(entry.data, hint) as Json;
    const nextPublished = entry.publishedData
      ? (swapPlaceholders(entry.publishedData, hint) as Json)
      : null;

    const changed =
      JSON.stringify(nextDraft) !== JSON.stringify(entry.data) ||
      JSON.stringify(nextPublished) !== JSON.stringify(entry.publishedData);
    if (!changed) continue;

    await prisma.contentEntry.update({
      where: { id: entry.id },
      // Draft AND published, per the explicit request to auto-publish. See the
      // caveat printed below: this bypasses revalidateTag().
      data: {
        data: nextDraft as never,
        ...(nextPublished
          ? { publishedData: nextPublished as never, publishedAt: new Date() }
          : {}),
      },
    });
    perType[entry.contentType.name] = (perType[entry.contentType.name] ?? 0) + 1;
  }

  console.log("  cms entries updated:");
  Object.entries(perType)
    .sort((a, b) => b[1] - a[1])
    .forEach(([t, n]) => console.log(`    ${String(n).padStart(3)}  ${t}`));
  console.log();

  console.log("Done.\n");
  console.log("⚠  Published straight from a script, so Next's cache was NOT invalidated.");
  console.log("   Restart the dev server (Ctrl+C, `npm run dev`) to see the change.");
  console.log("   In production, publish from /cms/content/homepage instead.\n");
  console.log("⚠  These are stock photos, not your jewellery. Do not ship to customers.");
  console.log("   Remove with: npx tsx prisma/seed-sample-photography.ts --purge");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
