import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

export function OrderStatusBadges({ order }: { order: Order }) {
  return (
    <div className="flex flex-wrap gap-2">
      <Badge variant={order.orderStatus === "cancelled" ? "destructive" : "secondary"}>
        {ORDER_STATUS_LABELS[order.orderStatus]}
      </Badge>
      <Badge variant={order.paymentStatus === "failed" ? "destructive" : "outline"}>
        {PAYMENT_STATUS_LABELS[order.paymentStatus]}
      </Badge>
      <Badge variant="outline">{order.paymentMethod === "cod" ? "COD" : "Online"}</Badge>
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
          <h1 className="text-2xl font-semibold">{order.orderNumber}</h1>
          <p className="text-sm text-muted-foreground">
            Placed {order.createdAt.toLocaleDateString("en-IN", { dateStyle: "medium" })}
          </p>
        </div>
        <OrderStatusBadges order={order} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Items</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {order.items.map((item) => (
            <div key={item.id} className="flex items-center gap-4">
              <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-md bg-muted">
                {item.image && (
                  <Image src={item.image} alt={item.name} fill className="object-cover" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{item.name}</p>
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
            <div className="flex justify-between font-semibold">
              <span>Total</span>
              <span>{formatINR(order.totalAmount.toString())}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Shipping address</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <p className="text-foreground">{address.fullName}</p>
          <p>{address.addressLine1}</p>
          {address.addressLine2 && <p>{address.addressLine2}</p>}
          <p>
            {address.city}, {address.state} — {address.pincode}
          </p>
          <p className="mt-1">{address.phone}</p>
        </CardContent>
      </Card>

      {order.trackingNumber && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tracking</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
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
          </CardContent>
        </Card>
      )}
    </div>
  );
}
