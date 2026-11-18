import { prisma } from "@/server/db";
import { COSTING_DEFAULTS, type CostingDefaults } from "@/lib/costing";

/**
 * The shop-wide costing figures — Settings → Costing. OWNER ONLY.
 *
 * Only the costs of SELLING and the margin bands. The silver rate and making
 * charge are never here: they belong to each product, fixed when its batch
 * was bought — see lib/costing.ts.
 *
 * Its own StoreSetting row ("costing"), never inside the "store" blob: that
 * blob is read by the cart and checkout and parts of it reach shoppers' pages,
 * and what the shop pays for silver and the margin it aims for have no
 * business anywhere near a storefront. Read only by the owner's Settings page,
 * the owner's product form, and the CSV import when the importer is the owner.
 */
const KEY = "costing";

function num(v: unknown, fallback: number, max: number): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) && n >= 0 && n <= max ? Math.round(n * 100) / 100 : fallback;
}

/** Every field present, every value sane — whatever is stored. */
export function cleanCostingDefaults(v: unknown): CostingDefaults {
  const o = (v ?? {}) as Record<string, unknown>;
  const m = (o.margins ?? {}) as Record<string, unknown>;
  const d = COSTING_DEFAULTS;
  return {
    packingCost: num(o.packingCost, d.packingCost, 100_000),
    deliveryCost: num(o.deliveryCost, d.deliveryCost, 100_000),
    gatewayPercent: num(o.gatewayPercent, d.gatewayPercent, 50),
    gstPercent: num(o.gstPercent, d.gstPercent, 50),
    margins: {
      under1k: num(m.under1k, d.margins.under1k, 95),
      upTo10k: num(m.upTo10k, d.margins.upTo10k, 95),
      over10k: num(m.over10k, d.margins.over10k, 95),
    },
  };
}

export async function getCostingDefaults(): Promise<CostingDefaults> {
  const row = await prisma.storeSetting.findUnique({ where: { key: KEY } });
  return cleanCostingDefaults(row?.value);
}

export async function saveCostingDefaults(next: unknown): Promise<CostingDefaults> {
  const value = cleanCostingDefaults(next);
  await prisma.storeSetting.upsert({
    where: { key: KEY },
    create: { key: KEY, value },
    update: { value },
  });
  return value;
}
