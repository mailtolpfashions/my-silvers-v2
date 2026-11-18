import { prisma } from "@/server/db";
import { costBreakdown, type CostingDefaults } from "@/lib/costing";
import { getCurrentRole } from "@/server/auth/require-role";
import { isOwner } from "@/server/auth/roles";
import { getCostingDefaults } from "@/server/settings/costing-config";
import { getStoreSettings } from "@/server/settings/store-settings";

/**
 * Reading and writing a product's costing (ProductCosting). OWNER ONLY —
 * every caller checks the role first; nothing here does, so nothing outside
 * an owner-checked path may import it.
 */

export type ProductCostingValues = {
  weightGrams: number;
  /** At the rate this piece's batch was bought. */
  silverRatePerGram: number;
  makingChargePerGram: number;
};

export async function getProductCosting(productId: string): Promise<ProductCostingValues | null> {
  const row = await prisma.productCosting.findUnique({ where: { productId } });
  if (!row) return null;
  return {
    weightGrams: Number(row.weightGrams),
    silverRatePerGram: Number(row.silverRatePerGram),
    makingChargePerGram: Number(row.makingChargePerGram),
  };
}

/**
 * Saves the costing and sets Product.costPrice to the purchase cost it works
 * out to (weight × (rate + making)), so Finance and every order's cost
 * snapshot use the calculated figure instead of a hand-typed one.
 *
 * A null `values` removes the costing; costPrice is then left as it was.
 */
export async function saveProductCosting(
  productId: string,
  values: ProductCostingValues | null,
  defaults: CostingDefaults
): Promise<{ purchase: number | null }> {
  if (!values) {
    await prisma.productCosting.deleteMany({ where: { productId } });
    return { purchase: null };
  }
  const data = {
    weightGrams: values.weightGrams,
    silverRatePerGram: values.silverRatePerGram,
    makingChargePerGram: values.makingChargePerGram,
  };
  const b = costBreakdown(values, defaults);
  await prisma.$transaction([
    prisma.productCosting.upsert({
      where: { productId },
      create: { productId, ...data },
      update: data,
    }),
    ...(b ? [prisma.product.update({ where: { id: productId }, data: { costPrice: b.purchase } })] : []),
  ]);
  return { purchase: b?.purchase ?? null };
}

/**
 * Everything the product form's costing panel needs — or undefined when the
 * viewer isn't the owner, in which case NO costing data is sent to the
 * browser at all. The one place the pages get it from.
 */
export async function costingContextForViewer(productId?: string) {
  if (!isOwner(await getCurrentRole())) return undefined;

  const [defaults, settings, saved, latest] = await Promise.all([
    getCostingDefaults(),
    getStoreSettings(),
    productId ? getProductCosting(productId) : Promise.resolve(null),
    // A new product starts with the rate of the most recently costed piece —
    // usually the same batch. Only a starting value; it is the product's own.
    productId
      ? Promise.resolve(null)
      : prisma.productCosting.findFirst({ orderBy: { updatedAt: "desc" }, select: { silverRatePerGram: true } }),
  ]);
  const s = (n: number | null | undefined) => (n === null || n === undefined ? "" : String(n));
  return {
    defaults,
    charm:
      settings.charmPricing === "off"
        ? null
        : { style: settings.charmPricing, direction: settings.charmDirection },
    initial: saved
      ? { weight: s(saved.weightGrams), rate: s(saved.silverRatePerGram), making: s(saved.makingChargePerGram) }
      : latest
        ? { weight: "", rate: s(Number(latest.silverRatePerGram)), making: "" }
        : null,
  };
}
