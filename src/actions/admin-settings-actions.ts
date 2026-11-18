"use server";

import { z } from "zod";
import { revalidatePath, updateTag } from "next/cache";
import { normaliseIndianMobile } from "@/lib/whatsapp";
import { rupees, days } from "@/lib/validation/settings";
import { requireOwner } from "@/server/auth/require-role";
import { logActivity } from "@/server/activity/log";
import {
  getStoreSettings,
  NAV_FILTER_LIMITS,
  NAV_MENU_TAG,
  CONTACT_TAG,
  saveStoreSettings,
  STORE_SETTINGS_TAG,
  type StoreSettings,
} from "@/server/settings/store-settings";

/**
 * A header-menu list as the form sends it. Rows with both halves blank are
 * dropped (an untouched "Add" row); a row with only one half filled is an
 * error, because guessing the other half would publish a link the admin never
 * saw. Duplicate labels are refused — two "Oxidised" links side by side is a
 * typo, not a choice.
 */
const navFilters = (what: string, target = "search word") =>
  z
    .array(
      z.object({
        label: z.string().trim().max(NAV_FILTER_LIMITS.label, `${what}: a label is too long.`),
        query: z.string().trim().max(NAV_FILTER_LIMITS.query, `${what}: a ${target} is too long.`),
      })
    )
    .transform((rows) => rows.filter((r) => r.label || r.query))
    .refine((rows) => rows.every((r) => r.label && r.query), {
      message: `${what}: every row needs both a label and a ${target}.`,
    })
    .refine((rows) => rows.length <= NAV_FILTER_LIMITS.items, {
      message: `${what}: at most ${NAV_FILTER_LIMITS.items} links.`,
    })
    .refine(
      (rows) => new Set(rows.map((r) => r.label.toLowerCase())).size === rows.length,
      { message: `${what}: the same label appears twice.` }
    );

const settingsSchema = z
  .object({
    codEnabled: z.boolean(),
    guestCheckoutEnabled: z.boolean(),
    giftWrapEnabled: z.boolean(),
    giftWrapCharge: rupees,
    codCharge: rupees,
    returnWindowDays: days,
    returnRequestHours: z.number().int().min(0).max(24 * 90),
    returnShippingPaidBy: z.enum(["customer", "merchant"]),
    navFinishes: navFilters("Finishes"),
    navOccasions: navFilters("Occasions"),
    navShopFor: navFilters("Shop for", "collection"),
    /**
     * Empty hides WhatsApp everywhere. Anything else must BE an Indian mobile
     * number: refused with a message rather than saved as "" — silently
     * hiding every WhatsApp link because of a typo is worse than an error.
     */
    whatsappNumber: z
      .string()
      .trim()
      .refine((v) => v === "" || normaliseIndianMobile(v) !== "", {
        message: "WhatsApp: enter a 10-digit Indian mobile number, e.g. 98765 43210.",
      }),
  });

export type SettingsActionResult = { ok: true } | { ok: false; error: string };

/**
 * Saves the store settings.
 *
 * Takes effect on the next request, not on a publish step: `updateTag` expires
 * the settings cache immediately (rather than `revalidateTag`, which would
 * serve the old value while refreshing in the background). An admin who
 * switches COD off and then loads the checkout must see it gone — a payment
 * method that lingers for a revalidate window is the exact failure this whole
 * feature exists to prevent.
 */
export async function saveStoreSettingsAction(input: unknown): Promise<SettingsActionResult> {
  const session = await requireOwner();

  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid settings." };
  }
  const data = parsed.data;

  // Read first: the courier fields (partners, shipping charge, dispatch and
  // delivery days) live on the Courier page now and are carried over as they
  // are — and the header lists are compared below.
  const before = await getStoreSettings();

  const next: StoreSettings = {
    ...before,
    codEnabled: data.codEnabled,
    guestCheckoutEnabled: data.guestCheckoutEnabled,
    giftWrapEnabled: data.giftWrapEnabled,
    giftWrapChargePaise: Math.round(data.giftWrapCharge * 100),
    codChargePaise: Math.round(data.codCharge * 100),
    returnWindowDays: data.returnWindowDays,
    returnRequestHours: data.returnRequestHours,
    returnShippingPaidBy: data.returnShippingPaidBy,
    navFinishes: data.navFinishes,
    navOccasions: data.navOccasions,
    navShopFor: data.navShopFor,
    // Rounding is saved by the Pricing card (savePricingSettingsAction), so
    // this form must carry it over untouched rather than overwrite it with
    // whatever it loaded.
    charmPricing: before.charmPricing,
    charmDirection: before.charmDirection,
    whatsappNumber: normaliseIndianMobile(data.whatsappNumber),
  };

  try {
    await saveStoreSettings(next);
  } catch (err) {
    console.error("saveStoreSettingsAction failed", err);
    return { ok: false, error: "Could not save the settings. Please try again." };
  }

  // Before → after for every switch that changed, so the owner can see
  // exactly what moved ("shippingChargePaise: 4900 → 5900").
  const changed = Object.fromEntries(
    Object.entries(next)
      .filter(([k, v]) => JSON.stringify(v) !== JSON.stringify((before as Record<string, unknown>)[k]))
      .map(([k, v]) => [k, { from: (before as Record<string, unknown>)[k] ?? null, to: v }])
  );
  const keys = Object.keys(changed);
  await logActivity(session, {
    action: "settings.update",
    target: { type: "settings", id: "store" },
    summary: keys.length ? `Changed store settings: ${keys.join(", ")}` : "Saved store settings (no changes)",
    details: JSON.parse(JSON.stringify(changed)),
  });

  updateTag(STORE_SETTINGS_TAG);

  /**
   * The header lists have their own tag, expired ONLY when they changed.
   *
   * The header is on every page, so expiring its tag rebuilds every page's
   * header on its next visit. Doing that on a COD or shipping save — the
   * common case — is pure cost; see getNavMenuSettings.
   */
  const listsChanged =
    JSON.stringify([before.navFinishes, before.navOccasions, before.navShopFor]) !==
    JSON.stringify([next.navFinishes, next.navOccasions, next.navShopFor]);
  if (listsChanged) updateTag(NAV_MENU_TAG);
  // Same for the WhatsApp number, read by the footer and menu on every page.
  if (before.whatsappNumber !== next.whatsappNumber) updateTag(CONTACT_TAG);
  // The cart and checkout quote the shipping charge, so a rate change has to
  // reach their rendered output too — the tag covers the settings read, these
  // cover the pages built from it.
  revalidatePath("/cart");
  revalidatePath("/checkout");
  revalidatePath("/admin/settings");
  // Product pages now build their JSON-LD shipping and return nodes from these
  // values, so a policy change has to reach their rendered HTML too — the tag
  // above only covers the settings read itself. "layout" sweeps every
  // /products/[slug] rather than the listing alone.
  revalidatePath("/products", "layout");

  return { ok: true };
}
