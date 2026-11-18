import { prisma } from "@/server/db";
import { sendPaymentReminderEmail } from "@/server/email/resend";
import { PAYMENT_WINDOW_HOURS } from "@/lib/order-payment";

/**
 * "Complete your payment" — one reminder for an online order left unpaid.
 *
 * Run every 30 minutes by .github/workflows/payment-reminders.yml through
 * api/cron/payment-reminders (Vercel's Hobby plan allows only daily crons).
 *
 * Who gets one — all of these:
 *   - online, payment still pending, not cancelled, never reminded;
 *   - placed at least an hour ago, so someone retrying right now isn't nagged;
 *   - at least three hours left of the payment window, so the link still works
 *     when they open it;
 *   - they haven't since placed another order that went through — the usual
 *     story is "payment failed, so I checked out again", and reminding them
 *     about the abandoned copy would read like a double charge;
 *   - every piece is still in stock, or "Complete payment" leads to a page
 *     saying it sold out.
 *
 * At most once per order: the row is claimed (paymentReminderSentAt) before
 * the email goes, so two overlapping runs can't both send. A failed send is
 * logged and not retried — a missed reminder costs less than a duplicate.
 */
const MIN_AGE_MS = 60 * 60 * 1000;
const MIN_LEFT_MS = 3 * 60 * 60 * 1000;

export async function sendDuePaymentReminders(now = new Date()) {
  const newest = new Date(now.getTime() - MIN_AGE_MS);
  const oldest = new Date(now.getTime() - (PAYMENT_WINDOW_HOURS * 3_600_000 - MIN_LEFT_MS));

  const due = await prisma.order.findMany({
    where: {
      paymentMethod: "razorpay",
      paymentStatus: "pending",
      orderStatus: { not: "cancelled" },
      paymentReminderSentAt: null,
      createdAt: { lte: newest, gte: oldest },
      user: { email: { not: { endsWith: "@deleted.invalid" } } },
    },
    select: {
      id: true,
      orderNumber: true,
      userId: true,
      createdAt: true,
      items: { select: { productId: true, quantity: true, size: true } },
    },
    orderBy: { createdAt: "asc" },
    take: 50,
  });

  const result = { sent: 0, skipped: 0, failed: 0 };
  for (const order of due) {
    // Claimed first, whatever happens next — an order is considered once.
    const claim = await prisma.order.updateMany({
      where: { id: order.id, paymentReminderSentAt: null },
      data: { paymentReminderSentAt: new Date() },
    });
    if (claim.count === 0) continue;

    if ((await paidSinceElsewhere(order)) || !(await stillInStock(order.items))) {
      result.skipped++;
      continue;
    }
    try {
      await sendPaymentReminderEmail(order.id);
      result.sent++;
    } catch (err) {
      result.failed++;
      console.error("[payment-reminder] send failed", order.orderNumber, err);
    }
  }
  return result;
}

/** Another order from the same customer, placed after this one, that went through. */
async function paidSinceElsewhere(order: { id: string; userId: string; createdAt: Date }) {
  const later = await prisma.order.findFirst({
    where: {
      userId: order.userId,
      id: { not: order.id },
      createdAt: { gt: order.createdAt },
      OR: [{ paymentMethod: "cod" }, { paymentStatus: { in: ["paid", "paying"] } }],
    },
    select: { id: true },
  });
  return later !== null;
}

async function stillInStock(items: Array<{ productId: string | null; quantity: number; size: string | null }>) {
  for (const item of items) {
    if (!item.productId) return false;
    const product = await prisma.product.findUnique({
      where: { id: item.productId },
      select: { isActive: true, stock: true },
    });
    if (!product?.isActive || product.stock < item.quantity) return false;
    if (item.size) {
      const variant = await prisma.productVariant.findFirst({
        where: { productId: item.productId, size: item.size },
        select: { stock: true },
      });
      if (!variant || variant.stock < item.quantity) return false;
    }
  }
  return true;
}
