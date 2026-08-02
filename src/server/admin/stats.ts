import { prisma } from "@/server/db";

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
