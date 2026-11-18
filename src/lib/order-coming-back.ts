/**
 * True while a parcel the courier sent back still waits for "Received back".
 * See server/orders/coming-back.ts. A plain module, not the client component
 * file, so server pages can call it.
 */
export function isComingBack(order: { comingBackAt: Date | null; receivedBackAt: Date | null }) {
  return order.comingBackAt !== null && order.receivedBackAt === null;
}

/** The filter value for the orders list — not an OrderStatus, a state of its own. */
export const COMING_BACK_FILTER = "coming_back";

/**
 * "Unpaid attempts": online orders whose payment never went through — the
 * shopper closed Razorpay, or it failed. No stock taken, nothing to ship, and
 * no new-order alert was sent. Hidden from the default Orders view, the way a
 * Shopify-style shop lists them as abandoned checkouts rather than orders.
 *
 * A failed order WITH a Razorpay payment id stays visible: money was taken and
 * a refund is owed, which is exactly what an admin must see.
 */
export const UNPAID_ATTEMPTS_FILTER = "unpaid_attempts";
