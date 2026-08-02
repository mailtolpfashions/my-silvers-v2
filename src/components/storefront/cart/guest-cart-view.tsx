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
    (sum, { item, product }) => sum + Math.round(Number(product.price) * 100) * item.quantity,
    0
  );

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
      <div className="space-y-4">
        {rows.map(({ item, product }) => (
          <div key={product.id} className="flex items-center gap-4 rounded-lg border p-4">
            <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-md bg-muted">
              {product.image && (
                <Image src={product.image} alt={product.name} fill className="object-cover" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <Link href={`/products/${product.slug}`} className="text-sm font-medium hover:underline">
                {product.name}
              </Link>
              <p className="mt-1 text-sm text-muted-foreground">{formatINR(product.price)}</p>
              {product.stock < item.quantity && (
                <p className="mt-1 text-xs text-destructive">Only {product.stock} left</p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                disabled={item.quantity <= 1}
                onClick={() => setGuestCartQuantity(product.id, item.quantity - 1)}
                aria-label="Decrease quantity"
              >
                <Minus />
              </Button>
              <span className="w-8 text-center text-sm tabular-nums">{item.quantity}</span>
              <Button
                variant="outline"
                size="icon"
                disabled={item.quantity >= Math.min(MAX_ITEM_QUANTITY, product.stock)}
                onClick={() => setGuestCartQuantity(product.id, item.quantity + 1)}
                aria-label="Increase quantity"
              >
                <Plus />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => removeFromGuestCart(product.id)}
                aria-label="Remove from cart"
              >
                <Trash2 />
              </Button>
            </div>
          </div>
        ))}
      </div>
      <div>
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
