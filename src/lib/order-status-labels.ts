/**
 * What each order status is CALLED, everywhere — admin and customer alike.
 *
 * ── "processing" is "Packed" (owner's decision, Nov 2026) ───────────────────
 * The flow the shop works to is Placed / Confirmed → Packed → Shipped →
 * Delivered. "Packed" had no status of its own (it only existed as a step in
 * the email progress bar), while "processing" existed but nothing ever set it.
 * Rather than add a new database value, "processing" now means "packed and
 * waiting for the courier": set by Mark as packed, shown as "Packed". The
 * stored value stays "processing", so cancelling, booking the courier and
 * every other rule that already accepts it keep working unchanged.
 */
const LABELS: Record<string, string> = {
  placed: "Placed",
  confirmed: "Confirmed",
  processing: "Packed",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
  return_requested: "Return requested",
  returned: "Returned",
  refunded: "Refund started",
};

export function orderStatusLabel(status: string): string {
  return LABELS[status] ?? status.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}

/** The stored value that means "packed". */
export const PACKED = "processing" as const;

/**
 * Orders list filter, alongside "coming_back" and "unpaid_attempts": paid or
 * COD orders, not cancelled, not yet packed and not yet booked with a courier
 * — the pile someone needs to pack.
 */
export const TO_PACK_FILTER = "to_pack";

/** Can this order be marked packed right now? The server enforces the same. */
export function canMarkPacked(order: {
  orderStatus: string;
  paymentStatus: string;
  paymentMethod: string;
  shipmentCreatedAt: Date | string | null;
}): boolean {
  return (
    !order.shipmentCreatedAt &&
    (order.orderStatus === "placed" || order.orderStatus === "confirmed") &&
    (order.paymentStatus === "paid" || order.paymentMethod === "cod")
  );
}
