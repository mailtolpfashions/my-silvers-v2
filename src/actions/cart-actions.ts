"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/server/auth/auth";
import * as cart from "@/server/cart";

async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("UNAUTHENTICATED");
  return session.user.id;
}

export type AddToCartResult =
  | { ok: true }
  | { ok: false; reason: "out_of_stock" | "stock_limit" | "unavailable" };

export async function addToCartAction(
  productId: string,
  quantity = 1
): Promise<AddToCartResult> {
  const userId = await requireUserId();
  try {
    await cart.addToCart(userId, productId, quantity);
  } catch (error) {
    // Returned rather than thrown: these are ordinary outcomes the shopper
    // needs explaining, not failures.
    if (error instanceof cart.OutOfStockError) return { ok: false, reason: "out_of_stock" };
    if (error instanceof cart.StockLimitReachedError) return { ok: false, reason: "stock_limit" };
    if (error instanceof Error && error.message === "PRODUCT_UNAVAILABLE") {
      return { ok: false, reason: "unavailable" };
    }
    throw error;
  }
  revalidatePath("/cart");
  return { ok: true };
}

export async function setCartQuantityAction(productId: string, quantity: number) {
  const userId = await requireUserId();
  await cart.setCartItemQuantity(userId, productId, quantity);
  revalidatePath("/cart");
  return { ok: true as const };
}

export async function removeFromCartAction(productId: string) {
  const userId = await requireUserId();
  await cart.removeFromCart(userId, productId);
  revalidatePath("/cart");
  return { ok: true as const };
}

export async function toggleWishlistAction(productId: string) {
  const userId = await requireUserId();
  const added = await cart.toggleWishlist(userId, productId);
  revalidatePath("/wishlist");
  return { ok: true as const, added };
}
