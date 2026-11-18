import { prisma } from "@/server/db";
import {
  calculatedPrice,
  costBreakdown,
  type CharmRuleLike,
  type CostingDefaults,
} from "@/lib/costing";
import { charmPrice } from "@/lib/charm-price";
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
  /** The owner typed the price; Recalculate leaves it alone. */
  manualPrice: boolean;
};

/** Everything a price is worked out from, besides the product's own figures. */
export type PricingRule = { defaults: CostingDefaults; charm: CharmRuleLike };

export async function getPricingRule(): Promise<PricingRule> {
  const [defaults, settings] = await Promise.all([getCostingDefaults(), getStoreSettings()]);
  return {
    defaults,
    charm:
      settings.charmPricing === "off"
        ? null
        : { style: settings.charmPricing, direction: settings.charmDirection },
  };
}

/** The automatic price for these figures — cost → margin band → rounding — or null. */
export function priceFor(
  values: Omit<ProductCostingValues, "manualPrice">,
  rule: PricingRule,
  mrp?: number | null
): number | null {
  const b = costBreakdown(values, rule.defaults);
  if (!b) return null;
  return calculatedPrice(b, rule.defaults, rule.charm, charmPrice, mrp)?.price ?? null;
}

export async function getProductCosting(productId: string): Promise<ProductCostingValues | null> {
  const row = await prisma.productCosting.findUnique({ where: { productId } });
  if (!row) return null;
  return {
    weightGrams: Number(row.weightGrams),
    silverRatePerGram: Number(row.silverRatePerGram),
    makingChargePerGram: Number(row.makingChargePerGram),
    manualPrice: row.manualPrice,
  };
}

/**
 * Saves the costing and sets Product.costPrice to the purchase cost it works
 * out to (weight × (rate + making)), so Finance and every order's cost
 * snapshot use the calculated figure instead of a hand-typed one.
 *
 * A null `values` removes the costing; costPrice is then left as it was. The
 * PRICE is not set here — callers work it out with priceFor and save it with
 * the product, so a product and its price are written together.
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
    manualPrice: values.manualPrice,
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

export type RecalcChange = { id: string; sku: string; name: string; from: number; to: number };

/**
 * What Recalculate would change: every costed product on an automatic price,
 * re-priced with today's Settings → Pricing. Manual prices are left out.
 * Writes nothing.
 */
export async function planRecalculation(): Promise<{ changes: RecalcChange[]; manual: number }> {
  const [rule, rows, manual] = await Promise.all([
    getPricingRule(),
    prisma.productCosting.findMany({
      where: { manualPrice: false },
      select: {
        weightGrams: true,
        silverRatePerGram: true,
        makingChargePerGram: true,
        product: { select: { id: true, sku: true, name: true, price: true, compareAtPrice: true } },
      },
    }),
    prisma.productCosting.count({ where: { manualPrice: true } }),
  ]);
  const changes: RecalcChange[] = [];
  for (const r of rows) {
    const to = priceFor(
      {
        weightGrams: Number(r.weightGrams),
        silverRatePerGram: Number(r.silverRatePerGram),
        makingChargePerGram: Number(r.makingChargePerGram),
      },
      rule,
      r.product.compareAtPrice === null ? null : Number(r.product.compareAtPrice)
    );
    const from = Number(r.product.price);
    if (to !== null && to !== from) {
      changes.push({ id: r.product.id, sku: r.product.sku, name: r.product.name, from, to });
    }
  }
  changes.sort((a, b) => a.sku.localeCompare(b.sku));
  return { changes, manual };
}

/**
 * Everything the product form's costing panel needs — or undefined when the
 * viewer isn't the owner, in which case NO costing data is sent to the
 * browser at all. The one place the pages get it from.
 */
export async function costingContextForViewer(productId?: string) {
  if (!isOwner(await getCurrentRole())) return undefined;

  const [rule, saved, latest] = await Promise.all([
    getPricingRule(),
    productId ? getProductCosting(productId) : Promise.resolve(null),
    // A new product starts with the rate of the most recently costed piece —
    // usually the same batch. Only a starting value; it is the product's own.
    productId
      ? Promise.resolve(null)
      : prisma.productCosting.findFirst({ orderBy: { updatedAt: "desc" }, select: { silverRatePerGram: true } }),
  ]);
  const s = (n: number | null | undefined) => (n === null || n === undefined ? "" : String(n));
  return {
    defaults: rule.defaults,
    charm: rule.charm,
    /** Whether the saved price was typed by hand — the form starts in that mode. */
    manualPrice: saved?.manualPrice ?? false,
    initial: saved
      ? { weight: s(saved.weightGrams), rate: s(saved.silverRatePerGram), making: s(saved.makingChargePerGram) }
      : latest
        ? { weight: "", rate: s(Number(latest.silverRatePerGram)), making: "" }
        : null,
  };
}
