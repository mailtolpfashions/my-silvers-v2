import {
  getDashboardStats,
  getDashboardTrends,
  getRevenueByDay,
  getRecentOrders,
} from "@/server/admin/stats";
import { Suspense } from "react";
import { getAttentionItems, getAbandonedCartSummary } from "@/server/admin/attention";
import { AttentionBlock, AttentionLink } from "@/components/admin/attention-block";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/admin/stat-card";
import { RevenueChart } from "@/components/admin/revenue-chart";
import { OrderStatusBadges } from "@/components/storefront/orders/order-detail";
import { formatINR } from "@/lib/format";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/page-header";

/**
 * Blocking, like every other admin route — see the fuller note in
 * admin/reviews/page.tsx for the reasoning. In short: everything here is
 * per-shopkeeper and behind a login, so there is no shell worth prerendering
 * and nothing to share between visitors; it is opened by staff a few times a
 * day, so no conversion or crawl budget rides on it; and the data IS the page,
 * so a skeleton would be replaced wholesale a moment later.
 *
 * ⚠️  Note this does NOT mean the dashboard cannot stream. The abandoned-cart
 * row below has its own <Suspense> and still streams independently, because
 * that query is genuinely slow enough to hold up the other six rows. `instant`
 * governs whether Next VALIDATES the route for instant navigation, not whether
 * the route is allowed to have boundaries inside it.
 *
 * Without this the dev overlay reports getDashboardStats as blocking the
 * prerender. Validation is dev-only at the framework's default warning level,
 * so `next build` passes either way — which is exactly how this route went so
 * long as the only admin page missing the export.
 */
export const instant = false;

export default async function AdminDashboardPage() {
  const [stats, trends, revenueDays, recentOrders] = await Promise.all([
    getDashboardStats(),
    getDashboardTrends(),
    getRevenueByDay(),
    getRecentOrders(),
  ]);

  const attention = await getAttentionItems();

  /**
   * The totals are lifetime; the trend beneath each is the last 30 days against
   * the 30 before. Those are different windows on purpose — the number answers
   * "how big is this" and the line under it answers "which way is it going".
   *
   * Active products carries no trend: it is a count of what exists now, not of
   * anything that happened in a period. See getDashboardTrends.
   */
  const cards = [
    { label: "Active products", value: String(stats.productCount) },
    { label: "Orders", value: String(stats.orderCount), trend: trends.orders },
    { label: "Customers", value: String(stats.customerCount), trend: trends.customers },
    {
      label: "Lifetime revenue",
      value: formatINR(stats.totalRevenue),
      trend: trends.revenue,
      format: formatINR,
    },
  ];

  return (
    <div className="space-y-8">
      {/* The returns pill that used to live in `actions` is gone: it was the
          only actionable thing the dashboard knew about, and it is now one row
          of the attention block below rather than a second place to see the
          same number. */}
      <PageHeader title="Dashboard" />

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">Needs attention</h2>
        <AttentionBlock
          items={attention}
          cartSlot={
            /* Its own boundary: deciding whether a cart is abandoned cannot be
               a COUNT, so it is by far the slowest query on this page. Behind
               Suspense the other six rows paint immediately. */
            <Suspense fallback={<Skeleton className="h-9 w-44" />}>
              <AbandonedCartRow />
            </Suspense>
          }
        />
      </section>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {cards.map((card) => (
          <StatCard
            key={card.label}
            label={card.label}
            value={card.value}
            trend={card.trend}
            format={card.format}
          />
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Revenue — last 30 days</CardTitle>
        </CardHeader>
        <CardContent>
          <RevenueChart days={revenueDays} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent orders</CardTitle>
        </CardHeader>
        <CardContent>
          {recentOrders.length === 0 ? (
            <p className="text-sm text-muted-foreground">No orders yet.</p>
          ) : (
            <div className="space-y-3">
              {recentOrders.map((order) => (
                <div
                  key={order.id}
                  className="flex flex-wrap items-center justify-between gap-2 border-b pb-3 last:border-0 last:pb-0"
                >
                  <div>
                    <p className="text-sm font-medium">{order.orderNumber}</p>
                    <p className="text-xs text-muted-foreground">
                      {order.user.name ?? order.user.email} ·{" "}
                      {order.createdAt.toLocaleDateString("en-IN", { dateStyle: "medium" })} ·{" "}
                      {formatINR(order.totalAmount.toString())}
                    </p>
                  </div>
                  <OrderStatusBadges order={order} />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Abandoned carts, streamed on its own.
 *
 * Renders nothing when there are none — an all-clear is the absence of a row,
 * not a row saying zero.
 */
async function AbandonedCartRow() {
  const { count, value } = await getAbandonedCartSummary();
  if (count === 0) return null;
  return (
    <AttentionLink
      href="/admin/carts"
      label={`${count} abandoned cart${count === 1 ? "" : "s"} — ${formatINR(value)}`}
    />
  );
}
