"use server";

import { revalidatePath, updateTag } from "next/cache";
import { z } from "zod";
import { prisma } from "@/server/db";
import { requireRole } from "@/server/auth/require-role";
import { logActivity } from "@/server/activity/log";
import { assertAllowedMediaUrls } from "@/server/media/url-allowlist";

/**
 * Bulk photo upload (Products → Bulk photos): match a folder of photos named
 * by SKU to their products, then attach what was uploaded.
 *
 * The files themselves never come through here — the browser sends them
 * straight to Cloudinary with signed, SKU-named slots (lib/cloudinary-upload),
 * exactly as the product form does. These two actions only look products up
 * and write the resulting URLs.
 */

/**
 * Same cap as the product form and createProduct/updateProduct. Not exported:
 * a "use server" file may only export async functions. The page repeats it.
 */
const MAX_PHOTOS = 6;

export type PhotoMatch = {
  id: string;
  sku: string;
  name: string;
  categoryId: string;
  images: string[];
};

/**
 * The products these candidate SKUs belong to, keyed by lower-cased SKU.
 * Case-insensitive, because a file renamed by hand is "mys-rng-001_1.jpg" as
 * often as "MYS-RNG-001_1.jpg".
 */
export async function matchPhotoSkusAction(
  candidates: string[]
): Promise<{ ok: true; matches: Record<string, PhotoMatch> } | { ok: false; error: string }> {
  await requireRole("admin");
  const keys = [...new Set(candidates.map((c) => c.trim()).filter(Boolean))].slice(0, 2000);
  if (keys.length === 0) return { ok: true, matches: {} };

  const products = await prisma.product.findMany({
    where: { OR: keys.map((k) => ({ sku: { equals: k, mode: "insensitive" as const } })) },
    select: { id: true, sku: true, name: true, categoryId: true, images: true },
  });
  const matches: Record<string, PhotoMatch> = {};
  for (const p of products) matches[p.sku.toLowerCase()] = p;
  return { ok: true, matches };
}

const attachSchema = z.object({
  productId: z.string().min(1),
  urls: z.array(z.string().url()).min(1).max(MAX_PHOTOS),
  mode: z.enum(["add", "replace"]),
});

/**
 * Puts uploaded photos on a product: after its existing ones ("add") or
 * instead of them ("replace"). Never more than MAX_PHOTOS — on "add" the
 * extra photos are refused with a message, not silently dropped, because the
 * preview already told the admin how many would fit.
 */
export async function attachProductPhotosAction(
  input: unknown
): Promise<{ ok: true; total: number } | { ok: false; error: string }> {
  const session = await requireRole("admin");
  const parsed = attachSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Those photos couldn't be attached." };
  const { productId, urls, mode } = parsed.data;

  try {
    assertAllowedMediaUrls(urls, "Product image");
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Photo URL not allowed." };
  }

  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { name: true, images: true },
  });
  if (!product) return { ok: false, error: "That product no longer exists." };

  const next = mode === "replace" ? urls : [...product.images, ...urls];
  if (next.length > MAX_PHOTOS) {
    return {
      ok: false,
      error: `${product.name} would have ${next.length} photos — the most is ${MAX_PHOTOS}. Use "Replace" or remove some first.`,
    };
  }

  await prisma.product.update({ where: { id: productId }, data: { images: next } });
  await logActivity(session, {
    action: "product.update",
    target: { type: "product", id: productId },
    summary: `${mode === "replace" ? "Replaced the photos on" : "Added photos to"} “${product.name}” (${urls.length}, bulk upload)`,
  });
  revalidatePath("/admin/products");
  updateTag("products");
  return { ok: true, total: next.length };
}
