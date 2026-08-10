import Image from "next/image";
import { formatINR } from "@/lib/format";
import { OrderItemReview } from "@/components/storefront/orders/order-item-review";
import type { ReviewableItem } from "@/server/reviews/reviewable-items";
import type { Order, OrderItem } from "@/generated/prisma/client";

const ORDER_STATUS_LABELS: Record<Order["orderStatus"], string> = {
  placed: "Placed",
  confirmed: "Confirmed",
  processing: "Processing",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
  return_requested: "Return requested",
  returned: "Returned",
  refunded: "Refunded",
};

const PAYMENT_STATUS_LABELS: Record<Order["paymentStatus"], string> = {
  pending: "Payment pending",
  paying: "Payment processing",
  paid: "Paid",
  failed: "Payment failed",
  refunded: "Refunded",
};

/**
 * Order state, as quiet square labels.
 *
 * These are NOT the promotional pills removed from the product card. That badge
 * said "20% off" to sell something; these say "Shipped" and "Payment failed" —
 * functional state a customer needs, and the only place on the storefront where
 * a status chip is still the right answer. They take the square geometry and
 * hairline treatment of everything else rather than the rounded shadcn Badge,
 * which is sized and coloured for admin tables.
 */
function StatusLabel({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  /** `alert` for a state the customer has to act on or worry about. */
  tone?: "neutral" | "alert";
}) {
  return (
    <span
      className={`inline-flex items-center border px-2.5 py-1 text-[11px] uppercase tracking-[0.1em] ${
        tone === "alert"
          ? "border-destructive/40 bg-destructive/10 text-destructive"
          : "border-border text-muted-foreground"
      }`}
    >
      {children}
    </span>
  );
}

export function OrderStatusBadges({ order }: { order: Order }) {
  return (
    <div className="flex flex-wrap gap-2">
      <StatusLabel tone={order.orderStatus === "cancelled" ? "alert" : "neutral"}>
        {ORDER_STATUS_LABELS[order.orderStatus]}
      </StatusLabel>
      <StatusLabel tone={order.paymentStatus === "failed" ? "alert" : "neutral"}>
        {PAYMENT_STATUS_LABELS[order.paymentStatus]}
      </StatusLabel>
      <StatusLabel>{order.paymentMethod === "cod" ? "COD" : "Online"}</StatusLabel>
    </div>
  );
}

type Address = {
  fullName?: string;
  phone?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  pincode?: string;
};

export function OrderDetail({
  order,
  reviewable,
}: {
  order: Order & { items: OrderItem[] };
  /**
   * productId -> review affordance, for delivered orders only. Absent on the
   * guest order view, which has no signed-in shopper to attribute a review to.
   */
  reviewable?: Map<string, ReviewableItem>;
}) {
  const address = (order.shippingAddress ?? {}) as Address;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-h2">{order.orderNumber}</h1>
          <p className="text-sm text-muted-foreground">
            Placed {order.createdAt.toLocaleDateString("en-IN", { dateStyle: "medium" })}
          </p>
        </div>
        <OrderStatusBadges order={order} />
      </div>

      <section className="border-t pt-6">
        <h2 className="label-eyebrow mb-5">Items</h2>
        <div className="space-y-4">
          {order.items.map((item) => (
            <div key={item.id} className="flex items-center gap-4">
              <div className="relative h-20 w-16 shrink-0 overflow-hidden bg-muted">
                {item.image && (
                  <Image src={item.image} alt={item.name} fill className="object-cover" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{item.name}</p>
                {item.size && (
                  <p className="text-sm text-muted-foreground">Size: {item.size}</p>
                )}
                <p className="text-sm text-muted-foreground">
                  {formatINR(item.price.toString())} × {item.quantity}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-2">
                <p className="text-sm font-medium">
                  {formatINR(Number(item.price) * item.quantity)}
                </p>
                {/* Only present on delivered orders — see getReviewableItems. */}
                {item.productId && reviewable?.get(item.productId) && (
                  <OrderItemReview
                    productId={item.productId}
                    productSlug={reviewable.get(item.productId)!.slug}
                    productName={item.name}
                    existing={reviewable.get(item.productId)!.existing}
                  />
                )}
              </div>
            </div>
          ))}
          <div className="space-y-1 border-t pt-4 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span>{formatINR(order.subtotal.toString())}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Shipping</span>
              <span>
                {Number(order.shippingCharge) === 0
                  ? "Free"
                  : formatINR(order.shippingCharge.toString())}
              </span>
            </div>
            <div className="flex justify-between font-medium">
              <span>Total</span>
              <span>{formatINR(order.totalAmount.toString())}</span>
            </div>
          </div>
        </div>
      </section>

      <section className="border-t pt-6">
        <h2 className="label-eyebrow mb-5">Shipping address</h2>
        <div className="text-sm text-muted-foreground">
          <p className="text-foreground">{address.fullName}</p>
          <p>{address.addressLine1}</p>
          {address.addressLine2 && <p>{address.addressLine2}</p>}
          <p>
            {address.city}, {address.state} — {address.pincode}
          </p>
          <p className="mt-1">{address.phone}</p>
        </div>
      </section>

      {order.trackingNumber && (
        <section className="border-t pt-6">
          <h2 className="label-eyebrow mb-5">Tracking</h2>
          <div className="text-sm">
            <p>
              {order.courierName ? `${order.courierName} — ` : ""}
              {order.trackingUrl ? (
                <a
                  href={order.trackingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  {order.trackingNumber}
                </a>
              ) : (
                order.trackingNumber
              )}
            </p>
          </div>
        </section>
      )}
    </div>
  );
}
