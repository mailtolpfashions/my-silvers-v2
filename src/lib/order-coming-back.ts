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
