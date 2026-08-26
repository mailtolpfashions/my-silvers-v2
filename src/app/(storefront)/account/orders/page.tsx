import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/server/auth/auth";
import { getUserOrders } from "@/server/orders/queries";
import { OrderStatusBadges } from "@/components/storefront/orders/order-detail";
import { formatINR } from "@/lib/format";
import { EditorialLink } from "@/components/storefront/editorial-link";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * The heading is the same for everyone, so it prerenders; the list is not, so
 * it streams. Reading the session in the page body — which is what this did —
 * makes the whole route uncached under cacheComponents, and even the title
 * then waits on the database.
 */
export default function AccountOrdersPage() {
  return (
    <div className="container-checkout rhythm-transactional">
      <h1 className="mb-8 text-h1">Your orders</h1>
      <Suspense fallback={<OrdersSkeleton />}>
        <OrdersList />
      </Suspense>
    </div>
  );
}

async function OrdersList() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login?redirect=/account/orders");

  const orders = await getUserOrders(session.user.id);

  if (orders.length === 0) {
    return (
      // Matches the cart and wishlist empties: a heading at text-h3, a sentence
      // that says what the page will hold, then an editorial link.
      //
      // ⚠️  It was a muted line and a rounded <Button>. That button is the
      // /admin control language — see the note on the `cta` and `editorial`
      // variants in ui/button.tsx — and it was the only place on the shopping
      // side of the storefront still using it. Three empty states in three
      // shapes is how a site starts feeling assembled rather than designed.
      <div className="rhythm-commerce text-center">
        <p className="text-h3">No orders yet</p>
        <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">
          Once you order, everything you have bought lives here — with tracking, invoices
          and the place to write a review.
        </p>
        <div className="mt-8 flex justify-center">
          <EditorialLink href="/products">Browse all jewellery</EditorialLink>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {orders.map((order) => (
        <Link
          key={order.id}
          href={`/account/orders/${order.id}`}
          className="block border-b py-5 transition-colors hover:text-black"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="font-medium">{order.orderNumber}</p>
              <p className="text-sm text-muted-foreground">
                {order.createdAt.toLocaleDateString("en-IN", { dateStyle: "medium" })} ·{" "}
                {order.items.length} item{order.items.length === 1 ? "" : "s"}
              </p>
              {/* Lifted out of the grey metadata run it used to sit in, at
                  the tail of "date · 2 items · ₹5,000". The amount is what a
                  shopper scans an order list for, and it was the third
                  clause of a muted sentence. Its own line, at the same 16px
                  semibold every other price on the storefront now uses. */}
              <p className="mt-1.5 text-base font-semibold text-foreground">
                {formatINR(order.totalAmount.toString())}
              </p>
            </div>
            <OrderStatusBadges order={order} />
          </div>
        </Link>
      ))}
    </div>
  );
}

/** Four rows, roughly an order's height each. */
function OrdersSkeleton() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 4 }, (_, i) => (
        <Skeleton key={i} className="h-24 w-full" />
      ))}
    </div>
  );
}
