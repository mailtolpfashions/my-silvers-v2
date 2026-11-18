import { prisma } from "@/server/db";
import { restoreStock } from "@/server/products/stock";
import { notifyBackInStock } from "@/server/products/stock-notifications";
import type { Order, OrderStatus } from "@/generated/prisma/client";

/**
 * Parcels on their way back to the shop that no return approval covers.
 *
 * Stock goes back in exactly three places: cancelling before shipping
 * (cancel-order.ts), approving a return (processReturn), and here. Before this
 * file a courier RTO — a COD customer refusing the parcel, an address nobody
 * answers at — moved the order to "returned" and stopped: the piece came home
 * but stayed counted as sold.
 *
 * Deliberately NOT restored when the courier first says so. "RTO initiated"
 * means the parcel has turned round, not that it has arrived; it can still be
 * lost or come back damaged. So the order is marked as coming back, and stock
 * goes up only when staff press "Received back" with the piece in hand — the
 * same moment an approved return is meant to happen.
 */

/** Statuses that end an order with the parcel heading home. */
const BACK_STATUSES: OrderStatus[] = ["returned", "cancelled", "refunded"];

/** Statuses in which the parcel has left the shop. */
const OUT_STATUSES: string[] = ["shipped", "delivered", "return_requested"];

/** COD takes stock at creation, online orders at payment — see cancel-order.ts. */
function stockWasTaken(order: Pick<Order, "paymentMethod" | "paymentStatus">) {
  return (
    order.paymentMethod === "cod" ||
    order.paymentStatus === "paid" ||
    order.paymentStatus === "refunded"
  );
}

/**
 * Called after something other than the return flow moves an order to a
 * finished state: the courier webhooks, and the owner's status dropdown.
 *
 * @param from  the status before the move — only a parcel that had left the
 *              shop (or had a courier booking) can be coming back.
 * @returns true when THIS call marked it — the caller's cue to alert the shop,
 *          so a repeated courier push doesn't send the alert twice.
 */
export async function markComingBackIfNeeded(
  orderId: string,
  from: string,
  to: OrderStatus
): Promise<boolean> {
  if (!BACK_STATUSES.includes(to)) return false;
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      paymentMethod: true,
      paymentStatus: true,
      shipmentCreatedAt: true,
      comingBackAt: true,
    },
  });
  if (!order || order.comingBackAt) return false;
  const leftTheShop = OUT_STATUSES.includes(from) || order.shipmentCreatedAt !== null;
  if (!leftTheShop || !stockWasTaken(order)) return false;

  // Guarded on null so two webhook pushes at once stamp it once.
  const claim = await prisma.order.updateMany({
    where: { id: orderId, comingBackAt: null },
    data: { comingBackAt: new Date() },
  });
  return claim.count === 1;
}

export class ReceiveBackError extends Error {}

/**
 * "Received back": the piece is in the shop. Puts its stock back, once.
 *
 * `restock: false` is for a piece that came back damaged — the parcel is still
 * marked as received (so it leaves the "coming back" list) but nothing is
 * counted as sellable again.
 *
 * The claim on `receivedBackAt: null` is what makes it once — a double click
 * or two staff at the same time can't add the stock twice.
 */
export async function receiveBack(
  orderId: string,
  { restock }: { restock: boolean }
): Promise<{ orderNumber: string }> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true },
  });
  if (!order) throw new ReceiveBackError("Order not found.");
  if (!order.comingBackAt) {
    throw new ReceiveBackError("This order isn't marked as coming back.");
  }

  const items = order.items
    .filter((i) => i.productId !== null)
    .map((i) => ({ productId: i.productId!, quantity: i.quantity, size: i.size }));

  await prisma.$transaction(async (tx) => {
    const claim = await tx.order.updateMany({
      where: { id: orderId, comingBackAt: { not: null }, receivedBackAt: null },
      data: { receivedBackAt: new Date() },
    });
    if (claim.count === 0) {
      throw new ReceiveBackError("This parcel has already been received back — refresh to see it.");
    }
    if (restock) await restoreStock(tx, items);
  });

  // Anyone waiting on "notify me" for these pieces hears about it. Never throws.
  if (restock) {
    void notifyBackInStock(items.map((i) => ({ productId: i.productId, size: i.size ?? "" })));
  }

  return { orderNumber: order.orderNumber };
}
