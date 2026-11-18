import { prisma } from "@/server/db";
import { sendOrderCancelledAlertEmail, sendOrderCancelledEmail } from "@/server/email/resend";
import { resolveAlertRecipients } from "@/server/settings/order-alerts";

/**
 * The emails after a cancellation, for both ways an order gets cancelled:
 * the shop's Cancel order button, and the customer's own Cancel.
 *
 * Neither function throws. The order is already cancelled and refunded by the
 * time they run, and a mail outage must not turn that into an error.
 *
 * Read back AFTER the cancel, so the refund line reflects what actually
 * happened — refundStatus "completed" means Razorpay took it, "failed" means
 * it is queued for retry and the customer is still owed it.
 */

async function loadCancelled(orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      orderNumber: true,
      totalAmount: true,
      refundStatus: true,
      paymentMethod: true,
      paymentStatus: true,
      confirmationToken: true,
      user: { select: { email: true, name: true } },
    },
  });
  if (!order) return null;
  const refund =
    order.refundStatus === "idle"
      ? null
      : {
          amount: order.totalAmount.toString(),
          state: order.refundStatus === "completed" ? ("sent" as const) : ("pending" as const),
        };
  return { order, refund };
}

/**
 * To the customer. `why` is what they are told, never the internal reason —
 * see sendOrderCancelledEmail.
 */
export async function emailCustomerAboutCancellation(
  orderId: string,
  why: "customer" | "stock" | null
) {
  try {
    const loaded = await loadCancelled(orderId);
    // An erased customer's address is a placeholder that goes nowhere.
    if (!loaded?.order.user || loaded.order.user.email.endsWith("@deleted.invalid")) return;
    const { order, refund } = loaded;
    await sendOrderCancelledEmail({
      to: order.user.email,
      name: order.user.name,
      orderNumber: order.orderNumber,
      orderId,
      confirmationToken: order.confirmationToken,
      why,
      refund,
    });
  } catch (err) {
    console.error("order-cancelled email failed", orderId, err);
  }
}

/**
 * To the shop, when the CUSTOMER cancelled. Only for orders the shop was
 * already told about — COD, or paid online. An online order cancelled before
 * payment never raised a new-order alert, so its cancellation would be noise.
 */
export async function alertShopAboutCustomerCancellation(orderId: string) {
  try {
    const loaded = await loadCancelled(orderId);
    if (!loaded) return;
    const { order, refund } = loaded;
    const shopKnew =
      order.paymentMethod === "cod" ||
      order.paymentStatus === "paid" ||
      order.paymentStatus === "refunded";
    if (!shopKnew) return;
    const { to } = await resolveAlertRecipients();
    if (to.length > 0) await sendOrderCancelledAlertEmail(to, orderId, refund);
  } catch (err) {
    console.error("order-cancelled alert failed", orderId, err);
  }
}
