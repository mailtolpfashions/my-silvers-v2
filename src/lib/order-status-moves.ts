/**
 * Which statuses the owner's status dropdown may move an order to.
 *
 * The dropdown is an override for unsticking an order, and it used to allow
 * ANY jump — so a delivered, paid order could be relabelled "cancelled". The
 * customer then saw CANCELLED + PAID on their order page, with no refund sent
 * and no stock back. These rules keep the override useful without letting it
 * tell a story that never happened:
 *
 *   - "cancelled" is never offered. Cancelling for real (stock back, Shiprocket
 *     booking released, a paid order refunded) is the Cancel order button, which
 *     only works before the parcel ships. After that it is a return.
 *   - Before shipping, the order can be nudged anywhere up to delivered (a
 *     stuck payment confirmation, a parcel sent outside Shiprocket).
 *   - Once shipped, it only moves forward: shipped → delivered → return
 *     requested → returned → refunded. A declined return goes back to delivered.
 *   - A cancelled order can be put back on its feet — that is how a wrong
 *     "cancelled" label from the old dropdown gets undone — unless its money
 *     has already gone back to the customer.
 *
 * Shared by the dropdown (to list the choices) and updateOrderStatusAction
 * (to refuse anything else), so the two can't disagree.
 */
export const ORDER_STATUSES = [
  "placed",
  "confirmed",
  "processing",
  "shipped",
  "delivered",
  "cancelled",
  "return_requested",
  "returned",
  "refunded",
] as const;

export type OrderStatusName = (typeof ORDER_STATUSES)[number];

const PRE_SHIP: OrderStatusName[] = ["placed", "confirmed", "processing", "shipped", "delivered"];

const NEXT: Record<OrderStatusName, OrderStatusName[]> = {
  placed: PRE_SHIP,
  confirmed: PRE_SHIP,
  processing: PRE_SHIP,
  shipped: ["shipped", "delivered"],
  delivered: ["delivered", "return_requested", "returned", "refunded"],
  return_requested: ["return_requested", "delivered", "returned", "refunded"],
  returned: ["returned", "refunded"],
  refunded: ["refunded"],
  cancelled: ["cancelled", ...PRE_SHIP],
};

/** The statuses to offer, the current one included (first in list order). */
export function allowedStatusMoves(
  current: string,
  paymentStatus: string
): OrderStatusName[] {
  const moves = NEXT[current as OrderStatusName];
  if (!moves) return [current as OrderStatusName];
  if (current === "cancelled" && paymentStatus === "refunded") return ["cancelled"];
  return ORDER_STATUSES.filter((s) => moves.includes(s));
}

export function canMoveStatus(current: string, paymentStatus: string, next: string): boolean {
  return next !== current && allowedStatusMoves(current, paymentStatus).includes(next as OrderStatusName);
}
