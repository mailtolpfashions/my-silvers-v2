import { prisma } from "@/server/db";
import { sendNewOrderAlertEmail } from "@/server/email/resend";

/**
 * Emails every owner (role superadmin) about a new order.
 *
 * Called from after() at the two moments an order becomes real: payment
 * confirmed (fulfill-order.ts) and a COD order placed (create-order.ts).
 * NEVER throws — a missing owner or a refused send is logged, and the order
 * the customer has just paid for is unaffected either way.
 */
export async function alertOwnersOfNewOrder(orderId: string): Promise<void> {
  try {
    const [owners, order] = await Promise.all([
      prisma.user.findMany({ where: { role: "superadmin" }, select: { email: true } }),
      prisma.order.findUnique({
        where: { id: orderId },
        select: {
          id: true,
          orderNumber: true,
          totalAmount: true,
          paymentMethod: true,
          shippingAddress: true,
          user: { select: { name: true, email: true } },
          items: { select: { name: true, quantity: true, size: true } },
        },
      }),
    ]);
    if (!order || owners.length === 0) return;

    const address = (order.shippingAddress ?? {}) as { fullName?: string; city?: string };
    await sendNewOrderAlertEmail({
      to: owners.map((o) => o.email),
      orderId: order.id,
      orderNumber: order.orderNumber,
      total: Number(order.totalAmount),
      cod: order.paymentMethod === "cod",
      customer: address.fullName || order.user.name || order.user.email,
      city: address.city ?? null,
      items: order.items.map((i) => ({ name: i.name, quantity: i.quantity, size: i.size || null })),
    });
  } catch (err) {
    console.error("[owner-alert] new-order email failed", orderId, err);
  }
}
