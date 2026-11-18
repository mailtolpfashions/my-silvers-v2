"use server";

import { revalidatePath } from "next/cache";
import { requireOwner } from "@/server/auth/require-role";
import { logActivity } from "@/server/activity/log";
import { saveCostingDefaults } from "@/server/settings/costing-config";

/** Settings → Costing. Owner only, like everything about costs. */
export async function saveCostingDefaultsAction(
  input: unknown
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await requireOwner();
  try {
    const saved = await saveCostingDefaults(input);
    await logActivity(session, {
      action: "settings.update",
      target: { type: "settings", id: "costing" },
      summary: `Updated costing (margins ${saved.margins.under1k}% / ${saved.margins.upTo10k}% / ${saved.margins.over10k}%)`,
    });
    revalidatePath("/admin/settings");
    revalidatePath("/admin/products");
    return { ok: true };
  } catch (err) {
    console.error("saveCostingDefaultsAction failed", err);
    return { ok: false, error: "Could not save the costing defaults." };
  }
}
