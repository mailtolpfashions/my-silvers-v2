import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/server/auth/auth";
import { getUserOrder } from "@/server/orders/queries";
import { OrderDetail } from "@/components/storefront/orders/order-detail";
import { getReviewableItems } from "@/server/reviews/reviewable-items";
import { CancelOrderButton } from "@/components/storefront/orders/cancel-order-button";
import { RequestReturnButton } from "@/components/storefront/orders/request-return-button";
import { Skeleton } from "@/components/ui/skeleton";

const CANCELLABLE = ["placed", "confirmed", "processing"] as const;

/**
 * ⚠️  The page body is deliberately EMPTY of data access.
 *
 * With `cacheComponents` on, an uncached read outside a `<Suspense>` boundary
 * is an error, not a preference: Next refuses to prerender a shell for the
 * route and the navigation becomes blocking. This page used to `await auth()`
 * on its first line, which meant nothing could be sent until the session, the
 * order and the reviewable items had all resolved — a measured 9.2s on a cold
 * request, with a blank screen for the whole of it.
 *
 * `auth()` reads cookies and the order is per-shopper, so neither `"use cache"`
 * nor `instant = false` is the right answer — the first is impossible and the
 * second only silences the warning while keeping the blocking behaviour.
 * Streaming is the fix: the shell paints immediately and the per-shopper part
 * arrives when it can.
 *
 * Same shape as the admin layout's AdminGate, and for the same reason.
 */
export default function AccountOrderDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ placed?: string }>;
}) {
  return (
    <div className="container-checkout rhythm-transactional">
      <Suspense fallback={<OrderDetailSkeleton />}>
        <OrderDetailContent params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function OrderDetailContent({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ placed?: string }>;
}) {
  const session = await auth();
  const { id } = await params;
  if (!session?.user?.id) redirect(`/login?redirect=/account/orders/${id}`);

  const [order, { placed }, reviewable] = await Promise.all([
    getUserOrder(id, session.user.id),
    searchParams,
    // Empty unless this order is delivered — reviewing is gated on receipt.
    getReviewableItems(id, session.user.id),
  ]);
  if (!order) notFound();

  const cancellable =
    (CANCELLABLE as readonly string[]).includes(order.orderStatus) &&
    !order.shipmentCreatedAt;

  const invoiceAvailable =
    order.orderStatus !== "cancelled" &&
    (order.paymentStatus === "paid" || order.paymentMethod === "cod");

  return (
    <>
      {placed && (
        <p className="mb-6 rounded-md bg-green-50 px-4 py-3 text-sm text-green-800">
          Thank you! Your order has been placed successfully.
        </p>
      )}
      <OrderDetail order={order} reviewable={reviewable} />
      {(cancellable || order.orderStatus === "delivered" || invoiceAvailable) && (
        <div className="mt-6 flex flex-wrap items-center gap-3">
          {cancellable && (
            <CancelOrderButton orderId={order.id} wasPaid={order.paymentStatus === "paid"} />
          )}
          {order.orderStatus === "delivered" && <RequestReturnButton orderId={order.id} />}
          {/* Same condition the invoice route enforces — offering a link that
              404s is worse than not offering one. */}
          {invoiceAvailable && (
            <Link href={`/account/orders/${order.id}/invoice`} className="text-sm underline">
              View tax invoice
            </Link>
          )}
        </div>
      )}
    </>
  );
}

/** Roughly the geometry of a resolved order, so nothing jumps when it lands. */
function OrderDetailSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-24 w-full" />
      <div className="space-y-4">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
      <Skeleton className="h-32 w-full" />
    </div>
  );
}
