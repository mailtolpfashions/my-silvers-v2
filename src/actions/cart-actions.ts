"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/server/auth/auth";
import * as cart from "@/server/cart";

async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("UNAUTHENTICATED");
  return session.user.id;
}

export async function addToCartAction(productId: string, quantity = 1) {
  const userId = await requireUserId();
  await cart.addToCart(userId, productId, quantity);
  revalidatePath("/cart");
  return { ok: true as const };
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
