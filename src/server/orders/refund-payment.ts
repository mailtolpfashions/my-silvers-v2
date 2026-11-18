import { prisma } from "@/server/db";
import { toPaise } from "@/server/orders/money";
import { createRefund } from "@/server/payments/razorpay";
import type { Prisma } from "@/generated/prisma/client";

/**
 * Refunds an order whose money must go back, and records the outcome.
 *
 * One implementation for two callers:
 *   - fulfillOrder, the moment a payment lands for a piece that has just sold
 *     out — so that shopper's refund starts within seconds instead of at the
 *     03:00 sweep (owner decision, Nov 2026);
 *   - the nightly auto-refund-sweep, which stays as the safety net and retries
 *     anything left `failed` here.
 *
 * The claim (idle|failed → processing) is what makes two callers safe at
 * once: only one of them can move the row, and the other skips it — so a
 * payment is never refunded twice.
 *
 * Never throws: the result says what happened, and a failure leaves the row
 * `failed`, which the sweep picks up again.
 */
export async function refundOrderPayment(order: {
  id: string;
  orderNumber: string;
  paymentStatus: string;
  razorpayPaymentId: string | null;
  totalAmount: Prisma.Decimal | number | string;
}): Promise<"refunded" | "nothing-to-refund" | "skipped" | "failed"> {
  const claim = await prisma.order.updateMany({
    where: { id: order.id, refundStatus: { in: ["idle", "failed"] } },
    data: {
      refundStatus: "processing",
      ...(order.paymentStatus === "pending" ? { paymentStatus: "failed" as const } : {}),
    },
  });
  if (claim.count === 0) return "skipped";

  try {
    if (!order.razorpayPaymentId) {
      await prisma.order.update({ where: { id: order.id }, data: { refundStatus: "completed" } });
      return "nothing-to-refund";
    }
    await createRefund(order.razorpayPaymentId, toPaise(order.totalAmount));
    await prisma.order.update({
      where: { id: order.id },
      data: {
        refundStatus: "completed",
        refundAmount: order.totalAmount,
        refundProcessedAt: new Date(),
      },
    });
    return "refunded";
  } catch (err) {
    console.error("refund failed for", order.orderNumber, err);
    await prisma.order
      .update({ where: { id: order.id }, data: { refundStatus: "failed" } })
      .catch(() => {});
    return "failed";
  }
}
