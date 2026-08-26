import { Suspense } from "react";
import Link from "next/link";
import Image from "next/image";
import { auth } from "@/server/auth/auth";
import { getCartWithProducts } from "@/server/cart";
import { CartRecommendations } from "@/components/storefront/cart/cart-recommendations";
import { toPaise, MAX_ITEM_QUANTITY, type ShippingRates } from "@/server/orders/money";
import { getStoreSettings } from "@/server/settings/store-settings";
import { formatINR, savingPaise } from "@/lib/format";
import { EmptyCart } from "@/components/storefront/cart/empty-cart";
import { CartSummary } from "@/components/storefront/cart/cart-summary";
import { CartRowControls } from "@/components/storefront/cart/cart-row-controls";
import { GuestCartView } from "@/components/storefront/cart/guest-cart-view";
import { STICKY_BAR_SPACER } from "@/components/storefront/sticky-action-bar";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * The heading prerenders; which cart to show does not.
 *
 * `auth()` decides between the signed-in cart and the guest one, and reading it
 * in the page body made the whole route uncached under cacheComponents — so
 * even the title waited on the session. Behind a boundary, the shell paints at
 * once and the cart fills in.
 */
export default function CartPage() {
  return (
    // Transactional rhythm — 32/40/56. A cart is a single task, and the
    // editorial 160px used elsewhere on the site would just be scrolling
    // between the shopper and the checkout button.
    // The recommendations row breaks out of this container — see the note in
    // cart-recommendations.tsx.
    // The spacer stops the sticky checkout bar covering the last cart row.
    <div className={`container-checkout rhythm-transactional ${STICKY_BAR_SPACER}`}>
      <h1 className="mb-8 text-h1">Your cart</h1>
      <Suspense fallback={<CartSkeleton />}>
        <CartBody />
      </Suspense>
    </div>
  );
}

async function CartBody() {
  const session = await auth();
  // Both carts quote a shipping charge, so both need the current rates. Read
  // once here rather than in each branch — it is a cached lookup either way,
  // but one call keeps the two carts quoting the same number by construction.
  const { shippingChargePaise, freeShippingThresholdPaise } = await getStoreSettings();
  const rates: ShippingRates = { shippingChargePaise, freeShippingThresholdPaise };

  return session?.user?.id ? (
    <AuthedCart userId={session.user.id} rates={rates} />
  ) : (
    <GuestCartView rates={rates} />
  );
}

/** Two rows and a summary column — the cart's usual shape. */
function CartSkeleton() {
  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_20rem] lg:gap-16">
      <div className="space-y-6">
        {Array.from({ length: 2 }, (_, i) => (
          <Skeleton key={i} className="h-32 w-full" />
        ))}
      </div>
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

async function AuthedCart({ userId, rates }: { userId: string; rates: ShippingRates }) {
  const cart = await getCartWithProducts(userId);
  const rows = (cart?.items ?? []).filter((i) => i.product.isActive);

  if (rows.length === 0) return <EmptyCart />;

  const subtotalPaise = rows.reduce(
    (sum, i) => sum + toPaise(i.product.price) * i.quantity,
    0
  );

  // Totalled the same way as the subtotal, and by the same definition of a
  // saving the product pages state one by — see savingPaise. Matches
  // guest-cart-view.tsx, so both carts report the same figure.
  const savedPaise = rows.reduce(
    (sum, i) =>
      sum +
      savingPaise(i.product.price.toString(), i.product.compareAtPrice?.toString()) * i.quantity,
    0
  );

  return (
    <>
      <div className="grid gap-10 lg:grid-cols-[1fr_20rem] lg:gap-16">
        {/* Hairline-separated rows, not bordered cards. A cart of six boxed
            cards reads as six unrelated objects; a ruled list reads as one
            order — which is what it is. */}
        <ul className="border-t">
          {rows.map((item) => (
            <li key={item.id} className="flex gap-5 border-b py-6">
              {/* 96×120 portrait, matching the 4:5 crop the rest of the site
                  uses. It was an 80px rounded square, which cropped the piece
                  differently here than on the page the shopper just came from. */}
              <Link
                href={`/products/${item.product.slug}`}
                className="relative h-[7.5rem] w-24 shrink-0 overflow-hidden bg-muted"
              >
                {item.product.images[0] && (
                  <Image
                    src={item.product.images[0]}
                    alt={item.product.name}
                    fill
                    sizes="96px"
                    className="object-cover"
                  />
                )}
              </Link>

              {/* On a phone the stepper and the bin take ~150px of a ~230px
                  content column, which left the name wrapping one word per
                  line. Below sm the controls drop to their own line under the
                  name; from sm up there is room for a single row. */}
              <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-start sm:gap-6">
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/products/${item.product.slug}`}
                    className="line-clamp-2 text-sm font-medium decoration-black/60 underline-offset-4 hover:underline"
                  >
                    {item.product.name}
                  </Link>
                  {item.size && (
                    <p className="mt-1 text-xs text-muted-foreground">Size {item.size}</p>
                  )}
                  {/* Foreground and a step up from the name, not 14px grey. A
                      price set quieter than the product it belongs to is the
                      wrong way round in a cart. Matches guest-cart-view.tsx.

                      The compare-at is struck to its left when there is a
                      genuine saving on the line, so the discount is visible
                      against the PIECE and not only totalled in the summary
                      column — where a shopper reading the item rows never
                      looks. Guarded by savingPaise rather than a bare
                      `compareAt > price`, so a row cannot show a strike the
                      summary refuses to count. */}
                  <p className="mt-2 flex items-baseline gap-2 text-base font-semibold text-foreground">
                    {savingPaise(
                      item.product.price.toString(),
                      item.product.compareAtPrice?.toString()
                    ) > 0 && (
                      <span className="text-sm font-normal text-muted-foreground line-through">
                        {formatINR(item.product.compareAtPrice!.toString())}
                      </span>
                    )}
                    <span>{formatINR(item.product.price.toString())}</span>
                  </p>
                  {/* No count — see src/lib/stock-label.ts. */}
                  {item.product.stock < item.quantity && (
                    <p className="mt-2 text-xs text-destructive">
                      {item.product.stock === 0
                        ? "Now out of stock"
                        : "We have fewer of these than you've added"}
                    </p>
                  )}
                </div>
                <CartRowControls
                  productId={item.productId}
                  size={item.size}
                  quantity={item.quantity}
                  maxQuantity={Math.min(MAX_ITEM_QUANTITY, item.product.stock)}
                />
              </div>
            </li>
          ))}
        </ul>

        {/* Sticky from lg: on a wide screen the summary would otherwise sit at
            the top of a column while the shopper reads the bottom of the list. */}
        <div className="lg:sticky lg:top-[7.5rem]">
          <CartSummary subtotalPaise={subtotalPaise} savedPaise={savedPaise} rates={rates} />
        </div>
      </div>

      <CartRecommendations
        excludeProductIds={rows.map((r) => r.productId)}
        subtotalPaise={subtotalPaise}
      />
    </>
  );
}

