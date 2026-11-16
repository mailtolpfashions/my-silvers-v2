/**
 * Why staff cancelled an order — asked in the Cancel order dialogue and written
 * to the Activity log, so the owner can see who cancelled what and why.
 * Shared by the dialogue (client) and the action (server), which validates
 * the key against this list.
 */
export const CANCEL_REASONS = {
  customer: "Customer asked to cancel",
  stock: "Out of stock",
  suspicious: "Suspicious order",
  other: "Other",
} as const;

export type CancelReason = keyof typeof CANCEL_REASONS;

export function isCancelReason(value: unknown): value is CancelReason {
  return typeof value === "string" && value in CANCEL_REASONS;
}

/** Which orders can still be cancelled — before a courier is booked. */
export function isCancellable(order: { orderStatus: string; shipmentCreatedAt: Date | null }) {
  return !order.shipmentCreatedAt && ["placed", "confirmed", "processing"].includes(order.orderStatus);
}
