"use server";

import { z } from "zod";
import { revalidatePath, updateTag } from "next/cache";
import { requireRole } from "@/server/auth/require-role";
import {
  saveStoreSettings,
  STORE_SETTINGS_TAG,
  type StoreSettings,
} from "@/server/settings/store-settings";

/**
 * Rupees, not paise, because that is what the admin types into the form.
 * Converted here so paise stays the only unit that exists below this line —
 * the same rule the order math follows.
 */
const rupees = z
  .number({ message: "Enter an amount in rupees." })
  .min(0, "Amount cannot be negative.")
  // A shipping charge in the tens of thousands is a typo, not a price. The cap
  // is deliberately generous rather than precise — it exists to catch a stray
  // extra zero before it silently reprices every order in the shop.
  .max(100000, "That looks too large — enter the amount in rupees.")
  .refine((n) => Number.isFinite(n) && Math.round(n * 100) === n * 100, {
    message: "Amounts can have at most two decimal places.",
  });

/**
 * A count of days. Whole numbers only, and capped at a year — these are typed
 * into a form and then published to Google as a return window or a delivery
 * estimate, where a stray digit becomes a public promise of a 70-day dispatch.
 */
const days = z
  .number({ message: "Enter a whole number of days." })
  .int("Days must be a whole number.")
  .min(0, "Days cannot be negative.")
  .max(365, "That looks too large — enter a number of days.");

const settingsSchema = z
  .object({
    codEnabled: z.boolean(),
    guestCheckoutEnabled: z.boolean(),
    shippingCharge: rupees,
    freeShippingThreshold: rupees,
    giftWrapEnabled: z.boolean(),
    giftWrapCharge: rupees,
    returnWindowDays: days,
    returnShippingPaidBy: z.enum(["customer", "merchant"]),
    handlingTimeMinDays: days,
    handlingTimeMaxDays: days,
    transitTimeMinDays: days,
    transitTimeMaxDays: days,
  })
  /**
   * A range whose maximum is below its minimum is not a slow estimate, it is a
   * typo — and one that structured data would publish as an impossible delivery
   * window. Caught here rather than normalised silently: swapping the two for
   * the admin would hide the mistake in the one place they could still see it.
   */
  .refine((v) => v.handlingTimeMaxDays >= v.handlingTimeMinDays, {
    message: "Dispatch: the maximum cannot be less than the minimum.",
    path: ["handlingTimeMaxDays"],
  })
  .refine((v) => v.transitTimeMaxDays >= v.transitTimeMinDays, {
    message: "Delivery: the maximum cannot be less than the minimum.",
    path: ["transitTimeMaxDays"],
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
  await requireRole("admin");

  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid settings." };
  }
  const data = parsed.data;

  const next: StoreSettings = {
    codEnabled: data.codEnabled,
    guestCheckoutEnabled: data.guestCheckoutEnabled,
    shippingChargePaise: Math.round(data.shippingCharge * 100),
    freeShippingThresholdPaise: Math.round(data.freeShippingThreshold * 100),
    giftWrapEnabled: data.giftWrapEnabled,
    giftWrapChargePaise: Math.round(data.giftWrapCharge * 100),
    returnWindowDays: data.returnWindowDays,
    returnShippingPaidBy: data.returnShippingPaidBy,
    handlingTimeMinDays: data.handlingTimeMinDays,
    handlingTimeMaxDays: data.handlingTimeMaxDays,
    transitTimeMinDays: data.transitTimeMinDays,
    transitTimeMaxDays: data.transitTimeMaxDays,
  };

  try {
    await saveStoreSettings(next);
  } catch (err) {
    console.error("saveStoreSettingsAction failed", err);
    return { ok: false, error: "Could not save the settings. Please try again." };
  }

  updateTag(STORE_SETTINGS_TAG);
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
