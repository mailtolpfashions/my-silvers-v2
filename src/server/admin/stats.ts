import { prisma } from "@/server/db";
import { scheduleNow } from "@/server/cms/banners";

export async function getDashboardStats() {
  const [productCount, orderCount, customerCount, revenueAgg, pendingReturns] =
    await Promise.all([
      prisma.product.count({ where: { isActive: true } }),
      prisma.order.count(),
      prisma.user.count({ where: { role: "customer" } }),
      // Revenue = paid online orders + COD orders that weren't cancelled.
      prisma.order.aggregate({
        _sum: { totalAmount: true },
        where: {
          OR: [
            { paymentStatus: "paid" },
            { paymentMethod: "cod", orderStatus: { notIn: ["cancelled"] } },
          ],
        },
      }),
      prisma.order.count({ where: { orderStatus: "return_requested" } }),
    ]);

  return {
    productCount,
    orderCount,
    customerCount,
    totalRevenue: Number(revenueAgg._sum.totalAmount ?? 0),
    pendingReturns,
  };
}

/** Revenue counts a sale once it is paid, or once a COD order is not cancelled. */
const REVENUE_WHERE = {
  OR: [
    { paymentStatus: "paid" as const },
    { paymentMethod: "cod" as const, orderStatus: { notIn: ["cancelled" as const] } },
  ],
};

export type StatTrend = {
  /** The last 30 days. */
  current: number;
  /** The 30 days before that. */
  previous: number;
};

/**
 * Thirty days against the thirty before them, for the figures where a direction
 * is meaningful.
 *
 * ── Why only three of the four cards get one ────────────────────────────────
 * Orders, customers and revenue are FLOWS — things that happened during a
 * period, so "30 days vs the 30 before" is a real comparison. Active products
 * is a STOCK: a count of what exists right now. Comparing it to a month ago
 * would need history the schema does not keep, and inventing one from
 * `createdAt` would report products added, not products active — a different
 * number wearing the same label. It is left without a trend rather than given
 * a wrong one.
 *
 * ── The window is fixed at 30 days ─────────────────────────────────────────
 * Matching the revenue chart directly beneath it. A card reading "+12%" over a
 * different period from the graph under it is worse than no percentage.
 */
export async function getDashboardTrends(): Promise<{
  orders: StatTrend;
  customers: StatTrend;
  revenue: StatTrend;
}> {
  /**
   * ⚠️  The clock comes from a cached scope, not `new Date()` inline.
   *
   * `cacheComponents` is on in next.config.ts, and reading the current time in
   * a server component is non-deterministic — Next rejects it outright and the
   * production build FAILS with "used `new Date()` before accessing either
   * uncached data". This exact mistake broke the build once; see the identical
   * `scheduleNow()` in server/cms/banners.ts, which exists for the same reason.
   *
   * The consequence is that the window boundaries are only as fresh as the
   * `scheduled` cacheLife profile, which is correct here: a 30-day comparison
   * does not need its edges recomputed per request.
   */
  const now = await scheduleNow();
  const thirty = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const sixty = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

  const between = (from: Date, to: Date) => ({ createdAt: { gte: from, lt: to } });

  const [
    ordersNow,
    ordersBefore,
    customersNow,
    customersBefore,
    revenueNow,
    revenueBefore,
  ] = await Promise.all([
    prisma.order.count({ where: between(thirty, now) }),
    prisma.order.count({ where: between(sixty, thirty) }),
    prisma.user.count({ where: { role: "customer", ...between(thirty, now) } }),
    prisma.user.count({ where: { role: "customer", ...between(sixty, thirty) } }),
    prisma.order.aggregate({
      _sum: { totalAmount: true },
      where: { ...REVENUE_WHERE, ...between(thirty, now) },
    }),
    prisma.order.aggregate({
      _sum: { totalAmount: true },
      where: { ...REVENUE_WHERE, ...between(sixty, thirty) },
    }),
  ]);

  return {
    orders: { current: ordersNow, previous: ordersBefore },
    customers: { current: customersNow, previous: customersBefore },
    revenue: {
      current: Number(revenueNow._sum.totalAmount ?? 0),
      previous: Number(revenueBefore._sum.totalAmount ?? 0),
    },
  };
}

export type RevenueDay = { day: string; revenuePaise: number };

/** Daily revenue for the last 30 days (same revenue definition as above). */
export async function getRevenueByDay(): Promise<RevenueDay[]> {
  const rows = await prisma.$queryRaw<Array<{ day: Date; revenue: string }>>`
    SELECT date_trunc('day', "createdAt") AS day,
           COALESCE(SUM("totalAmount"), 0)::text AS revenue
    FROM "Order"
    WHERE "createdAt" >= now() - interval '30 days'
      AND ("paymentStatus" = 'paid'
           OR ("paymentMethod" = 'cod' AND "orderStatus" != 'cancelled'))
    GROUP BY 1
    ORDER BY 1
  `;

  // Fill gaps so the chart has a bar (possibly zero) for every day.
  const byDay = new Map(
    rows.map((r) => [r.day.toISOString().slice(0, 10), Math.round(Number(r.revenue) * 100)])
  );
  const out: RevenueDay[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    const key = d.toISOString().slice(0, 10);
    out.push({ day: key, revenuePaise: byDay.get(key) ?? 0 });
  }
  return out;
}

export async function getRecentOrders() {
  return prisma.order.findMany({
    orderBy: { createdAt: "desc" },
    take: 10,
    include: { user: { select: { name: true, email: true } } },
  });
}
