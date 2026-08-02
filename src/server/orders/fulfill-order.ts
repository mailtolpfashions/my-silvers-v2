import { prisma } from "@/server/db";
import type { Order } from "@/generated/prisma/client";
import { decrementStock } from "@/server/products/stock";
import { toPaise } from "@/server/orders/money";
import { fetchPaymentDetails } from "@/server/payments/razorpay";
import { verifyCheckoutSignature } from "@/server/payments/verify-signature";
import { sendOrderConfirmationEmail } from "@/server/email/resend";

export class PaymentError extends Error {
  constructor(
    public code:
      | "ORDER_NOT_FOUND"
      | "BAD_SIGNATURE"
      | "MISMATCHED_ORDER"
      | "AMOUNT_MISMATCH"
      | "PAYMENT_NOT_CAPTURED"
      | "STOCK_SOLD_OUT",
    message: string
  ) {
    super(message);
    this.name = "PaymentError";
  }
}

export type FulfillResult =
  | { alreadyHandled: true; order: Order | null }
  | { alreadyHandled: false; order: Order };

/**
 * The single fulfillment path shared by BOTH the Razorpay webhook
 * (payment.captured / payment.authorized) and the client-driven
 * verify-payment Server Action. Whichever caller wins the atomic
 * pending→paying claim proceeds; the loser exits as a no-op. This is what
 * makes payment handling exactly-once under the webhook/client race.
 *
 * Webhook callers pass no signature — the transport-level body HMAC was
 * already verified in the Route Handler. Client callers must pass the
 * Checkout.js signature, verified here before anything else.
 */
export async function fulfillOrder(input: {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature?: string;
  source: "webhook" | "client";
}): Promise<FulfillResult> {
  if (input.source === "client") {
    if (
      !input.razorpaySignature ||
      !verifyCheckoutSignature({
        razorpayOrderId: input.razorpayOrderId,
        razorpayPaymentId: input.razorpayPaymentId,
        razorpaySignature: input.razorpaySignature,
      })
    ) {
      throw new PaymentError("BAD_SIGNATURE", "Payment signature verification failed.");
    }
  }

  const order = await prisma.order.findFirst({
    where: { razorpayOrderId: input.razorpayOrderId, paymentMethod: "razorpay" },
    include: { items: true },
  });
  if (!order) throw new PaymentError("ORDER_NOT_FOUND", "No order found for this payment.");
  if (order.paymentStatus === "paid") return { alreadyHandled: true, order };

  // Cross-check what Razorpay actually captured against our own order —
  // client-supplied ids/amounts are never trusted on their own.
  const payment = await fetchPaymentDetails(input.razorpayPaymentId);
  if (payment.order_id !== input.razorpayOrderId) {
    throw new PaymentError("MISMATCHED_ORDER", "Payment does not belong to this order.");
  }
  if (Number(payment.amount) !== toPaise(order.totalAmount)) {
    throw new PaymentError("AMOUNT_MISMATCH", "Paid amount does not match the order total.");
  }
  if (payment.status !== "captured" && payment.status !== "authorized") {
    throw new PaymentError("PAYMENT_NOT_CAPTURED", `Payment status is '${payment.status}'.`);
  }

  // ── Atomic claim: only one of {webhook, client} transitions pending→paying.
  const claim = await prisma.order.updateMany({
    where: { razorpayOrderId: input.razorpayOrderId, paymentStatus: "pending" },
    data: { paymentStatus: "paying" },
  });
  if (claim.count === 0) {
    // The other path already claimed (or resolved) this order — back off.
    const current = await prisma.order.findFirst({
      where: { razorpayOrderId: input.razorpayOrderId },
    });
    return { alreadyHandled: true, order: current };
  }

  try {
    const updated = await prisma.$transaction(async (tx) => {
      await decrementStock(
        tx,
        order.items
          .filter((i) => i.productId !== null)
          .map((i) => ({ productId: i.productId!, quantity: i.quantity }))
      );
      return tx.order.update({
        where: { id: order.id },
        data: {
          paymentStatus: "paid",
          orderStatus: "confirmed",
          razorpayPaymentId: input.razorpayPaymentId,
        },
      });
    });

    // Post-commit side effects — best-effort, never fail the fulfillment.
    try {
      await prisma.cartItem.deleteMany({ where: { cart: { userId: order.userId } } });
    } catch (err) {
      console.error("cart clear failed after payment", order.orderNumber, err);
    }
    try {
      const user = await prisma.user.findUnique({ where: { id: order.userId } });
      if (user) {
        await sendOrderConfirmationEmail({
          to: user.email,
          orderNumber: order.orderNumber,
          totalAmount: order.totalAmount.toString(),
        });
      }
    } catch (err) {
      console.error("order-confirmation email failed", order.orderNumber, err);
    }

    return { alreadyHandled: false, order: updated };
  } catch (err) {
    // Payment was captured but fulfillment failed (e.g. stock sold out in the
    // claim window). Mark failed — the auto-refund sweep picks these up.
    console.error("fulfillment failed after claim", order.orderNumber, err);
    await prisma.order.update({
      where: { id: order.id },
      data: { paymentStatus: "failed", razorpayPaymentId: input.razorpayPaymentId },
    });
    throw new PaymentError(
      "STOCK_SOLD_OUT",
      "Payment received but an item sold out. The payment will be refunded."
    );
  }
}

/** Webhook `payment.failed` — only downgrade an order still awaiting payment. */
export async function markPaymentFailed(razorpayOrderId: string) {
  await prisma.order.updateMany({
    where: { razorpayOrderId, paymentStatus: "pending" },
    data: { paymentStatus: "failed" },
  });
}
