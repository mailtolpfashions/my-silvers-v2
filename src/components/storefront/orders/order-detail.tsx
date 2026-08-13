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

/**
 * The stored scan trail, defensively.
 *
 * `shipmentScans` is a Json column, so its type is `unknown` as far as the
 * compiler is concerned and its contents came from a courier. Anything that is
 * not a well-formed list renders as no timeline rather than throwing — a bad
 * scan payload must not take out the order page.
 */
function parseScans(raw: unknown): Array<{ at: string; activity: string; location: string | null }> {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((s): s is Record<string, unknown> => Boolean(s) && typeof s === "object")
    .map((s) => ({
      at: String(s.at ?? ""),
      activity: String(s.activity ?? ""),
      location: s.location ? String(s.location) : null,
    }))
    .filter((s) => s.at && s.activity);
}

/** Scan date as "12 Aug, 4:30 pm" — no year; nothing here is a year old. */
function formatScanDate(at: string): string {
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return at;
  return d.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/**
 * The courier's scan trail, newest first.
 *
 * A rail with a dot per scan rather than a table: the shape communicates
 * "sequence" before a word is read, and the most recent line — the one anyone
 * opening this page came for — is emphasised and sits at the top.
 */
function ScanTimeline({
  scans,
}: {
  scans: Array<{ at: string; activity: string; location: string | null }>;
}) {
  if (scans.length === 0) {
    return (
      <p className="mt-4 text-muted-foreground">
        Awaiting the first scan from the courier. Updates appear here as your parcel moves.
      </p>
    );
  }

  return (
    <ol className="mt-5 space-y-0">
      {scans.map((scan, i) => (
        <li
          key={`${scan.at}-${i}`}
          // The rail is a left border on every item except the last, so it
          // stops at the final dot instead of trailing into whitespace.
          className={`relative pb-5 pl-6 ${i === scans.length - 1 ? "" : "border-l"} ${
            i === scans.length - 1 ? "" : "border-border"
          }`}
        >
          <span
            aria-hidden
            className={`absolute -left-[3px] top-1 size-[7px] rounded-full ${
              i === 0 ? "bg-foreground" : "bg-border"
            }`}
          />
          <p className={i === 0 ? "text-foreground" : "text-muted-foreground"}>{scan.activity}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {formatScanDate(scan.at)}
            {scan.location ? ` · ${scan.location}` : ""}
          </p>
        </li>
      ))}
    </ol>
  );
}

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
      className={`inline-flex items-center border px-2.5 py-1 text-micro uppercase tracking-[0.1em] ${
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
                {/* The line's own money, a step up from the product name — same
                    treatment as a cart row. The `₹x × 2` above is the working
                    that gets to it and stays at 14px. */}
                <p className="text-base font-semibold">
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
            {/* Subtotal and Shipping stay at 14px — they are the arithmetic.
                Only the total steps up, matching the cart and checkout
                summaries this block mirrors. */}
            <div className="flex items-baseline justify-between pt-1 text-base font-semibold">
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
            {/* The waybill, as plain text rather than a link out.
                This used to point at shiprocket.co, which handed the whole
                post-purchase moment — the part a shopper checks daily for a
                week — to a logistics vendor's branding. The scans below are the
                same data that page renders; there is no reason to send anyone
                there for it. */}
            <p className="text-muted-foreground">
              {order.courierName ? `${order.courierName} — ` : ""}
              <span className="text-foreground">{order.trackingNumber}</span>
            </p>

            <ScanTimeline scans={parseScans(order.shipmentScans)} />
          </div>
        </section>
      )}
    </div>
  );
}
