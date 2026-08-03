import Link from "next/link";
import Image from "next/image";
import { auth } from "@/server/auth/auth";
import {
  getCartWithProducts,
  getWishlistProductIds,
  getCartQuantityMap,
} from "@/server/cart";
import { CartRecommendations } from "@/components/storefront/cart/cart-recommendations";
import { toPaise, MAX_ITEM_QUANTITY } from "@/server/orders/money";
import { formatINR } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { CartSummary } from "@/components/storefront/cart/cart-summary";
import { CartRowControls } from "@/components/storefront/cart/cart-row-controls";
import { GuestCartView } from "@/components/storefront/cart/guest-cart-view";

export default async function CartPage() {
  const session = await auth();

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="mb-8 text-2xl font-semibold">Your cart</h1>
      {session?.user?.id ? <AuthedCart userId={session.user.id} /> : <GuestCartView />}
    </div>
  );
}

async function AuthedCart({ userId }: { userId: string }) {
  const [cart, wishlistIds, cartQuantities] = await Promise.all([
    getCartWithProducts(userId),
    getWishlistProductIds(userId),
    getCartQuantityMap(userId),
  ]);
  const rows = (cart?.items ?? []).filter((i) => i.product.isActive);

  if (rows.length === 0) {
    return (
      <div className="py-16 text-center">
        <p className="text-muted-foreground">Your cart is empty.</p>
        <Button asChild className="mt-4">
          <Link href="/products">Continue shopping</Link>
        </Button>
      </div>
    );
  }

  const subtotalPaise = rows.reduce(
    (sum, i) => sum + toPaise(i.product.price) * i.quantity,
    0
  );

  return (
    <>
    <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
      <div className="space-y-4">
        {rows.map((item) => (
          <div key={item.id} className="flex items-center gap-4 rounded-lg border p-4">
            <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-md bg-muted">
              {item.product.images[0] && (
                <Image
                  src={item.product.images[0]}
                  alt={item.product.name}
                  fill
                  className="object-cover"
                />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <Link
                href={`/products/${item.product.slug}`}
                className="text-sm font-medium hover:underline"
              >
                {item.product.name}
              </Link>
              <p className="mt-1 text-sm text-muted-foreground">
                {formatINR(item.product.price.toString())}
              </p>
              {/* No count — see src/lib/stock-label.ts. */}
              {item.product.stock < item.quantity && (
                <p className="mt-1 text-xs text-destructive">
                  {item.product.stock === 0
                    ? "Now out of stock"
                    : "We have fewer of these than you've added"}
                </p>
              )}
            </div>
            <CartRowControls
              productId={item.productId}
              quantity={item.quantity}
              maxQuantity={Math.min(MAX_ITEM_QUANTITY, item.product.stock)}
            />
          </div>
        ))}
      </div>
      <div>
        <CartSummary subtotalPaise={subtotalPaise} />
      </div>
    </div>

    <CartRecommendations
      excludeProductIds={rows.map((r) => r.productId)}
      subtotalPaise={subtotalPaise}
      isAuthed
      wishlistIds={wishlistIds}
      cartQuantities={cartQuantities}
    />
    </>
  );
}
