import { Suspense } from "react";
import { auth } from "@/server/auth/auth";
import { getDashboard, parseRange, parseTab, RANGE_LABELS } from "@/server/admin/dashboard";
import { getAttentionItems, getAbandonedCartSummary } from "@/server/admin/attention";
import { AttentionBlock, AttentionLink } from "@/components/admin/attention-block";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/admin/stat-card";
import { ToShipCard } from "@/components/admin/dashboard/to-ship-card";
import { RangeTabs } from "@/components/admin/dashboard/range-tabs";
import { SalesChart } from "@/components/admin/dashboard/sales-chart";
import { RecentOrdersTable } from "@/components/admin/dashboard/recent-orders-table";
import { TopProducts, LowStock } from "@/components/admin/dashboard/product-lists";
import { formatINR, formatINRPaise } from "@/lib/format";
import { PageHeader } from "@/components/layout/page-header";

/**
 * Blocking, like every other admin route — see the fuller note in
 * admin/reviews/page.tsx. The abandoned-cart row still streams on its own
 * <Suspense>: `instant` governs route validation, not inner boundaries.
 */
export const instant = false;

/**
 * The admin home, laid out the way Shopify's is: what needs DOING first, then
 * how the shop is doing, then the detail.
 *
 *   1. To ship — paid (or COD) orders not yet shipped. Exists because a paid
 *      order once went unnoticed; it was one line of "Recent orders".
 *   2. Sales, orders, average order value, new customers — for the range the
 *      owner picks, each against the period before.
 *   3. Sales chart · To do (stock, returns, reviews, unpaid checkouts).
 *   4. Recent orders (All / To ship / Unpaid) · Top products · Low stock.
 *
 * NewOrderWatcher in the admin layout refreshes this page when a new order
 * lands, so it never has to be reloaded by hand. Profit, costs and partner
 * shares are NOT here — they stay on the owner-only Finance page.
 */
export default async function AdminDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; tab?: string }>;
}) {
  const sp = await searchParams;
  const range = parseRange(sp.range);
  const tab = parseTab(sp.tab);

  const [session, data, attention] = await Promise.all([
    auth(),
    getDashboard(range, tab),
    getAttentionItems(),
  ]);

  const { kpis } = data;
  const versus = RANGE_LABELS[range].versus;
  const total = data.chart.reduce((s, b) => s + b.revenuePaise, 0);
  const best = data.chart.reduce((a, b) => (b.revenuePaise > a.revenuePaise ? b : a), data.chart[0]);

  const hour = Number(
    new Date(data.now).toLocaleString("en-IN", { hour: "numeric", hour12: false, timeZone: "Asia/Kolkata" })
  );
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const firstName = session?.user?.name?.split(" ")[0];

  return (
    // Full width and the shared PageHeader, like every other admin page — it
    // used to sit in its own centred max-w-7xl column with a hand-built
    // heading, and read as a different app.
    <div className="space-y-6">
      <PageHeader
        title={`${greeting}${firstName ? `, ${firstName}` : ""}`}
        description={new Date(data.now).toLocaleDateString("en-IN", {
          weekday: "long",
          day: "numeric",
          month: "long",
          timeZone: "Asia/Kolkata",
        })}
        actions={<RangeTabs current={range} tab={tab} />}
      />

      <ToShipCard rows={data.toShip} count={data.toShipCount} now={data.now} />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label={`Sales · ${RANGE_LABELS[range].label}`}
          value={formatINR(kpis.sales.current)}
          trend={kpis.sales}
          format={formatINR}
          versus={versus}
        />
        <StatCard
          label="Orders"
          value={String(kpis.orders.current)}
          trend={kpis.orders}
          versus={versus}
        />
        <StatCard
          label="Average order value"
          value={formatINR(Math.round(kpis.aov.current))}
          trend={kpis.aov}
          format={(n) => formatINR(Math.round(n))}
          versus={versus}
        />
        <StatCard
          label="New customers"
          value={String(kpis.customers.current)}
          trend={kpis.customers}
          versus={versus}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <section aria-labelledby="sales-heading" className="rounded-lg border bg-card p-5 lg:col-span-2">
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="sales-heading" className="font-semibold">
              Sales {data.unit === "hour" ? "by hour" : "by day"}
            </h2>
            <p className="text-sm text-muted-foreground">
              {formatINRPaise(total)}
              {best && best.revenuePaise > 0 && (
                <>
                  {" · best "}
                  {data.unit === "hour"
                    ? new Date(best.at).toLocaleTimeString("en-IN", { hour: "numeric", timeZone: "Asia/Kolkata" })
                    : new Date(best.at).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                        timeZone: "Asia/Kolkata",
                      })}{" "}
                  ({formatINRPaise(best.revenuePaise)})
                </>
              )}
            </p>
          </div>
          <SalesChart buckets={data.chart} unit={data.unit} />
          <p className="mt-3 text-xs text-muted-foreground">
            Paid orders, plus cash-on-delivery orders that weren&apos;t cancelled. India time.
          </p>
        </section>

        <section aria-labelledby="todo-heading" className="rounded-lg border bg-card p-5">
          <h2 id="todo-heading" className="mb-3 font-semibold">
            To do
          </h2>
          <AttentionBlock
            items={attention}
            cartSlot={
              <Suspense fallback={<Skeleton className="h-9 w-44" />}>
                <AbandonedCartRow />
              </Suspense>
            }
          />
        </section>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <RecentOrdersTable orders={data.recent} tab={tab} range={range} />
        </div>
        <div className="space-y-6">
          <TopProducts products={data.topProducts} rangeLabel={RANGE_LABELS[range].label} />
          <LowStock products={data.lowStock} />
        </div>
      </div>
    </div>
  );
}

/**
 * Abandoned carts, streamed on its own — the slowest query here.
 * Renders nothing when there are none.
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
