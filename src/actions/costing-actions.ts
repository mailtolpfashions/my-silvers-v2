"use server";

import { revalidatePath, updateTag } from "next/cache";
import { z } from "zod";
import { requireOwner } from "@/server/auth/require-role";
import { logActivity } from "@/server/activity/log";
import { prisma } from "@/server/db";
import { saveCostingDefaults } from "@/server/settings/costing-config";
import { getStoreSettings, saveStoreSettings } from "@/server/settings/store-settings";
import { planRecalculation, type RecalcChange } from "@/server/products/costing";

const pricingSchema = z.object({
  costing: z.unknown(),
  charmPricing: z.enum(["off", "99", "49-99"]),
  charmDirection: z.enum(["down", "up", "nearest"]),
});

/**
 * the Pricing page: costs of selling, margin bands and rounding, saved
 * together because together they ARE the price. Owner only.
 *
 * The costing figures go to their own row (costing-config.ts) and rounding to
 * the store settings, where the price write paths already read it. Nothing is
 * re-priced here — that is Recalculate, with a preview.
 */
export async function savePricingSettingsAction(
  input: unknown
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await requireOwner();
  const parsed = pricingSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid pricing settings." };
  try {
    const saved = await saveCostingDefaults(parsed.data.costing);
    const before = await getStoreSettings();
    await saveStoreSettings({
      ...before,
      charmPricing: parsed.data.charmPricing,
      charmDirection: parsed.data.charmDirection,
    });
    await logActivity(session, {
      action: "settings.update",
      target: { type: "settings", id: "pricing" },
      summary: `Updated pricing (margins ${saved.margins.under1k}% / ${saved.margins.upTo10k}% / ${saved.margins.over10k}%, rounding ${parsed.data.charmPricing === "off" ? "off" : `${parsed.data.charmPricing} ${parsed.data.charmDirection}`})`,
    });
    revalidatePath("/admin/settings");
    revalidatePath("/admin/products");
    return { ok: true };
  } catch (err) {
    console.error("savePricingSettingsAction failed", err);
    return { ok: false, error: "Could not save the pricing settings." };
  }
}

/** What Recalculate would do — the preview. Writes nothing. */
export async function previewRecalculationAction(): Promise<
  { ok: true; sample: RecalcChange[]; total: number; manual: number } | { ok: false; error: string }
> {
  await requireOwner();
  const { changes, manual } = await planRecalculation();
  return { ok: true, sample: changes.slice(0, 8), total: changes.length, manual };
}

/**
 * Re-prices every costed product on an automatic price with today's
 * pricing rules. Recomputed here rather than trusting the preview, so a
 * setting changed between preview and apply is the one used. Manual prices
 * are never touched.
 */
export async function applyRecalculationAction(): Promise<
  { ok: true; count: number } | { ok: false; error: string }
> {
  const session = await requireOwner();
  try {
    const { changes } = await planRecalculation();
    await prisma.$transaction(
      changes.map((c) => prisma.product.update({ where: { id: c.id }, data: { price: c.to } }))
    );
    await logActivity(session, {
      action: "product.price",
      target: { type: "product" },
      summary: `Recalculated the price of ${changes.length} costed product${changes.length === 1 ? "" : "s"}`,
      details: { changes: changes.map((c) => ({ id: c.id, from: c.from, to: c.to })) },
    });
    revalidatePath("/admin/products");
    updateTag("products");
    return { ok: true, count: changes.length };
  } catch (err) {
    console.error("applyRecalculationAction failed", err);
    return { ok: false, error: "Could not update the prices. Nothing was changed." };
  }
}
