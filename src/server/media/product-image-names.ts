import "server-only";
import { v2 as cloudinary } from "cloudinary";
import { prisma } from "@/server/db";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * Names and places product photos the way the shop files them by hand:
 * `<SKU>_1`, `<SKU>_2`… inside `mysilvers/categories/<Category>`.
 *
 * ── Why the name and the folder are set separately ──────────────────────────
 * This Cloudinary account uses DYNAMIC folders: an asset's folder
 * (`asset_folder`) is a filing location only, and its public id — the part in
 * the URL — carries no folder at all. So a photo can live in
 * `mysilvers/categories/Rings` and still be called plain `MYS-RNG-001_1`, and
 * renaming or moving folders in the console later breaks no links. The flip
 * side is that public ids are unique across the WHOLE account, not per folder —
 * which SKUs already are.
 *
 * Cloudinary creates a missing folder on first upload, so a new category needs
 * no setup here.
 */

/** Where the category folders live. Created in the console; mirrored here. */
export const PRODUCT_IMAGE_ROOT = "mysilvers/categories";

/** At most this many photos per product — matches validateMedia. */
const MAX_PER_PRODUCT = 6;

/**
 * A SKU as a public id. Letters, digits, hyphen and underscore pass through;
 * anything else becomes a hyphen, since `/` would read as a path and `?` or `#`
 * would cut the URL short.
 */
export function skuToPublicIdBase(sku: string): string {
  return sku
    .trim()
    .replace(/[^A-Za-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * The folder for a category: an EXISTING folder whose name matches ignoring
 * case, so "rings" files into the shop's "Rings" rather than creating a twin;
 * otherwise the category's own name, which Cloudinary then creates.
 *
 * A failed folder listing falls back to the category name rather than failing
 * the upload — the worst case is a folder that has to be merged by hand.
 */
async function folderForCategory(categoryName: string): Promise<string> {
  const wanted = categoryName.replace(/\//g, "-").trim();
  try {
    const { folders } = (await cloudinary.api.sub_folders(PRODUCT_IMAGE_ROOT)) as {
      folders: Array<{ name: string; path: string }>;
    };
    const match = folders.find((f) => f.name.toLowerCase() === wanted.toLowerCase());
    if (match) return match.path;
  } catch (err) {
    console.error("folderForCategory: could not list folders", err);
  }
  return `${PRODUCT_IMAGE_ROOT}/${wanted}`;
}

/**
 * The next free numbers for a SKU.
 *
 * Asked of Cloudinary, not worked out from the product's current photos. A
 * photo removed from the product is still in Cloudinary, and reusing its number
 * would hand the new upload an existing public id — which, with overwrite off,
 * Cloudinary answers by returning the OLD file. Counting what is actually
 * stored is the only way "never repeat a name" holds.
 */
async function nextNumbers(base: string, count: number): Promise<number[]> {
  let highest = 0;
  let cursor: string | undefined;
  const pattern = new RegExp(`^${base.replace(/[-]/g, "\\-")}_(\\d+)$`);
  do {
    const page = (await cloudinary.api.resources({
      type: "upload",
      prefix: `${base}_`,
      max_results: 500,
      next_cursor: cursor,
    })) as { resources: Array<{ public_id: string }>; next_cursor?: string };
    for (const r of page.resources) {
      const n = Number(pattern.exec(r.public_id)?.[1]);
      if (Number.isInteger(n) && n > highest) highest = n;
    }
    cursor = page.next_cursor;
  } while (cursor);

  return Array.from({ length: count }, (_, i) => highest + 1 + i);
}

export type ProductImageSlot = {
  timestamp: number;
  signature: string;
  /** Posted back verbatim — every one of these is part of the signature. */
  params: Record<string, string>;
};

/**
 * Signed upload slots for `count` new photos of one product.
 *
 * Throws with a sentence fit for the admin when the SKU or category is
 * missing; the uploader asks for both first, so this is the backstop.
 */
export async function signProductImageUploads(input: {
  sku: string;
  categoryId: string;
  count: number;
}): Promise<{ slots: ProductImageSlot[]; folder: string }> {
  const base = skuToPublicIdBase(input.sku);
  if (!base) throw new Error("Enter the SKU before adding photos.");

  const category = await prisma.category.findUnique({
    where: { id: input.categoryId },
    select: { name: true },
  });
  if (!category) throw new Error("Choose the category before adding photos.");

  const count = Math.min(Math.max(1, Math.trunc(input.count)), MAX_PER_PRODUCT);
  const [folder, numbers] = await Promise.all([
    folderForCategory(category.name),
    nextNumbers(base, count),
  ]);

  const timestamp = Math.floor(Date.now() / 1000);
  const slots = numbers.map((n) => {
    const params = {
      public_id: `${base}_${n}`,
      asset_folder: folder,
      // Signed uploads overwrite by default. Off, so a name taken in a race
      // between two admins is reported (see the upload's `existing` check)
      // instead of silently replacing someone else's photo.
      overwrite: "false",
    };
    return {
      timestamp,
      signature: cloudinary.utils.api_sign_request(
        { timestamp, ...params },
        process.env.CLOUDINARY_API_SECRET!
      ),
      params,
    };
  });

  return { slots, folder };
}
