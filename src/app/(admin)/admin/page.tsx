import Link from "next/link";
import {
  getDashboardStats,
  getRevenueByDay,
  getRecentOrders,
} from "@/server/admin/stats";
import { RevenueChart } from "@/components/admin/revenue-chart";
import { OrderStatusBadges } from "@/components/storefront/orders/order-detail";
import { formatINR } from "@/lib/format";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

export default async function AdminDashboardPage() {
  const [stats, revenueDays, recentOrders] = await Promise.all([
    getDashboardStats(),
    getRevenueByDay(),
    getRecentOrders(),
  ]);

  const cards = [
    { label: "Active products", value: String(stats.productCount) },
    { label: "Orders", value: String(stats.orderCount) },
    { label: "Customers", value: String(stats.customerCount) },
    { label: "Lifetime revenue", value: formatINR(stats.totalRevenue) },
  ];

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        {stats.pendingReturns > 0 && (
          <Link
            href="/admin/orders?status=return_requested"
            className="rounded-md bg-amber-100 px-3 py-1.5 text-sm font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-200"
          >
            {stats.pendingReturns} return request{stats.pendingReturns === 1 ? "" : "s"} pending
          </Link>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {cards.map((card) => (
          <Card key={card.label}>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {card.label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold">{card.value}</p>
            </CardContent>
          </Card>
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
