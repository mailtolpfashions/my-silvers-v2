import { connection } from "next/server";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db";
import { requireRoleForPage } from "@/server/auth/require-role";

/**
 * Everything the admin home page shows, read in one go.
 *
 * ── Why this replaced stats.ts on the dashboard ─────────────────────────────
 * A customer paid and nobody noticed: the old page led with lifetime totals,
 * and a paid order only appeared as one line of "Recent orders", among
 * unpaid and cancelled ones. This page leads with what has to be DONE — the
 * orders waiting to be shipped — and then how the shop is doing over a range
 * the owner picks (today, 7 days, 30 days).
 *
 * ── The clock is live, on purpose ───────────────────────────────────────────
 * stats.ts read its clock through scheduleNow(), a cached scope that can be up
 * to ten minutes stale — fine for a 30-day trend, wrong for "today", where an
 * order paid two minutes ago has to count. connection() declares this scope
 * request-time, which is what lets `Date.now()` be read here at all under
 * cacheComponents (see the note in admin/layout.tsx).
 *
 * ── Days are India's days ───────────────────────────────────────────────────
 * "Today" starts at midnight IST, not UTC. In UTC the shop's day would turn
 * over at 5:30 in the morning, and an order placed at 1 a.m. would belong to
 * yesterday on the owner's own dashboard.
 */

export type DashboardRange = "today" | "7d" | "30d";

export const RANGE_LABELS: Record<DashboardRange, { label: string; versus: string }> = {
  today: { label: "Today", versus: "vs yesterday at this time" },
  "7d": { label: "Last 7 days", versus: "vs the 7 days before" },
  "30d": { label: "Last 30 days", versus: "vs the 30 days before" },
};

export function parseRange(value: unknown): DashboardRange {
  return value === "7d" || value === "30d" ? value : "today";
}

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const IST_OFFSET = 5.5 * HOUR;

/** Midnight IST at the start of the IST day containing `t`, as a UTC instant. */
function istDayStart(t: number) {
  return Math.floor((t + IST_OFFSET) / DAY) * DAY - IST_OFFSET;
}

/** "2026-11-16" / "2026-11-16T14" in IST — the bucket keys, on both sides. */
function istKey(t: number, unit: "day" | "hour") {
  const iso = new Date(t + IST_OFFSET).toISOString();
  return unit === "day" ? iso.slice(0, 10) : iso.slice(0, 13);
}

function bounds(range: DashboardRange, now: number) {
  const days = range === "today" ? 1 : range === "7d" ? 7 : 30;
  const from = istDayStart(now) - (days - 1) * DAY;
  // The comparison is the same length of time immediately before — and for
  // Today, yesterday only UP TO THIS HOUR, so 11 a.m. isn't measured against
  // the whole of yesterday.
  const span = range === "today" ? now - from : days * DAY;
  return {
    from: new Date(from),
    to: new Date(now),
    prevFrom: new Date(from - (range === "today" ? DAY : span)),
    prevTo: new Date(range === "today" ? now - DAY : from),
    unit: (range === "today" ? "hour" : "day") as "hour" | "day",
    buckets: range === "today" ? 24 : days,
    start: from,
  };
}

/**
 * A sale, for every figure on this page: paid online, or COD not cancelled.
 * The same rule as REVENUE_WHERE in stats.ts and the Finance page.
 */
const SALE_WHERE: Prisma.OrderWhereInput = {
  OR: [
    { paymentStatus: "paid" },
    { paymentMethod: "cod", orderStatus: { notIn: ["cancelled"] } },
  ],
};

/**
 * Waiting to be shipped: money is in (or it is COD), it isn't cancelled, and
 * no shipment has been created. The ONE definition — the To ship card, the
 * orders tab and the live alert (/api/admin/live) all use it, so the number
 * in the tab title and the list on the page can never disagree.
 */
export const TO_SHIP_WHERE: Prisma.OrderWhereInput = {
  orderStatus: { in: ["placed", "confirmed", "processing"] },
  shipmentCreatedAt: null,
  OR: [{ paymentStatus: "paid" }, { paymentMethod: "cod" }],
};

/** Online checkouts nobody paid for yet — the "Unpaid" tab. */
const UNPAID_WHERE: Prisma.OrderWhereInput = {
  paymentMethod: "razorpay",
  paymentStatus: { in: ["pending", "paying"] },
  orderStatus: { not: "cancelled" },
};

export type RecentTab = "all" | "to-ship" | "unpaid";
export function parseTab(value: unknown): RecentTab {
  return value === "to-ship" || value === "unpaid" ? value : "all";
}

type Kpi = { current: number; previous: number };

export async function getDashboard(range: DashboardRange, tab: RecentTab) {
  await requireRoleForPage("admin");
  await connection();
  const now = Date.now();
  const b = bounds(range, now);
  const inRange = { createdAt: { gte: b.from, lte: b.to } };
  const inPrev = { createdAt: { gte: b.prevFrom, lt: b.prevTo } };

  const [
    toShip,
    toShipCount,
    salesNow,
    salesPrev,
    customersNow,
    customersPrev,
    series,
    topProducts,
    lowStock,
    recent,
  ] = await Promise.all([
    prisma.order.findMany({
      where: TO_SHIP_WHERE,
      orderBy: { createdAt: "asc" },
      take: 8,
      select: {
        id: true,
        orderNumber: true,
        createdAt: true,
        totalAmount: true,
        paymentMethod: true,
        shippingAddress: true,
        user: { select: { name: true, email: true } },
        _count: { select: { items: true } },
      },
    }),
    prisma.order.count({ where: TO_SHIP_WHERE }),
    prisma.order.aggregate({ _sum: { totalAmount: true }, _count: true, where: { ...SALE_WHERE, ...inRange } }),
    prisma.order.aggregate({ _sum: { totalAmount: true }, _count: true, where: { ...SALE_WHERE, ...inPrev } }),
    prisma.user.count({ where: { role: "customer", ...inRange } }),
    prisma.user.count({ where: { role: "customer", ...inPrev } }),
    salesSeries(b.from, b.unit),
    prisma.$queryRaw<Array<{ productId: string | null; name: string; units: bigint; revenue: string }>>`
      SELECT oi."productId", oi."name",
             SUM(oi."quantity")::bigint AS units,
             SUM(oi."price" * oi."quantity")::text AS revenue
      FROM "OrderItem" oi
      JOIN "Order" o ON o."id" = oi."orderId"
      WHERE o."createdAt" >= ${b.from} AND o."createdAt" <= ${b.to}
        AND (o."paymentStatus" = 'paid'
             OR (o."paymentMethod" = 'cod' AND o."orderStatus" != 'cancelled'))
      GROUP BY oi."productId", oi."name"
      ORDER BY SUM(oi."price" * oi."quantity") DESC
      LIMIT 5
    `,
    prisma.product.findMany({
      where: { isActive: true, stock: { lte: 5 } },
      orderBy: [{ stock: "asc" }, { name: "asc" }],
      take: 6,
      select: { id: true, name: true, stock: true, images: true },
    }),
    prisma.order.findMany({
      where: tab === "to-ship" ? TO_SHIP_WHERE : tab === "unpaid" ? UNPAID_WHERE : {},
      orderBy: { createdAt: "desc" },
      take: 10,
      include: { user: { select: { name: true, email: true } } },
    }),
  ]);

  // Gap-filled buckets, keyed in IST on both sides — see istKey.
  const byKey = new Map(series.map((r) => [r.key, r.revenuePaise]));
  const step = b.unit === "hour" ? HOUR : DAY;
  const chart = Array.from({ length: b.buckets }, (_, i) => {
    const t = b.start + i * step;
    return { key: istKey(t, b.unit), at: t, revenuePaise: byKey.get(istKey(t, b.unit)) ?? 0, future: t > now };
  });

  const sales: Kpi = {
    current: Number(salesNow._sum.totalAmount ?? 0),
    previous: Number(salesPrev._sum.totalAmount ?? 0),
  };
  const orders: Kpi = { current: salesNow._count, previous: salesPrev._count };
  const aov: Kpi = {
    current: orders.current ? sales.current / orders.current : 0,
    previous: orders.previous ? sales.previous / orders.previous : 0,
  };

  return {
    now,
    unit: b.unit,
    toShip: toShip.map((o) => {
      const address = (o.shippingAddress ?? {}) as { city?: string; fullName?: string };
      return {
        id: o.id,
        orderNumber: o.orderNumber,
        createdAt: o.createdAt,
        total: Number(o.totalAmount),
        cod: o.paymentMethod === "cod",
        // Who ordered (the account) and who it goes to (the address) can be
        // different people — a gift, or ordering for family. The card shows
        // both, so it matches the Recent orders table, which lists the account.
        customer: o.user?.name || o.user?.email || DELETED_CUSTOMER.name,
        recipient: address.fullName?.trim() || null,
        city: address.city ?? null,
        items: o._count.items,
      };
    }),
    toShipCount,
    kpis: {
      sales,
      orders,
      aov,
      customers: { current: customersNow, previous: customersPrev } as Kpi,
    },
    chart,
    topProducts: topProducts.map((p) => ({
      productId: p.productId,
      name: p.name,
      units: Number(p.units),
      revenue: Number(p.revenue),
    })),
    lowStock,
    recent: recent.map((o) => ({ ...o, user: o.user ?? DELETED_CUSTOMER })),
  };
}

/**
 * Stands in for an order's account when the account comes back missing.
 *
 * The schema says that cannot happen — Order.user is required and the foreign
 * key refuses to delete a customer who has orders. It happened anyway, once:
 * Prisma loads an `include`d relation with a SECOND query, so an account
 * deleted between the two (the e2e suite's cleanup does exactly that — orders
 * first, then the user) comes back null, and `o.user.name` took the whole
 * dashboard down. One unlucky row should cost one name, not the page.
 */
const DELETED_CUSTOMER = { name: "Deleted customer", email: "" };

/** Sales per IST hour (Today) or IST day, from `from` onwards. */
async function salesSeries(from: Date, unit: "hour" | "day") {
  // `createdAt` is a UTC timestamp without zone: read it as UTC, shift to
  // India, then bucket — so the keys match istKey() exactly.
  const rows = await prisma.$queryRaw<Array<{ bucket: Date; revenue: string }>>`
    SELECT date_trunc(${unit}, ("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Kolkata') AS bucket,
           COALESCE(SUM("totalAmount"), 0)::text AS revenue
    FROM "Order"
    WHERE "createdAt" >= ${from}
      AND ("paymentStatus" = 'paid'
           OR ("paymentMethod" = 'cod' AND "orderStatus" != 'cancelled'))
    GROUP BY 1
  `;
  return rows.map((r) => ({
    // The bucket comes back as a zone-less IST wall time, which the driver
    // hands over as if it were UTC — so its ISO string IS the IST key.
    key: unit === "day" ? r.bucket.toISOString().slice(0, 10) : r.bucket.toISOString().slice(0, 13),
    revenuePaise: Math.round(Number(r.revenue) * 100),
  }));
}

/** For /api/admin/live — the cheapest possible "anything new to ship?". */
export async function getLiveToShip() {
  const [count, newest] = await Promise.all([
    prisma.order.count({ where: TO_SHIP_WHERE }),
    prisma.order.findFirst({
      where: TO_SHIP_WHERE,
      orderBy: { createdAt: "desc" },
      select: { id: true, orderNumber: true, totalAmount: true },
    }),
  ]);
  return {
    toShip: count,
    newest: newest
      ? { id: newest.id, orderNumber: newest.orderNumber, total: Number(newest.totalAmount) }
      : null,
  };
}
