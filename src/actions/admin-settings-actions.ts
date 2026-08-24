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

const settingsSchema = z.object({
  codEnabled: z.boolean(),
  guestCheckoutEnabled: z.boolean(),
  shippingCharge: rupees,
  freeShippingThreshold: rupees,
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

  return { ok: true };
}
