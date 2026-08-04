import { NextResponse } from "next/server";
import { auth } from "@/server/auth/auth";
import { getCartQuantityMap, getWishlistProductIds } from "@/server/cart";

/**
 * The signed-in shopper's wishlist ids and cart quantities, in one request.
 *
 * This replaces threading the same two facts through every ProductCard as
 * server props, which is what made listing pages uncacheable. Guests short
 * circuit without touching the database — their cart lives in localStorage.
 */
export async function GET() {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json(
      { isAuthed: false, wishlist: [], cart: {} },
      // Never store this at any layer — it is per-shopper by definition, and a
      // shared cache hit here would leak one customer's cart to another.
      { headers: { "Cache-Control": "private, no-store" } }
    );
  }

  const [wishlist, cart] = await Promise.all([
    getWishlistProductIds(userId),
    getCartQuantityMap(userId),
  ]);

  return NextResponse.json(
    {
      isAuthed: true,
      wishlist: [...wishlist],
      cart: Object.fromEntries(cart),
    },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
