import { prisma } from "@/server/db";
import { toPaise } from "@/server/orders/money";
import { createRefund } from "@/server/payments/razorpay";

/**
 * Vercel Cron (daily at 03:00 UTC — see vercel.json): the safety net for
 * payments that fell through the cracks. Replaces the old site's in-process node-cron,
 * which had no serverless equivalent. Two cases swept, ONLINE orders only
 * (COD orders live with paymentStatus 'pending' by design and must never be
 * touched here — a latent bug in the old site's sweep):
 *
 *  A) Abandoned checkouts: paymentStatus 'pending' for >24h → mark failed;
 *     refund if a payment was somehow captured.
 *  B) Captured-but-unfulfilled: paymentStatus 'failed' WITH a razorpayPaymentId
 *     (e.g. stock sold out inside the fulfillment window) → refund.
 *
 * The refundStatus idle/failed → processing claim is atomic, so overlapping
 * cron invocations can't double-refund; 'failed' rows are retried next cycle.
 *
 * Cadence is DAILY because Vercel's Hobby plan rejects any cron that would run
 * more than once a day — the previous every-6-hours schedule failed the deploy
 * outright. The cost is latency, not correctness: a captured-but-unfulfilled
 * payment can now wait up to 24h for its refund instead of 6h. Put it back to
 * every 6 hours on Pro.
 */
export async function GET(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const candidates = await prisma.order.findMany({
    where: {
      paymentMethod: "razorpay",
      refundStatus: { in: ["idle", "failed"] },
      OR: [
        { paymentStatus: "pending", createdAt: { lt: dayAgo } },
        { paymentStatus: "failed", razorpayPaymentId: { not: null } },
      ],
    },
    select: {
      id: true,
      orderNumber: true,
      paymentStatus: true,
      razorpayPaymentId: true,
      totalAmount: true,
    },
    take: 100,
  });

  let processed = 0;
  let refunded = 0;
  let failed = 0;

  for (const order of candidates) {
    // Atomic claim — losers of a concurrent sweep skip silently.
    const claim = await prisma.order.updateMany({
      where: { id: order.id, refundStatus: { in: ["idle", "failed"] } },
      data: {
        refundStatus: "processing",
        ...(order.paymentStatus === "pending" ? { paymentStatus: "failed" as const } : {}),
      },
    });
    if (claim.count === 0) continue;
    processed++;

    try {
      if (order.razorpayPaymentId) {
        await createRefund(order.razorpayPaymentId, toPaise(order.totalAmount));
        await prisma.order.update({
          where: { id: order.id },
          data: {
            refundStatus: "completed",
            refundAmount: order.totalAmount,
            refundProcessedAt: new Date(),
          },
        });
        refunded++;
      } else {
        // Genuinely abandoned — nothing was captured, nothing to refund.
        await prisma.order.update({
          where: { id: order.id },
          data: { refundStatus: "completed" },
        });
      }
    } catch (err) {
      console.error("auto-refund failed for", order.orderNumber, err);
      await prisma.order.update({
        where: { id: order.id },
        data: { refundStatus: "failed" },
      });
      failed++;
    }
  }

  return Response.json({ ok: true, candidates: candidates.length, processed, refunded, failed });
}
