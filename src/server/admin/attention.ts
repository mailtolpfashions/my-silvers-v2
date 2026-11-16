import "server-only";
import { prisma } from "@/server/db";
import { requireRoleForPage } from "@/server/auth/require-role";

/**
 * What needs doing, for the top of the dashboard.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 * The dashboard described the business — products, orders, customers, revenue —
 * and routed nowhere. Six sections were added around it and it linked to none
 * of them, so in practice it was a page you passed through on the way to the
 * sidebar. A dashboard should hand out work.
 *
 * ── Every item is a count and a destination ──────────────────────────────────
 * Nothing here is a metric. If a number cannot be acted on by clicking it, it
 * belongs in the stat cards below, not in this block.
 *
 * ── Zero is the goal, so zero disappears ─────────────────────────────────────
 * Items at zero are filtered out by the caller rather than rendered greyed out.
 * A list that is empty because there is nothing to do should BE empty — a row
 * of "0 out of stock, 0 failed payments" trains you to stop reading it.
 */

/** Matches LOW_STOCK_AT on the inventory page — see the note there. */
const LOW_STOCK_AT = 5;

export type AttentionItem = {
  key: string;
  count: number;
  /** Written for the count: "3 pieces out of stock". */
  label: (count: number) => string;
  href: string;
  /** Raised items read first and carry a warmer tone. */
  urgent?: boolean;
};

export async function getAttentionItems() {
  await requireRoleForPage("admin");
  // requireRoleForPage read cookies, so this scope is request-time and a live clock
  // is allowed here (see the note in admin/layout.tsx).
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [outOfStock, lowStock, pendingReviews, unverifiedReviews, failedPayments, pendingPayments, returnRequests] =
    await Promise.all([
      prisma.product.count({ where: { isActive: true, stock: 0 } }),
      prisma.product.count({ where: { isActive: true, stock: { gt: 0, lte: LOW_STOCK_AT } } }),
      prisma.review.count({ where: { status: "pending" } }),
      prisma.review.count({ where: { isVerifiedPurchase: false, status: "approved" } }),
      // Last 7 days only. Every checkout a shopper walks away from ends up
      // "failed" (the nightly sweep), so an all-time count only ever grows and
      // stops meaning anything.
      prisma.order.count({ where: { paymentStatus: "failed", createdAt: { gte: weekAgo } } }),
      // ONLINE orders only. COD orders are "pending" by design until the
      // courier collects — counting them here told the owner a COD order was
      // unpaid when it was in fact waiting to be shipped (the To ship card).
      // `paying` is the transient claimed state — an order sitting in it is
      // stuck, which is precisely what wants surfacing here.
      prisma.order.count({
        where: {
          paymentMethod: "razorpay",
          paymentStatus: { in: ["pending", "paying"] },
          orderStatus: { not: "cancelled" },
        },
      }),
      prisma.order.count({ where: { orderStatus: "return_requested" } }),
    ]);

  const items: AttentionItem[] = [
    {
      key: "returns",
      count: returnRequests,
      label: (n) => `${n} return${n === 1 ? "" : "s"} to action`,
      href: "/admin/orders?status=return_requested",
      urgent: true,
    },
    {
      key: "out-of-stock",
      count: outOfStock,
      label: (n) => `${n} piece${n === 1 ? "" : "s"} out of stock`,
      href: "/admin/inventory",
      urgent: true,
    },
    {
      key: "failed-payments",
      count: failedPayments,
      label: (n) => `${n} failed payment${n === 1 ? "" : "s"} this week`,
      href: "/admin/payments?filter=failed",
    },
    {
      key: "low-stock",
      count: lowStock,
      label: (n) => `${n} piece${n === 1 ? "" : "s"} running low`,
      href: "/admin/inventory",
    },
    {
      key: "pending-payments",
      count: pendingPayments,
      label: (n) => `${n} unpaid online checkout${n === 1 ? "" : "s"}`,
      href: "/admin/payments?filter=pending",
    },
    {
      key: "unverified-reviews",
      count: unverifiedReviews,
      label: (n) => `${n} unverified review${n === 1 ? "" : "s"}`,
      href: "/admin/reviews?filter=unverified",
    },
    {
      key: "pending-reviews",
      count: pendingReviews,
      label: (n) => `${n} review${n === 1 ? "" : "s"} awaiting approval`,
      /**
       * Urgent, unlike the "hidden reviews" row it replaces.
       *
       * That row was housekeeping — someone had already dealt with those. This
       * one is a customer's words sitting unread and invisible to every shopper
       * on the site, and the whole risk of the approval gate is that this pile
       * quietly grows until the shop looks like it has no reviews at all.
       */
      urgent: true,
      href: "/admin/reviews?filter=pending",
    },
  ];

  // Urgent first, then by size — the biggest pile of the same kind of work.
  return items
    .filter((item) => item.count > 0)
    .sort((a, b) => Number(b.urgent ?? false) - Number(a.urgent ?? false) || b.count - a.count);
}

/**
 * The abandoned-cart figure, fetched separately because it is expensive.
 *
 * ⚠️  Deliberately NOT part of getAttentionItems. Deciding whether a cart is
 * abandoned needs its items and the owner's order history, which cannot be a
 * COUNT — see server/admin/carts.ts. Keeping it apart lets the dashboard render
 * its cheap counts immediately and stream this one behind its own boundary,
 * rather than holding the whole block hostage to the slowest query on it.
 */
export async function getAbandonedCartSummary() {
  await requireRoleForPage("admin");
  const { listAbandonedCarts } = await import("@/server/admin/carts");
  const carts = await listAbandonedCarts();
  return {
    count: carts.length,
    value: carts.reduce((sum, cart) => sum + cart.value, 0),
  };
}
