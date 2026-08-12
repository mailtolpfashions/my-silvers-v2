"use server";

import { z } from "zod";
import { revalidatePath, updateTag } from "next/cache";
import { requireRole } from "@/server/auth/require-role";
import { prisma } from "@/server/db";
import {
  createProduct,
  updateProduct,
  archiveProduct,
  restoreProduct,
  bulkImportProducts,
  type CsvRow,
} from "@/server/products/admin";

const productSchema = z.object({
  name: z.string().trim().min(2).max(200),
  description: z.string().trim().max(5000).optional().or(z.literal("")),
  shortDescription: z.string().trim().max(500).optional().or(z.literal("")),
  price: z.number().min(0),
  compareAtPrice: z.number().min(0).nullable().optional(),
  images: z.array(z.string().url()).max(6),
  videoUrl: z.string().url().nullable().optional().or(z.literal("")),
  categoryId: z.string().min(1),
  weight: z.number().min(0).nullable().optional(),
  purity: z.string().trim().max(100).optional().or(z.literal("")),
  dimensions: z.string().trim().max(200).optional().or(z.literal("")),
  // Replaces the old `sizes: string[]`: a size now carries its own stock, so
  // the shop cannot offer a size it has none of.
  sizeStock: z
    .array(
      z.object({
        size: z.string().trim().min(1).max(40),
        stock: z.number().int().min(0),
      }),
    )
    .max(30),
  material: z.string().trim().max(200).optional().or(z.literal("")),
  stock: z.number().int().min(0),
  sku: z.string().trim().min(1).max(100),
  isFeatured: z.boolean(),
  isBestseller: z.boolean(),
  isActive: z.boolean().optional(),
  tags: z.array(z.string().trim().min(1)).max(30),
});

export type AdminActionResult = { ok: true } | { ok: false; error: string };

function toInput(data: z.infer<typeof productSchema>) {
  return {
    ...data,
    description: data.description || undefined,
    shortDescription: data.shortDescription || undefined,
    purity: data.purity || undefined,
    dimensions: data.dimensions || undefined,
    material: data.material || undefined,
    videoUrl: data.videoUrl || null,
    compareAtPrice: data.compareAtPrice ?? null,
    weight: data.weight ?? null,
  };
}

export async function createProductAction(input: unknown): Promise<AdminActionResult> {
  await requireRole("admin");
  const parsed = productSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid product data." };
  }
  try {
    await createProduct(toInput(parsed.data));
    revalidatePath("/admin/products");
    updateTag("products");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to create product." };
  }
}

export async function updateProductAction(id: string, input: unknown): Promise<AdminActionResult> {
  await requireRole("admin");
  const parsed = productSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid product data." };
  }
  try {
    await updateProduct(id, toInput(parsed.data));
    revalidatePath("/admin/products");
    updateTag("products");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to update product." };
  }
}

export async function archiveProductAction(id: string): Promise<AdminActionResult> {
  await requireRole("admin");
  await archiveProduct(id);
  revalidatePath("/admin/products");
  updateTag("products");
  return { ok: true };
}

export async function restoreProductAction(id: string): Promise<AdminActionResult> {
  await requireRole("admin");
  await restoreProduct(id);
  revalidatePath("/admin/products");
  updateTag("products");
  return { ok: true };
}

/**
 * Archive or restore several products at once.
 *
 * ── Why this exists rather than the client looping ──────────────────────────
 * The obvious alternative is for the table to call archiveProductAction once
 * per selected row. That is N round trips, N revalidatePath calls and N cache
 * invalidations for one user gesture, and a failure halfway leaves the
 * selection half-applied with no single result to report. One action, one
 * revalidation, one answer.
 *
 * ── It reports a COUNT, not just ok ─────────────────────────────────────────
 * A bulk operation that says "done" while having silently skipped rows is
 * worse than one that fails. `updateMany` returns how many it actually
 * changed, and the caller shows that number — so archiving 20 and hearing
 * "18 archived" is a visible discrepancy rather than an invisible one.
 */
export async function setProductsActiveAction(
  ids: string[],
  isActive: boolean
): Promise<AdminActionResult & { count?: number }> {
  await requireRole("admin");
  const check = cleanIds(ids);
  if (!check.ok) return check;

  try {
    const result = await prisma.product.updateMany({
      where: { id: { in: check.ids } },
      data: { isActive },
    });
    revalidatePath("/admin/products");
    updateTag("products");
    return { ok: true, count: result.count };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to update those products.",
    };
  }
}

/**
 * Shared entry check for every bulk action below.
 *
 * A bulk endpoint that trusts its input is a way to rewrite the whole
 * catalogue with one crafted request, so each of these bounds the batch and
 * drops anything unusable before it reaches the database.
 */
function cleanIds(ids: string[]): { ok: true; ids: string[] } | { ok: false; error: string } {
  const clean = [...new Set(ids)].filter((id) => typeof id === "string" && id.length > 0);
  if (clean.length === 0) return { ok: false, error: "Nothing selected." };
  if (clean.length > 200) return { ok: false, error: "Too many products selected at once." };
  return { ok: true, ids: clean };
}

/** Tags are stored lower-cased — see server/products/admin.ts. */
function normaliseTag(tag: string) {
  return tag.trim().toLowerCase();
}

/**
 * Add or remove one tag across a selection.
 *
 * ── Why this is the most useful of the bulk actions ─────────────────────────
 * Collection membership on this site rides on `Product.tags`: a collection
 * entry names a tag and every active product carrying it belongs. So building a
 * collection meant opening each product and typing the same word. This turns
 * that into one gesture.
 *
 * `push` with Prisma's array update rather than read-modify-write, so two
 * admins tagging overlapping selections cannot clobber each other. Removal has
 * no array-remove operator, so it reads and writes per row — bounded by the
 * 200-row cap above.
 */
export async function setProductsTagAction(
  ids: string[],
  rawTag: string,
  mode: "add" | "remove"
): Promise<AdminActionResult & { count?: number }> {
  await requireRole("admin");
  const check = cleanIds(ids);
  if (!check.ok) return check;

  const tag = normaliseTag(rawTag);
  if (!tag) return { ok: false, error: "Enter a tag." };
  if (tag.length > 40) return { ok: false, error: "That tag is too long." };

  try {
    const products = await prisma.product.findMany({
      where: { id: { in: check.ids } },
      select: { id: true, tags: true },
    });

    let count = 0;
    await prisma.$transaction(
      products
        .filter((p) => (mode === "add" ? !p.tags.includes(tag) : p.tags.includes(tag)))
        .map((p) => {
          count++;
          return prisma.product.update({
            where: { id: p.id },
            data: {
              tags:
                mode === "add"
                  ? { push: tag }
                  : { set: p.tags.filter((t) => t !== tag) },
            },
          });
        })
    );

    revalidatePath("/admin/products");
    updateTag("products");
    return { ok: true, count };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to update tags." };
  }
}

/** Move a selection into another category. */
export async function setProductsCategoryAction(
  ids: string[],
  categoryId: string
): Promise<AdminActionResult & { count?: number }> {
  await requireRole("admin");
  const check = cleanIds(ids);
  if (!check.ok) return check;

  // Verified rather than trusted: an unknown id would otherwise fail on the
  // foreign key with a message no admin can act on.
  const category = await prisma.category.findUnique({ where: { id: categoryId } });
  if (!category) return { ok: false, error: "That category no longer exists." };

  try {
    const result = await prisma.product.updateMany({
      where: { id: { in: check.ids } },
      data: { categoryId },
    });
    revalidatePath("/admin/products");
    updateTag("products");
    return { ok: true, count: result.count };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to move products." };
  }
}

/** Flip one merchandising flag across a selection. */
export async function setProductsFlagAction(
  ids: string[],
  flag: "isFeatured" | "isBestseller",
  value: boolean
): Promise<AdminActionResult & { count?: number }> {
  await requireRole("admin");
  const check = cleanIds(ids);
  if (!check.ok) return check;
  // The flag name reaches a Prisma `data` key, so it is checked against a
  // literal list rather than passed through.
  if (flag !== "isFeatured" && flag !== "isBestseller") {
    return { ok: false, error: "Unknown flag." };
  }

  try {
    const result = await prisma.product.updateMany({
      where: { id: { in: check.ids } },
      data: { [flag]: value },
    });
    revalidatePath("/admin/products");
    updateTag("products");
    return { ok: true, count: result.count };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to update products." };
  }
}

/**
 * Put a selection on offer, or take it off.
 *
 * ── How an offer is represented ─────────────────────────────────────────────
 * `compareAtPrice` holds the ORIGINAL and `price` holds what the shopper pays;
 * the storefront strikes the former through whenever it is higher. So applying
 * a discount means moving the current price up into compareAtPrice and writing
 * the reduced one below it.
 *
 * ⚠️  Discounts are computed from compareAtPrice when one already exists, NOT
 * from the live price. Otherwise applying 20% twice would take 36% off, and an
 * admin correcting a typo would silently discount the discount. The original
 * stays the original however many times this is run.
 *
 * Rounded to whole rupees: every price in this catalogue is whole, and
 * ₹2,519.10 on a jewellery tile reads as a bug rather than a bargain.
 */
export async function setProductsOfferAction(
  ids: string[],
  percent: number | null
): Promise<AdminActionResult & { count?: number }> {
  await requireRole("admin");
  const check = cleanIds(ids);
  if (!check.ok) return check;

  if (percent !== null && (!Number.isFinite(percent) || percent <= 0 || percent > 90)) {
    return { ok: false, error: "Enter a discount between 1 and 90 percent." };
  }

  try {
    const products = await prisma.product.findMany({
      where: { id: { in: check.ids } },
      select: { id: true, price: true, compareAtPrice: true },
    });

    const updates = products
      .map((p) => {
        const original = Number(p.compareAtPrice ?? p.price);

        if (percent === null) {
          // Clearing: restore the original and drop the strike-through. A
          // product that was never on offer is skipped rather than touched.
          if (p.compareAtPrice === null) return null;
          return prisma.product.update({
            where: { id: p.id },
            data: { price: original, compareAtPrice: null },
          });
        }

        const next = Math.round(original * (1 - percent / 100));
        if (next <= 0) return null;
        return prisma.product.update({
          where: { id: p.id },
          data: { price: next, compareAtPrice: original },
        });
      })
      .filter((u): u is NonNullable<typeof u> => u !== null);

    await prisma.$transaction(updates);
    revalidatePath("/admin/products");
    updateTag("products");
    return { ok: true, count: updates.length };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to update prices." };
  }
}

export async function bulkImportProductsAction(rows: CsvRow[]) {
  await requireRole("admin");
  const result = await bulkImportProducts(rows);
  revalidatePath("/admin/products");
  updateTag("products");
  return result;
}
