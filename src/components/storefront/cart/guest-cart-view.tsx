"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import Image from "next/image";
import { Minus, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CartSummary } from "@/components/storefront/cart/cart-summary";
import {
  subscribeGuestCart,
  getGuestCartSnapshot,
  getGuestCartServerSnapshot,
  setGuestCartQuantity,
  removeFromGuestCart,
} from "@/lib/guest-cart";
import { formatINR } from "@/lib/format";
import { EmptyCart } from "@/components/storefront/cart/empty-cart";
import { MAX_ITEM_QUANTITY } from "@/server/orders/money";

type Summary = {
  id: string;
  name: string;
  slug: string;
  price: string;
  image: string | null;
  stock: number;
};

export function GuestCartView() {
  const items = useSyncExternalStore(
    subscribeGuestCart,
    getGuestCartSnapshot,
    getGuestCartServerSnapshot
  );
  const hydrated = useSyncExternalStore(
    subscribeGuestCart,
    () => true,
    () => false
  );
  const [products, setProducts] = useState<Map<string, Summary>>(new Map());

  const idsKey = items.map((i) => i.productId).join(",");

  useEffect(() => {
    if (!idsKey) return;
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/products/summaries?ids=${encodeURIComponent(idsKey)}`);
        const data = (await res.json()) as { products: Summary[] };
        if (alive) setProducts(new Map(data.products.map((p) => [p.id, p])));
      } catch {
        // Keep whatever we had; the page still renders.
      }
    })();
    return () => {
      alive = false;
    };
  }, [idsKey]);

  // Wait for hydration and for the first product fetch before rendering, so
  // the empty-cart state doesn't flash while data is on its way.
  const awaitingProducts =
    items.length > 0 && items.every((i) => !products.has(i.productId));
  if (!hydrated || awaitingProducts) return null;

  // Drop cart entries whose product no longer exists/is inactive.
  const rows = items
    .map((item) => ({ item, product: products.get(item.productId) }))
    .filter((r): r is { item: (typeof items)[0]; product: Summary } => !!r.product);

  // One empty state for both cart flows — they had two different ones, with
  // different copy and different buttons.
  if (rows.length === 0) return <EmptyCart />;

  const subtotalPaise = rows.reduce(
    (sum, { item, product }) => sum + Math.round(Number(product.price) * 100) * item.quantity,
    0
  );

  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_20rem] lg:gap-16">
      <ul className="border-t">
        {rows.map(({ item, product }) => (
          // Layout mirrors the signed-in cart row exactly — see the note in
          // app/(storefront)/cart/page.tsx for why the controls wrap below sm.
          <li key={`${product.id}::${item.size}`} className="flex gap-5 border-b py-6">
            <Link
              href={`/products/${product.slug}`}
              className="relative h-[7.5rem] w-24 shrink-0 overflow-hidden bg-muted"
            >
              {product.image && (
                <Image
                  src={product.image}
                  alt={product.name}
                  fill
                  sizes="96px"
                  className="object-cover"
                />
              )}
            </Link>
            <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-start sm:gap-6">
              <div className="min-w-0 flex-1">
                <Link
                  href={`/products/${product.slug}`}
                  className="line-clamp-2 text-sm font-medium decoration-black/60 underline-offset-4 hover:underline"
                >
                  {product.name}
                </Link>
                {item.size && (
                  <p className="mt-1 text-xs text-muted-foreground">Size {item.size}</p>
                )}
                {/* Matches the signed-in cart's row — see cart/page.tsx. */}
                <p className="mt-2 text-base font-semibold text-foreground">
                  {formatINR(product.price)}
                </p>
                {/* No count, matching src/lib/stock-label.ts and the signed-in
                    cart — this row said "Only 2 left" while every other surface
                    on the site deliberately refuses to state a number. */}
                {product.stock < item.quantity && (
                  <p className="mt-2 text-xs text-destructive">
                    {product.stock === 0
                      ? "Now out of stock"
                      : "We have fewer of these than you've added"}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  disabled={item.quantity <= 1}
                  onClick={() => setGuestCartQuantity(product.id, item.size, item.quantity - 1)}
                  aria-label="Decrease quantity"
                >
                  <Minus />
                </Button>
                <span className="w-8 text-center text-sm tabular-nums">{item.quantity}</span>
                <Button
                  variant="outline"
                  size="icon"
                  disabled={item.quantity >= Math.min(MAX_ITEM_QUANTITY, product.stock)}
                  onClick={() => setGuestCartQuantity(product.id, item.size, item.quantity + 1)}
                  aria-label="Increase quantity"
                >
                  <Plus />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="ml-auto sm:ml-0"
                  onClick={() => removeFromGuestCart(product.id, item.size)}
                  aria-label="Remove from cart"
                >
                  <Trash2 />
                </Button>
              </div>
            </div>
          </li>
        ))}
      </ul>
      <div className="lg:sticky lg:top-[7.5rem]">
        <CartSummary subtotalPaise={subtotalPaise} />
        <p className="mt-3 text-center text-xs text-muted-foreground">
          <Link href="/login?redirect=/cart" className="underline">
            Sign in
          </Link>{" "}
          to save your cart across devices.
        </p>
      </div>
    </div>
  );
}
