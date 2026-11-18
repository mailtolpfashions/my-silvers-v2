"use server";

import { z } from "zod";
import { revalidatePath, updateTag } from "next/cache";
import { requireOwner, requireRole } from "@/server/auth/require-role";
import { logActivity } from "@/server/activity/log";
import { prisma } from "@/server/db";
import {
  createProduct,
  updateProduct,
  archiveProduct,
  restoreProduct,
  deleteProduct,
  deleteProducts,
  getAdminProductIds,
  BULK_LIMIT,
  bulkImportProducts,
  normalizeVendor,
  autoCharmRule,
  applyCharmRule,
  planCharmPrices,
  type CharmChange,
  type CsvRow,
} from "@/server/products/admin";
import { isCharmDirection, isCharmStyle } from "@/lib/charm-price";
import { canSeeCosts } from "@/server/auth/roles";
import { getPricingRule, priceFor, saveProductCosting } from "@/server/products/costing";
import { getCostingDefaults } from "@/server/settings/costing-config";

const productSchema = z.object({
  name: z.string().trim().min(2).max(200),
  description: z.string().trim().max(5000).optional().or(z.literal("")),
  shortDescription: z.string().trim().max(500).optional().or(z.literal("")),
  price: z.number().min(0),
  compareAtPrice: z.number().min(0).nullable().optional(),
  costPrice: z.number().min(0).nullable().optional(),
  vendor: z.string().trim().max(120).nullable().optional().or(z.literal("")),
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
  /**
   * The costing panel. Absent = not touched (and always absent for
   * staff, who never see the panel); null = remove the costing. Saved only
   * when the person saving may see costs — see saveCostingIfAllowed.
   */
  costing: z
    .object({
      weightGrams: z.number().positive().max(100_000),
      // The product's own — never a shop default (lib/costing.ts).
      silverRatePerGram: z.number().positive("Enter the silver rate.").max(100_000),
      makingChargePerGram: z.number().min(0).max(100_000),
      /** The owner typed the price; otherwise it is worked out on save. */
      manualPrice: z.boolean(),
    })
    .nullable()
    .optional(),
});

export type AdminActionResult = { ok: true } | { ok: false; error: string };

function toInput(full: z.infer<typeof productSchema>) {
  // Costing has its own table and its own owner check — never a product field.
  const { costing, ...data } = full;
  void costing;
  return {
    ...data,
    description: data.description || undefined,
    shortDescription: data.shortDescription || undefined,
    purity: data.purity || undefined,
    dimensions: data.dimensions || undefined,
    material: data.material || undefined,
    videoUrl: data.videoUrl || null,
    compareAtPrice: data.compareAtPrice ?? null,
    costPrice: data.costPrice ?? null,
    vendor: data.vendor || null,
    weight: data.weight ?? null,
  };
}

const rupees = (n: unknown) =>
  n === null || n === undefined ? "—" : `₹${Number(n).toLocaleString("en-IN")}`;

async function productName(id: string) {
  const p = await prisma.product.findUnique({ where: { id }, select: { name: true } });
  return p?.name ?? id;
}

/** "Edited “Lotus ring” — price ₹1,299 → ₹1,199". Prices are what the owner watches. */
function productChangeSummary(
  name: string,
  before: { price: unknown; compareAtPrice: unknown; costPrice: unknown } | null,
  after: { price: number; compareAtPrice?: number | null; costPrice?: number | null }
) {
  const changes: string[] = [];
  if (before) {
    const diff = (label: string, a: unknown, b: unknown) => {
      const x = a === null || a === undefined ? null : Number(a);
      const y = b === null || b === undefined ? null : Number(b);
      if (x !== y) changes.push(`${label} ${rupees(x)} → ${rupees(y)}`);
    };
    diff("price", before.price, after.price);
    diff("MRP", before.compareAtPrice, after.compareAtPrice);
    diff("cost", before.costPrice, after.costPrice);
  }
  return `Edited “${name}”${changes.length ? " — " + changes.join(", ") : ""}`;
}

export async function createProductAction(input: unknown): Promise<AdminActionResult> {
  const session = await requireRole("admin");
  const parsed = productSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid product data." };
  }
  try {
    const rule = await autoCharmRule();
    const input = toInput(parsed.data);
    input.price = applyCharmRule(input.price, rule, input.compareAtPrice);
    // Costs are the owner's and admins' (canSeeCosts). Anyone else never sees
    // the field, so whatever arrives from them is ignored rather than trusted.
    const canCost = canSeeCosts(session.user.role);
    if (!canCost) input.costPrice = null;
    // An automatic price is worked out HERE, not taken from the page: the
    // form shows the same figure, but the server's is the one that counts.
    if (canCost) input.price = (await automaticPrice(parsed.data.costing, input.compareAtPrice)) ?? input.price;
    const created = await createProduct(input);
    if (canCost) await saveCostingIfAllowed(created.id, parsed.data.costing);
    await logActivity(session, {
      action: "product.create",
      target: { type: "product", id: created.id },
      summary: `Added product “${input.name}” at ${rupees(input.price)}`,
    });
    revalidatePath("/admin/products");
    updateTag("products");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to create product." };
  }
}

export async function updateProductAction(id: string, input: unknown): Promise<AdminActionResult> {
  const session = await requireRole("admin");
  const parsed = productSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid product data." };
  }
  try {
    const input = toInput(parsed.data);
    const before = await prisma.product.findUnique({
      where: { id },
      select: { price: true, compareAtPrice: true, costPrice: true },
    });
    // Staff don't see the Cost price field, so their form posts it empty.
    // Keep what is stored rather than wiping the owner's figure.
    const canCost = canSeeCosts(session.user.role);
    if (!canCost) input.costPrice = before?.costPrice === null || !before ? null : Number(before.costPrice);
    // Only a price the admin CHANGED is rounded. The form posts every field
    // on every save, so without this, fixing a typo in a description would
    // quietly reprice a piece that was saved before rounding was turned on.
    const rule = await autoCharmRule();
    if (rule) {
      const current = await prisma.product.findUnique({ where: { id }, select: { price: true } });
      if (!current || Number(current.price) !== input.price) {
        input.price = applyCharmRule(input.price, rule, input.compareAtPrice);
      }
    }
    if (canCost) input.price = (await automaticPrice(parsed.data.costing, input.compareAtPrice)) ?? input.price;
    await updateProduct(id, input);
    if (canCost) await saveCostingIfAllowed(id, parsed.data.costing);
    await logActivity(session, {
      action: "product.update",
      target: { type: "product", id },
      summary: productChangeSummary(input.name, before, input),
    });
    revalidatePath("/admin/products");
    updateTag("products");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to update product." };
  }
}

/**
 * The price a costed product gets when it isn't a manual one: cost → margin
 * band → rounding, with today's pricing rules. Null leaves the typed
 * price as it is (no costing, a manual price, or margins that can't be met).
 */
async function automaticPrice(
  costing: z.infer<typeof productSchema>["costing"],
  mrp: number | null | undefined
): Promise<number | null> {
  if (!costing || costing.manualPrice) return null;
  return priceFor(costing, await getPricingRule(), mrp ?? null);
}

/**
 * Saves the owner's costing panel, which also sets Cost price to the purchase
 * cost it works out to. Only ever called after a canSeeCosts check; `undefined`
 * (panel not touched) changes nothing.
 */
async function saveCostingIfAllowed(
  productId: string,
  costing: z.infer<typeof productSchema>["costing"]
) {
  if (costing === undefined) return;
  await saveProductCosting(productId, costing, await getCostingDefaults());
}

export async function archiveProductAction(id: string): Promise<AdminActionResult> {
  const session = await requireRole("admin");
  await archiveProduct(id);
  await logActivity(session, {
    action: "product.archive",
    target: { type: "product", id },
    summary: `Archived product “${await productName(id)}”`,
  });
  revalidatePath("/admin/products");
  updateTag("products");
  return { ok: true };
}

export async function restoreProductAction(id: string): Promise<AdminActionResult> {
  const session = await requireRole("admin");
  try {
    await restoreProduct(id);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to restore product." };
  }
  await logActivity(session, {
    action: "product.restore",
    target: { type: "product", id },
    summary: `Restored product “${await productName(id)}”`,
  });
  revalidatePath("/admin/products");
  updateTag("products");
  return { ok: true };
}

export async function deleteProductAction(id: string): Promise<AdminActionResult> {
  // Deletes are the owner's alone — see roles.ts.
  const session = await requireOwner();
  const product = await prisma.product.findUnique({ where: { id }, select: { name: true } });
  try {
    await deleteProduct(id);
  } catch (err) {
    console.error("deleteProductAction failed", err);
    return { ok: false, error: "Could not delete this product. It may already be gone — refresh the page." };
  }
  await logActivity(session, {
    action: "product.delete",
    target: { type: "product", id },
    summary: `Deleted product “${product?.name ?? id}”`,
  });
  revalidatePath("/admin/products");
  updateTag("products");
  return { ok: true };
}

/**
 * Permanently delete several products. The bulk bar asks for a typed
 * "confirm" first; this is the half a crafted request also has to get past,
 * so it re-checks the role and bounds the batch like every bulk action.
 */
export async function deleteProductsAction(
  ids: string[]
): Promise<AdminActionResult & { count?: number }> {
  const session = await requireOwner();
  const check = cleanIds(ids);
  if (!check.ok) return check;

  try {
    const names = await prisma.product.findMany({
      where: { id: { in: check.ids } },
      select: { name: true },
    });
    const count = await deleteProducts(check.ids);
    await logActivity(session, {
      action: "product.delete",
      target: { type: "product" },
      summary: `Deleted ${count} product${count === 1 ? "" : "s"}`,
      details: { names: names.map((n) => n.name) },
    });
    revalidatePath("/admin/products");
    updateTag("products");
    return { ok: true, count };
  } catch (err) {
    console.error("deleteProductsAction failed", err);
    return { ok: false, error: "Could not delete those products. Nothing was removed — try again." };
  }
}

const filtersSchema = z.object({
  q: z.string().max(200).optional(),
  categoryId: z.string().max(100).optional(),
  vendor: z.string().max(200).optional(),
  active: z.enum(["active", "inactive"]).optional(),
  stock: z.enum(["in", "out"]).optional(),
  flag: z.enum(["featured", "bestseller"]).optional(),
});

/** The ids behind "Select all N matching" — see getAdminProductIds. */
export async function listMatchingProductIdsAction(
  filters: unknown
): Promise<{ ok: true; ids: string[]; total: number } | { ok: false; error: string }> {
  await requireRole("admin");
  const parsed = filtersSchema.safeParse(filters);
  if (!parsed.success) return { ok: false, error: "Invalid filters." };
  return { ok: true, ...(await getAdminProductIds(parsed.data)) };
}

/**
 * What "Charm prices" would do to a selection — the preview the dialog shows
 * before anything is written. Returns the first few changes and the total.
 */
export async function previewCharmPricesAction(
  ids: string[],
  style: unknown,
  direction: unknown = "down"
): Promise<{ ok: true; sample: CharmChange[]; total: number } | { ok: false; error: string }> {
  await requireRole("admin");
  const check = cleanIds(ids);
  if (!check.ok) return check;
  if (!isCharmStyle(style)) return { ok: false, error: "Choose a rounding style." };
  if (!isCharmDirection(direction)) return { ok: false, error: "Choose which way to round." };

  const changes = await planCharmPrices(check.ids, style, direction);
  return { ok: true, sample: changes.slice(0, 5), total: changes.length };
}

/**
 * Rounds a selection's prices — ₹1,500 → ₹1,499, or up, or to the nearest.
 *
 * Recomputed here rather than trusting the preview's numbers from the
 * browser, so a price edited between preview and apply is rounded from what
 * is stored now. compareAtPrice (the struck-through original on an offer) is
 * left alone: rounding the "was" price would shrink the saving the shopper
 * is shown.
 */
export async function applyCharmPricesAction(
  ids: string[],
  style: unknown,
  direction: unknown = "down"
): Promise<AdminActionResult & { count?: number }> {
  const session = await requireRole("admin");
  const check = cleanIds(ids);
  if (!check.ok) return check;
  if (!isCharmStyle(style)) return { ok: false, error: "Choose a rounding style." };
  if (!isCharmDirection(direction)) return { ok: false, error: "Choose which way to round." };

  try {
    const changes = await planCharmPrices(check.ids, style, direction);
    await prisma.$transaction(
      changes.map((c) => prisma.product.update({ where: { id: c.id }, data: { price: c.to } }))
    );
    await logActivity(session, {
      action: "product.price",
      target: { type: "product" },
      summary: `Rounded the price of ${changes.length} product${changes.length === 1 ? "" : "s"}`,
      details: { changes: changes.map((c) => ({ id: c.id, to: Number(c.to) })) },
    });
    revalidatePath("/admin/products");
    updateTag("products");
    return { ok: true, count: changes.length };
  } catch (err) {
    console.error("applyCharmPricesAction failed", err);
    return { ok: false, error: "Could not update those prices. Nothing was changed." };
  }
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
  const session = await requireRole("admin");
  const check = cleanIds(ids);
  if (!check.ok) return check;

  try {
    const result = await prisma.product.updateMany({
      // Restoring skips anything priced ₹0 — see assertSellablePrice. The
      // count then comes back short, which the bulk bar reports.
      where: { id: { in: check.ids }, ...(isActive ? { price: { gt: 0 } } : {}) },
      data: { isActive },
    });
    await logActivity(session, {
      action: isActive ? "product.restore" : "product.archive",
      target: { type: "product" },
      summary: `${isActive ? "Showed" : "Hid"} ${result.count} product${result.count === 1 ? "" : "s"} in the shop`,
      details: { ids: check.ids },
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
  if (clean.length > BULK_LIMIT) {
    return { ok: false, error: `At most ${BULK_LIMIT} products at once.` };
  }
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
 * BULK_LIMIT cap above.
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
/**
 * Sets (or clears, with a blank name) the vendor on many products at once.
 *
 * The way to fill vendors in for a catalogue that predates the field — the CSV
 * import only creates new products, so it cannot. Normalised exactly as a
 * single save is, so a bulk-typed "ravi silvers" joins the existing
 * "Ravi Silvers" rather than starting a second supplier.
 */
export async function setProductsVendorAction(
  ids: string[],
  vendorName: string
): Promise<AdminActionResult & { count?: number }> {
  await requireRole("admin");
  const check = cleanIds(ids);
  if (!check.ok) return check;
  if (vendorName.length > 120) return { ok: false, error: "Vendor name is too long." };

  try {
    const vendor = await normalizeVendor(vendorName);
    const result = await prisma.product.updateMany({
      where: { id: { in: check.ids } },
      data: { vendor },
    });
    revalidatePath("/admin/products");
    return { ok: true, count: result.count };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to set vendor." };
  }
}

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
  const session = await requireRole("admin");
  const check = cleanIds(ids);
  if (!check.ok) return check;

  if (percent !== null && (!Number.isFinite(percent) || percent <= 0 || percent > 90)) {
    return { ok: false, error: "Enter a discount between 1 and 90 percent." };
  }

  try {
    const [products, style] = await Promise.all([
      prisma.product.findMany({
        where: { id: { in: check.ids } },
        select: { id: true, price: true, compareAtPrice: true },
      }),
      autoCharmRule(),
    ]);

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

        const rounded = Math.round(original * (1 - percent / 100));
        // 20% off ₹1,500 is ₹1,200; with rounding on it goes out as ₹1,199.
        // The struck-through original is left exactly as it was.
        // The original is the MRP here, so rounding up can never reach it.
        const next = applyCharmRule(rounded, style, original);
        if (next <= 0) return null;
        return prisma.product.update({
          where: { id: p.id },
          data: { price: next, compareAtPrice: original },
        });
      })
      .filter((u): u is NonNullable<typeof u> => u !== null);

    await prisma.$transaction(updates);
    await logActivity(session, {
      action: "product.price",
      target: { type: "product" },
      summary:
        percent === null
          ? `Ended the offer on ${updates.length} product${updates.length === 1 ? "" : "s"}`
          : `Put ${updates.length} product${updates.length === 1 ? "" : "s"} on ${percent}% off`,
      details: { ids: check.ids, percent },
    });
    revalidatePath("/admin/products");
    updateTag("products");
    return { ok: true, count: updates.length };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to update prices." };
  }
}

export async function bulkImportProductsAction(
  rows: CsvRow[],
  /** The import dialog's "Silver rate for this batch" — owner and admins, else ignored. */
  batchSilverRate?: number | null
) {
  const session = await requireRole("admin");
  // Costing columns and costPrice count for the owner and admins (canSeeCosts).
  const canCost = canSeeCosts(session.user.role);
  const rate = canCost && typeof batchSilverRate === "number" && batchSilverRate > 0 ? batchSilverRate : null;
  const result = await bulkImportProducts(rows, { owner: canCost, batchSilverRate: rate });
  await logActivity(session, {
    action: "product.import",
    target: { type: "product" },
    summary: `Imported a product spreadsheet (${rows.length} row${rows.length === 1 ? "" : "s"})`,
  });
  revalidatePath("/admin/products");
  updateTag("products");
  return result;
}
