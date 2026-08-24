import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/server/auth/auth";
import { getUserOrders } from "@/server/orders/queries";
import { OrderStatusBadges } from "@/components/storefront/orders/order-detail";
import { formatINR } from "@/lib/format";
import { Button } from "@/components/ui/button";
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
      <div className="rhythm-commerce text-center">
        <p className="text-muted-foreground">You haven&apos;t placed any orders yet.</p>
        <Button asChild className="mt-4">
          <Link href="/products">Start shopping</Link>
        </Button>
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
