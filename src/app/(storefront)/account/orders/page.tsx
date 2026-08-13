import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/server/auth/auth";
import { getUserOrders } from "@/server/orders/queries";
import { OrderStatusBadges } from "@/components/storefront/orders/order-detail";
import { formatINR } from "@/lib/format";
import { Button } from "@/components/ui/button";

export default async function AccountOrdersPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login?redirect=/account/orders");

  const orders = await getUserOrders(session.user.id);

  return (
    <div className="container-checkout rhythm-transactional">
      <h1 className="mb-8 text-h1">Your orders</h1>

      {orders.length === 0 ? (
        <div className="rhythm-commerce text-center">
          <p className="text-muted-foreground">You haven&apos;t placed any orders yet.</p>
          <Button asChild className="mt-4">
            <Link href="/products">Start shopping</Link>
          </Button>
        </div>
      ) : (
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
      )}
    </div>
  );
}
