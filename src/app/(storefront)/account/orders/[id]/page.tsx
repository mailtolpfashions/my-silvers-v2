import { notFound, redirect } from "next/navigation";
import { auth } from "@/server/auth/auth";
import { getUserOrder } from "@/server/orders/queries";
import { OrderDetail } from "@/components/storefront/orders/order-detail";
import { getReviewableItems } from "@/server/reviews/reviewable-items";
import { CancelOrderButton } from "@/components/storefront/orders/cancel-order-button";
import { RequestReturnButton } from "@/components/storefront/orders/request-return-button";

const CANCELLABLE = ["placed", "confirmed", "processing"] as const;

export default async function AccountOrderDetailPage({
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

  return (
    <div className="container-checkout py-10">
      {placed && (
        <p className="mb-6 rounded-md bg-green-50 px-4 py-3 text-sm text-green-800">
          Thank you! Your order has been placed successfully.
        </p>
      )}
      <OrderDetail order={order} reviewable={reviewable} />
      {(cancellable || order.orderStatus === "delivered") && (
        <div className="mt-6 flex gap-3">
          {cancellable && (
            <CancelOrderButton orderId={order.id} wasPaid={order.paymentStatus === "paid"} />
          )}
          {order.orderStatus === "delivered" && <RequestReturnButton orderId={order.id} />}
        </div>
      )}
    </div>
  );
}
