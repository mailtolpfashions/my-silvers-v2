#!/usr/bin/env node
/**
 * DEV DATABASE ONLY — swaps media that no longer exists for placeholders.
 *
 *   node scripts/dev-replace-missing-media.mjs          (dry run: counts only)
 *   node scripts/dev-replace-missing-media.mjs --apply  (writes)
 *
 * Why it exists. In Nov 2026 every demo asset in the shared Cloudinary account
 * (`mysilvers/samples`, the dev `mysilvers/products`, the dev hero video) had
 * been deleted, while the dev database still pointed at them: 182/182 product
 * images and 35/35 Studio media 404'd. The live shop was untouched (all 253
 * live media load). Re-uploading demo photos into the account the LIVE shop
 * uses would undo whatever cleanup removed them, so this points dev at
 * placehold.co instead — the host the demo seed already uses
 * (prisma/seed-demo.ts), which local builds allow (ALLOW_PLACEHOLDER_IMAGES=1
 * in .env; never set on the live project).
 *
 * Only URLs that answer 4xx are replaced. Anything that still loads, and
 * anything not on Cloudinary, is left exactly as it is.
 *
 * Covers: Product.images, Category.image, ContentEntry.data / publishedData /
 * seoOgImage, ContentEntryVersion.data. Refuses any database but dev, and
 * never prints a connection string.
 */
import { config } from "dotenv";
import pg from "pg";

config({ quiet: true });
const DEV_PROJECT_REF = "skyifgumokdwcgwjupvr";
const APPLY = process.argv.includes("--apply");

if (!(process.env.DATABASE_URL ?? "").includes(DEV_PROJECT_REF)) {
  console.error("Refusing: .env does not point at the DEV database.");
  process.exit(2);
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
const CLOUDINARY = /https:\/\/res\.cloudinary\.com\/[^"'\\\s)]+/g;
const status = new Map();

async function isMissing(url) {
  if (!status.has(url)) {
    status.set(
      url,
      fetch(url, { method: "HEAD" }).then(
        (r) => r.status >= 400 && r.status < 500,
        () => false // network trouble is not proof of absence — leave it alone
      )
    );
  }
  return status.get(url);
}

const PALETTE = ["E9E4DC", "DDE3E6", "E6DDE3", "E0E6DD", "ECE6D6"];
const bgFor = (s) => PALETTE[[...s].reduce((a, c) => a + c.charCodeAt(0), 0) % PALETTE.length];
// `.png` is required: placehold.co serves SVG by default, and next/image rejects SVG.
const placeholder = (size, label) =>
  `https://placehold.co/${size}/${bgFor(label)}/0C0C0E.png?text=${encodeURIComponent(label.slice(0, 28))}`;

/** A readable label from a Cloudinary path: ".../samples/mood-oxidised-3?..." → "mood oxidised". */
const labelFrom = (url) =>
  (url.split("/").pop() ?? "image").split(/[?.]/)[0].replace(/[-_]\d+$/, "").replace(/[-_]/g, " ") || "image";

/** Replace every missing Cloudinary URL inside a JSON/text blob. */
async function fixText(text) {
  if (!text) return { text, n: 0 };
  let out = text;
  let n = 0;
  for (const url of new Set(text.match(CLOUDINARY) ?? [])) {
    if (!(await isMissing(url))) continue;
    // Videos become a still: the hero renders an image for any non-video URL.
    const size = /\.(mp4|webm|mov)(\?|$)|\/video\/upload\//i.test(url) ? "1920x1080" : "1600x1000";
    out = out.split(url).join(placeholder(size, labelFrom(url)));
    n++;
  }
  return { text: out, n };
}

let changedRows = 0;
let changedUrls = 0;

// Products
const { rows: products } = await pool.query(`SELECT "id", "name", "images" FROM "Product"`);
for (const p of products) {
  let n = 0;
  const images = [];
  for (const [i, url] of p.images.entries()) {
    if (url.startsWith("https://res.cloudinary.com/") && (await isMissing(url))) {
      images.push(placeholder("900x900", i === 0 ? p.name : `${p.name} ${i + 1}`));
      n++;
    } else images.push(url);
  }
  if (!n) continue;
  changedRows++;
  changedUrls += n;
  if (APPLY) await pool.query(`UPDATE "Product" SET "images" = $2 WHERE "id" = $1`, [p.id, images]);
}

// Categories
const { rows: cats } = await pool.query(`SELECT "id", "name", "image" FROM "Category" WHERE "image" IS NOT NULL`);
for (const c of cats) {
  if (!c.image.startsWith("https://res.cloudinary.com/") || !(await isMissing(c.image))) continue;
  changedRows++;
  changedUrls++;
  if (APPLY) await pool.query(`UPDATE "Category" SET "image" = $2 WHERE "id" = $1`, [c.id, placeholder("1200x1200", c.name)]);
}

// Studio entries (draft, published snapshot, OG image) and their version history
const { rows: entries } = await pool.query(
  `SELECT "id", "data"::text d, "publishedData"::text pd, "seoOgImage" og FROM "ContentEntry"`
);
for (const e of entries) {
  const d = await fixText(e.d);
  const pd = await fixText(e.pd);
  const og = await fixText(e.og);
  const n = d.n + pd.n + og.n;
  if (!n) continue;
  changedRows++;
  changedUrls += n;
  if (APPLY)
    await pool.query(
      `UPDATE "ContentEntry" SET "data" = $2::jsonb, "publishedData" = $3::jsonb, "seoOgImage" = $4 WHERE "id" = $1`,
      [e.id, d.text, pd.text, og.text]
    );
}
const { rows: versions } = await pool.query(`SELECT "id", "data"::text d FROM "ContentEntryVersion"`);
for (const v of versions) {
  const d = await fixText(v.d);
  if (!d.n) continue;
  changedRows++;
  changedUrls += d.n;
  if (APPLY) await pool.query(`UPDATE "ContentEntryVersion" SET "data" = $2::jsonb WHERE "id" = $1`, [v.id, d.text]);
}

console.log(
  `${APPLY ? "Replaced" : "Would replace"} ${changedUrls} missing media URL(s) across ${changedRows} row(s).` +
    (APPLY ? "" : " Re-run with --apply to write.")
);
await pool.end();
