import { prisma } from "@/server/db";
import { cancelCourier, providerOf } from "@/server/couriers";
import { PROVIDER_LABEL, type CourierProviderId } from "@/lib/courier-quotes";

type Cancellable = {
  id: string;
  orderNumber: string;
  shiprocketOrderId: string | null;
  trackingNumber: string | null;
  /** Which partner holds it — Shiprocket when unset (orders from before NimbusPost). */
  courierProvider?: CourierProviderId | null;
};

/**
 * Releases whatever this order is holding at its courier partner (Shiprocket
 * or NimbusPost — server/couriers dispatches on courierProvider).
 *
 * Two different endpoints, because there are two different things to undo:
 *   trackingNumber present   a courier is booked and expecting the parcel —
 *                            cancel the WAYBILL, or it gets collected and
 *                            billed for an order nobody is fulfilling
 *   only shiprocketOrderId   nothing is booked, just a record in the account —
 *                            cancel the ORDER
 *
 * ── It never throws ──────────────────────────────────────────────────────────
 * Every caller is in the middle of something the customer cares about far more
 * than this: a cancellation, a refund. Letting a Shiprocket outage abort those
 * would strand money for the sake of tidiness at the courier. So a failure is
 * logged loudly and swallowed, and the order's shiprocket ids are left in place
 * so the failure is visible in the admin panel and can be cleared by hand.
 *
 * That trade is only acceptable because the failure is LOUD. If this ever grows
 * a silent catch, the first symptom will be couriers collecting cancelled
 * orders.
 */
export async function releaseShipment(order: Cancellable): Promise<void> {
  if (!order.shiprocketOrderId && !order.trackingNumber) return;

  const partner = PROVIDER_LABEL[providerOf({ courierProvider: order.courierProvider ?? null })];
  try {
    await cancelCourier({
      courierProvider: order.courierProvider ?? null,
      trackingNumber: order.trackingNumber,
      shiprocketOrderId: order.shiprocketOrderId,
    });
  } catch (err) {
    console.error(
      `[couriers] FAILED to cancel the ${partner} shipment for ${order.orderNumber} ` +
        `(awb=${order.trackingNumber ?? "none"}, srOrder=${order.shiprocketOrderId ?? "none"}). ` +
        `Cancel it by hand in the ${partner} dashboard.`,
      err
    );
  }
}

/**
 * Same, for an order id rather than a loaded row — the admin status dropdown
 * has only the id to hand.
 */
export async function releaseShipmentByOrderId(orderId: string): Promise<void> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { id: true, orderNumber: true, shiprocketOrderId: true, trackingNumber: true, courierProvider: true },
  });
  if (order) await releaseShipment(order);
}
