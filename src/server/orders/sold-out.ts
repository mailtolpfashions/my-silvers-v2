import { prisma } from "@/server/db";

/**
 * Sold-out checks for an ONLINE order that was placed but never paid for.
 *
 * An unpaid order does not hold stock — stock is taken only when payment
 * succeeds (fulfill-order.ts), deliberately: most pieces here are one of a
 * kind, and holding them for every abandoned payment would block real buyers
 * for a day. The cost was that "Pay now" on such an order never asked whether
 * the piece was still there. If someone else had bought it meanwhile, Razorpay
 * took the shopper's money, fulfillment then found no stock, and they waited a
 * week for an automatic refund for something they could never have had.
 *
 * So Pay now checks first, and an order that can't be completed is cancelled
 * rather than left looking payable.
 */

type ItemLike = {
  productId: string | null;
  name: string;
  quantity: number;
  size: string | null;
};

/**
 * Names of the items that can't be supplied any more, in order; empty when
 * everything is still available. Read-only — the authoritative check is still
 * the guarded decrement at payment time, which this mirrors (a sized item is
 * checked on its size's own stock, plus the product must be live with enough
 * total stock).
 */
export async function soldOutItemNames(items: ItemLike[]): Promise<string[]> {
  const ids = [...new Set(items.map((i) => i.productId).filter((id): id is string => !!id))];
  const products = await prisma.product.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      isActive: true,
      stock: true,
      variants: { select: { size: true, stock: true } },
    },
  });
  const byId = new Map(products.map((p) => [p.id, p]));

  const soldOut: string[] = [];
  for (const item of items) {
    // A product deleted since the order was placed can't be sent at all.
    const product = item.productId ? byId.get(item.productId) : undefined;
    const sizeStock = item.size
      ? (product?.variants.find((v) => v.size === item.size)?.stock ?? 0)
      : Infinity;
    const available =
      !!product && product.isActive && product.stock >= item.quantity && sizeStock >= item.quantity;
    if (!available) soldOut.push(item.name);
  }
  return soldOut;
}

/**
 * Cancels an unpaid online order whose items have sold out. Nothing else to
 * undo: no stock was taken and no money moved. Guarded, so it only ever
 * touches an order that is still unpaid and not yet under way; a payment that
 * lands later from an old open tab is refused and refunded by fulfillOrder.
 */
export async function cancelSoldOutUnpaidOrder(orderId: string): Promise<void> {
  await prisma.order.updateMany({
    where: {
      id: orderId,
      paymentMethod: "razorpay",
      paymentStatus: { in: ["pending", "failed"] },
      razorpayPaymentId: null,
      orderStatus: { in: ["placed", "confirmed", "processing"] },
    },
    data: { orderStatus: "cancelled" },
  });
}

/**
 * The one call the order pages and resumePaymentAction make: for an unpaid
 * order that is still payable, finds what has sold out and, if anything has,
 * cancels the order. Returns the sold-out names (empty = still payable).
 *
 * Called from the order page's render as well as the action, so a shopper who
 * opens the order sees "sold out" instead of a Pay now button that could only
 * fail. The write is idempotent and guarded, so a repeated render is harmless.
 */
export async function closeIfSoldOut(order: { id: string; items: ItemLike[] }): Promise<string[]> {
  const names = await soldOutItemNames(order.items);
  if (names.length > 0) await cancelSoldOutUnpaidOrder(order.id);
  return names;
}

/** "Tri-Tone Plain Band Ring has" / "A and B have" — for the shopper-facing message. */
export function soldOutMessage(names: string[]): string {
  const list =
    names.length <= 1
      ? (names[0] ?? "An item")
      : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  return `Sorry — ${list} ${names.length > 1 ? "have" : "has"} sold out since you placed this order, so it can't be paid for. Nothing has been charged.`;
}
