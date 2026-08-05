import { prisma } from "@/server/db";
import { restoreStock } from "@/server/products/stock";
import { toPaise } from "@/server/orders/money";
import { createRefund } from "@/server/payments/razorpay";

export class CancelError extends Error {
  constructor(
    public code: "NOT_FOUND" | "NOT_CANCELLABLE",
    message: string
  ) {
    super(message);
    this.name = "CancelError";
  }
}

/**
 * Customer-initiated cancellation. Allowed only while the order hasn't
 * shipped (placed/confirmed/processing, no shipment created). Per the
 * confirmed design decision, cancelling an already-PAID order automatically
 * triggers a full Razorpay refund — unlike the old site, which left paid
 * cancellations to the manual return flow.
 */
export async function cancelOrder(input: { orderId: string; userId: string }) {
  const order = await prisma.order.findFirst({
    where: { id: input.orderId, userId: input.userId },
    include: { items: true },
  });
  if (!order) throw new CancelError("NOT_FOUND", "Order not found.");

  // Atomic claim — the status guard in the WHERE clause means a concurrent
  // admin shipment-creation or double-click can't cancel twice or cancel a
  // shipped order.
  const claim = await prisma.order.updateMany({
    where: {
      id: order.id,
      orderStatus: { in: ["placed", "confirmed", "processing"] },
      shipmentCreatedAt: null,
    },
    data: { orderStatus: "cancelled" },
  });
  if (claim.count === 0) {
    throw new CancelError("NOT_CANCELLABLE", "This order can no longer be cancelled.");
  }

  // Restore stock ONLY where it was actually decremented: COD decrements at
  // creation; Razorpay decrements at payment confirmation. A cancelled
  // Razorpay order that was never paid never took any stock.
  const stockWasDecremented =
    order.paymentMethod === "cod" || order.paymentStatus === "paid";
  if (stockWasDecremented) {
    await prisma.$transaction(async (tx) => {
      await restoreStock(
        tx,
        order.items
          .filter((i) => i.productId !== null)
          .map((i) => ({ productId: i.productId!, quantity: i.quantity, size: i.size }))
      );
    });
  }

  // Auto-refund a paid order (confirmed design decision).
  let refunded = false;
  if (order.paymentStatus === "paid" && order.razorpayPaymentId) {
    await prisma.order.update({
      where: { id: order.id },
      data: { refundStatus: "processing" },
    });
    try {
      await createRefund(order.razorpayPaymentId, toPaise(order.totalAmount));
      await prisma.order.update({
        where: { id: order.id },
        data: {
          paymentStatus: "refunded",
          refundStatus: "completed",
          refundAmount: order.totalAmount,
          refundProcessedAt: new Date(),
        },
      });
      refunded = true;
    } catch (err) {
      // Order stays cancelled; refundStatus 'failed' flags it for the
      // auto-refund sweep / admin retry rather than silently dropping it.
      console.error("auto-refund failed for", order.orderNumber, err);
      await prisma.order.update({
        where: { id: order.id },
        data: { refundStatus: "failed" },
      });
    }
  }

  return { orderNumber: order.orderNumber, refunded };
}
