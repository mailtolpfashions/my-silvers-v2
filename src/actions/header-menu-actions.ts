"use server";

import { z } from "zod";
import { revalidatePath, updateTag } from "next/cache";
import { requireRole } from "@/server/auth/require-role";
import { logActivity } from "@/server/activity/log";
import {
  getStoreSettings,
  NAV_FILTER_LIMITS,
  NAV_MENU_TAG,
  saveStoreSettings,
  STORE_SETTINGS_TAG,
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

const headerMenuSchema = z.object({
  navFinishes: navFilters("Finishes"),
  navOccasions: navFilters("Occasions"),
  navShopFor: navFilters("Shop for", "collection"),
});

/**
 * Studio → Header menu. Staff (admin and editor), like the rest of Studio —
 * the owner chose to let staff edit it (Nov 2026); every save is in the
 * activity log. Only the three lists are written; every other store setting
 * is carried over exactly as it was.
 */
export async function saveHeaderMenuAction(
  input: unknown
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await requireRole("admin", "editor");
  const parsed = headerMenuSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid header menu." };
  }
  const before = await getStoreSettings();
  const next = { ...before, ...parsed.data };
  const changed =
    JSON.stringify([before.navFinishes, before.navOccasions, before.navShopFor]) !==
    JSON.stringify([next.navFinishes, next.navOccasions, next.navShopFor]);
  if (!changed) return { ok: true };

  try {
    await saveStoreSettings(next);
  } catch (err) {
    console.error("saveHeaderMenuAction failed", err);
    return { ok: false, error: "Could not save the header menu. Please try again." };
  }
  await logActivity(session, {
    action: "cms.header-menu",
    target: { type: "settings", id: "header-menu" },
    summary: `Updated the header menu (${next.navShopFor.length} shop-for, ${next.navFinishes.length} finishes, ${next.navOccasions.length} occasions)`,
  });
  updateTag(STORE_SETTINGS_TAG);
  // The header is on every page — its own tag, expired only on a real change.
  updateTag(NAV_MENU_TAG);
  revalidatePath("/cms/header-menu");
  return { ok: true };
}
