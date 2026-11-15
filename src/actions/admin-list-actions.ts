"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/server/db";
import { requireOwner } from "@/server/auth/require-role";
import { logActivity } from "@/server/activity/log";

/**
 * Owner tools for the two simple lists: newsletter subscribers and abandoned
 * carts. Owner-only and logged, like every other edit or delete.
 */
export type ListActionResult = { ok: true; message?: string } | { ok: false; error: string };

// ─── Newsletter ─────────────────────────────────────────────────────────────

/** Add someone by hand — e.g. a customer who asked in the shop. */
export async function addSubscriberAction(email: string): Promise<ListActionResult> {
  const session = await requireOwner();
  const parsed = z.string().trim().toLowerCase().email().safeParse(email);
  if (!parsed.success) return { ok: false, error: "That email does not look right." };

  const existing = await prisma.newsletterSubscriber.findUnique({ where: { email: parsed.data } });
  if (existing?.active) return { ok: false, error: "Already subscribed." };
  await prisma.newsletterSubscriber.upsert({
    where: { email: parsed.data },
    create: { email: parsed.data },
    update: { active: true },
  });
  await logActivity(session, {
    action: "newsletter.add",
    target: { type: "newsletter" },
    summary: `Added ${parsed.data} to the newsletter`,
  });
  revalidatePath("/admin/newsletter");
  return { ok: true };
}

/** Remove entirely (not just unsubscribe) — for a request to forget them. */
export async function removeSubscriberAction(id: string): Promise<ListActionResult> {
  const session = await requireOwner();
  const gone = await prisma.newsletterSubscriber.delete({ where: { id } }).catch(() => null);
  if (!gone) return { ok: false, error: "Already removed." };
  await logActivity(session, {
    action: "newsletter.remove",
    target: { type: "newsletter" },
    summary: "Removed a subscriber from the newsletter",
  });
  revalidatePath("/admin/newsletter");
  return { ok: true };
}

// ─── Abandoned carts ────────────────────────────────────────────────────────

/** Empty one shopper's cart. Their account is untouched. */
export async function clearCartAction(cartId: string): Promise<ListActionResult> {
  const session = await requireOwner();
  const removed = await prisma.cartItem.deleteMany({ where: { cartId } });
  await logActivity(session, {
    action: "cart.clear",
    target: { type: "cart", id: cartId },
    summary: `Cleared an abandoned cart (${removed.count} item${removed.count === 1 ? "" : "s"})`,
  });
  revalidatePath("/admin/carts");
  revalidatePath("/admin");
  return { ok: true };
}

/** Empty every cart nobody has touched for `days` days. */
export async function clearOldCartsAction(days: number): Promise<ListActionResult> {
  const session = await requireOwner();
  const d = Math.max(7, Math.min(365, Math.round(Number(days) || 30)));
  const cutoff = new Date(Date.now() - d * 24 * 60 * 60 * 1000);

  // A cart is old when its NEWEST item is older than the cutoff — one fresh
  // addition means the shopper is still around.
  const stale = await prisma.cart.findMany({
    where: { items: { some: {}, none: { updatedAt: { gte: cutoff } } } },
    select: { id: true },
  });
  const removed = await prisma.cartItem.deleteMany({
    where: { cartId: { in: stale.map((c) => c.id) } },
  });
  await logActivity(session, {
    action: "cart.clear",
    target: { type: "cart" },
    summary: `Cleared ${stale.length} cart${stale.length === 1 ? "" : "s"} untouched for ${d} days (${removed.count} items)`,
  });
  revalidatePath("/admin/carts");
  revalidatePath("/admin");
  return {
    ok: true,
    message: stale.length
      ? `Cleared ${stale.length} cart${stale.length === 1 ? "" : "s"}.`
      : `No carts older than ${d} days.`,
  };
}
