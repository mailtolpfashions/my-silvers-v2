import Link from "next/link";
import {
  getDashboardStats,
  getDashboardTrends,
  getRevenueByDay,
  getRecentOrders,
} from "@/server/admin/stats";
import { StatCard } from "@/components/admin/stat-card";
import { RevenueChart } from "@/components/admin/revenue-chart";
import { OrderStatusBadges } from "@/components/storefront/orders/order-detail";
import { formatINR } from "@/lib/format";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/page-header";

export default async function AdminDashboardPage() {
  const [stats, trends, revenueDays, recentOrders] = await Promise.all([
    getDashboardStats(),
    getDashboardTrends(),
    getRevenueByDay(),
    getRecentOrders(),
  ]);

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
      <PageHeader
        title="Dashboard"
        actions={
          stats.pendingReturns > 0 ? (
            // The one thing on this page that needs acting on, so it sits with
            // the actions rather than among the read-only figures below. Uses
            // the admin surface's warning pair rather than a one-off amber.
            <Link
              href="/admin/orders?status=return_requested"
              className="state-pill"
              data-state="warning"
            >
              {stats.pendingReturns} return request{stats.pendingReturns === 1 ? "" : "s"} pending
            </Link>
          ) : undefined
        }
      />

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
