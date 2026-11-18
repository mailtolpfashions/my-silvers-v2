import { after } from "next/server";
import { prisma } from "@/server/db";
import { sendOrderDeliveredEmail } from "@/server/email/resend";
import { normaliseScans, type ScanEvent } from "@/server/integrations/shiprocket";
import { markComingBackIfNeeded } from "@/server/orders/coming-back";
import type { Order, OrderStatus } from "@/generated/prisma/client";

/**
 * Applies one courier status push to an order — shared by the Shiprocket and
 * NimbusPost webhooks, so a parcel behaves the same whichever partner carries
 * it. Moved here from the Shiprocket route when NimbusPost was added.
 */

/**
 * How far along each status is. A webhook can arrive late, out of order, or
 * twice — neither partner guarantees ordering — so a scan is only applied if it
 * moves the order FORWARD. Without this a delayed "shipped" scan landing after
 * "delivered" would un-deliver a completed order.
 *
 * cancelled and returned are terminal and sit above delivered: they are real
 * outcomes that can legitimately follow it (an RTO), and nothing should move an
 * order out of them.
 */
const RANK: Record<string, number> = {
  placed: 0,
  confirmed: 1,
  processing: 2,
  shipped: 3,
  delivered: 4,
  return_requested: 5,
  returned: 6,
  cancelled: 6,
  refunded: 7,
};

/**
 * @param next  the status this push maps to, or undefined for a scan that
 *              moves nothing (in transit, out for delivery…) — still recorded
 *              in the trail, because that is what a customer wants to read.
 * @returns whether the order's status moved.
 */
export async function applyCourierUpdate(
  order: Pick<Order, "id" | "orderNumber" | "orderStatus" | "shipmentScans">,
  update: { next?: OrderStatus; scans: ScanEvent[]; courierName?: string | null }
): Promise<boolean> {
  const { next } = update;
  const merged = mergeScans(order.shipmentScans, update.scans);
  /**
   * A return the customer has asked for is the shop's decision, not the
   * courier's. When their return parcel arrives the courier pushes "return
   * delivered"; moving the order to returned on that would skip the review —
   * no Review return button, no refund choice, no stock back. So the status
   * stays return_requested (the scan still lands in the trail below) and the
   * owner approves it, which restores the stock and refunds in one step.
   */
  const returnAwaitingReview = order.orderStatus === "return_requested";
  const advances =
    Boolean(next) &&
    !returnAwaitingReview &&
    (RANK[next!] ?? 0) > (RANK[order.orderStatus] ?? 0);

  // The status moves by compare-and-set on the status we read: a partner can
  // push the same scan twice at once, and only the push that actually moves
  // the order may send the "delivered" email.
  let moved = false;
  if (advances) {
    const claim = await prisma.order.updateMany({
      where: { id: order.id, orderStatus: order.orderStatus },
      data: { orderStatus: next! },
    });
    moved = claim.count === 1;
  }

  // An RTO or a courier-side cancellation: the parcel is heading home but its
  // stock is still counted as sold. Flag it for "Received back" — see
  // server/orders/coming-back.ts for why stock isn't restored right here.
  if (moved) {
    await markComingBackIfNeeded(order.id, order.orderStatus, next!);
  }

  // The courier's delivered scan starts the return window. Stamped once — a
  // repeated push must not push the deadline later.
  if (moved && next === "delivered") {
    await prisma.order.updateMany({
      where: { id: order.id, deliveredAt: null },
      data: { deliveredAt: new Date() },
    });
  }

  if (merged || update.courierName) {
    await prisma.order.update({
      where: { id: order.id },
      data: {
        ...(merged ? { shipmentScans: merged } : {}),
        // Couriers get reassigned more often than you would think, and the name
        // shown on the customer's tracking page should follow.
        ...(update.courierName ? { courierName: update.courierName } : {}),
      },
    });
  }

  if (moved && next === "delivered") {
    after(async () => {
      try {
        await sendOrderDeliveredEmail(order.id);
      } catch (err) {
        console.error("order-delivered email failed", order.orderNumber, err);
      }
    });
  }
  return moved;
}

/**
 * Union of what we hold and what just arrived, keyed on timestamp + activity.
 *
 * Returns null when nothing changed, so an unchanged trail is not rewritten on
 * every scan. Couriers repeat events across pushes, so de-duplication is the
 * normal path rather than an edge case. Only ever grows: a push carrying two
 * scans must not replace a trail of ten.
 */
function mergeScans(existing: unknown, incoming: ScanEvent[]): ScanEvent[] | null {
  if (incoming.length === 0) return null;

  const held = normaliseScans(existing);
  const seen = new Set(held.map((s) => `${s.at}|${s.activity}`));
  const added = incoming.filter((s) => !seen.has(`${s.at}|${s.activity}`));
  if (added.length === 0) return null;

  return [...held, ...added].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}
