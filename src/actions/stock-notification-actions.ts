"use server";

import { z } from "zod";
import { prisma } from "@/server/db";
import { subscribeToStock } from "@/server/products/stock-notifications";
import { checkIpRateLimit, RATE_LIMIT_MESSAGE } from "@/server/rate-limit/limiter";
import {
  isDisposableEmail,
  DISPOSABLE_EMAIL_MESSAGE,
} from "@/server/auth/disposable-email";

const schema = z.object({
  productId: z.string().min(1),
  // Empty string is the real value for an unsized product, not a missing one.
  size: z.string().max(30).optional(),
  email: z.string().trim().email("Please enter a valid email address.").max(200),
});

export type NotifyResult = { ok: true } | { ok: false; error: string };

/**
 * "Tell me when this is back."
 *
 * Guarded like the newsletter, because it is the same shape of thing — an
 * unauthenticated endpoint that stores an email address someone typed.
 *
 * ⚠️  The product is re-read here rather than trusted from the form. Without
 * it this writes a row against any id posted to it, including one that is not
 * a product at all, and the waiting list fills with records nobody can ever be
 * told about. The stock check matters too: registering for something already in
 * stock produces an alert that will never fire, since only a 0 → positive
 * transition sends.
 */
export async function notifyWhenBackAction(input: unknown): Promise<NotifyResult> {
  if (!(await checkIpRateLimit("newsletter"))) {
    return { ok: false, error: RATE_LIMIT_MESSAGE };
  }

  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid request." };
  }
  const { productId, email } = parsed.data;
  const size = parsed.data.size ?? "";

  if (await isDisposableEmail(email)) {
    return { ok: false, error: DISPOSABLE_EMAIL_MESSAGE };
  }

  const product = await prisma.product.findFirst({
    where: { id: productId, isActive: true },
    select: {
      id: true,
      sizes: true,
      variants: { select: { size: true, stock: true } },
      stock: true,
    },
  });
  if (!product) return { ok: false, error: "That piece is no longer available." };

  // A size that this product does not offer would wait forever — no restock of
  // it can ever match. Empty is only valid on a product with no sizes at all.
  if (size ? !product.sizes.includes(size) : product.sizes.length > 0) {
    return { ok: false, error: "Please choose a size first." };
  }

  const inStock = size
    ? (product.variants.find((v) => v.size === size)?.stock ?? 0) > 0
    : product.stock > 0;
  if (inStock) return { ok: false, error: "Good news — this is in stock right now." };

  try {
    await subscribeToStock({ productId, size, email });
    return { ok: true };
  } catch (err) {
    console.error("notifyWhenBackAction failed", err);
    return { ok: false, error: "Could not save that. Please try again." };
  }
}
