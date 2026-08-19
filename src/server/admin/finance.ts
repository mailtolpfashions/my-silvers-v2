import "server-only";
import { prisma } from "@/server/db";
import { requireRole } from "@/server/auth/require-role";

/**
 * The partners' books.
 *
 * ⚠️  A LEDGER, NOT ACCOUNTING SOFTWARE. It answers "what did we make this
 * period and what is my share of it" for a handful of people who know each
 * other. It is not double-entry, it knows nothing about tax, and nothing here
 * should ever be handed to an accountant, a bank or a tax authority as though
 * it were books of account.
 *
 * ── Every function re-checks the role ────────────────────────────────────────
 * Middleware gates the /admin routes, and that is not enough. These are the
 * most sensitive figures in the application, and a reader that forgets its own
 * guard leaks them the first time someone calls it from a new place. Same
 * defence-in-depth rule as every mutating entry point — see require-role.ts.
 */

/** Rupee amounts cross this boundary as numbers. Decimal is a DB concern. */
const money = (d: { toString(): string } | null | undefined) => (d ? Number(d.toString()) : 0);

export type Period = { from: Date; to: Date };

/**
 * A calendar month, in the server's timezone.
 *
 * Deliberately not "last 30 days": partners settle up by month, and a rolling
 * window means two people asking on different days get different answers for
 * the same January.
 */
export function monthPeriod(year: number, monthIndex: number): Period {
  return {
    from: new Date(year, monthIndex, 1, 0, 0, 0, 0),
    to: new Date(year, monthIndex + 1, 1, 0, 0, 0, 0),
  };
}

export type FinanceSummary = {
  /** Goods sold, excluding what the shopper paid for delivery. */
  productRevenue: number;
  /**
   * Delivery charged to shoppers. Reported beside revenue, never inside it —
   * see the note on getFinanceSummary.
   */
  shippingCollected: number;
  /** Refunds actually paid out in the period, subtracted from revenue. */
  refunded: number;
  /** Cost of the goods sold, from the per-line snapshots. */
  costOfGoods: number;
  grossProfit: number;
  expenses: number;
  netProfit: number;
  orderCount: number;
  /**
   * Sold lines carrying no cost snapshot.
   *
   * ⚠️  This must be surfaced in the UI. Such lines are excluded from
   * costOfGoods rather than counted as free, which means gross profit is
   * OVERSTATED by whatever they actually cost. A number that is quietly wrong
   * is worse than one that says how wrong it is.
   */
  linesMissingCost: number;
};

/**
 * Revenue, cost and profit for a period.
 *
 * ── Only paid orders count ───────────────────────────────────────────────────
 * Pending and failed orders are not money. A COD order counts once fulfilment
 * marks it paid on delivery.
 *
 * ── Shipping is reported separately, not as revenue ──────────────────────────
 * What a shopper pays for delivery is collected on the courier's behalf and
 * handed straight over. Counting it as revenue while the courier's invoice sits
 * in Expenses would inflate profit on paper and deflate it again when the bill
 * is entered — the same money moving twice. It sits beside revenue instead, so
 * it can be reconciled against the `shipping` expense category.
 */
export async function getFinanceSummary(period: Period): Promise<FinanceSummary> {
  await requireRole("admin");

  const paidInPeriod = {
    paymentStatus: "paid" as const,
    createdAt: { gte: period.from, lt: period.to },
  };

  const [orderTotals, refunds, lines, expenseTotal] = await Promise.all([
    prisma.order.aggregate({
      where: paidInPeriod,
      _sum: { subtotal: true, shippingCharge: true },
      _count: true,
    }),
    // Grouped on refundProcessedAt, NOT createdAt: a refund belongs to the
    // period it was PAID OUT in, which is rarely the period of the order.
    prisma.order.aggregate({
      where: { refundProcessedAt: { gte: period.from, lt: period.to } },
      _sum: { refundAmount: true },
    }),
    prisma.orderItem.findMany({
      where: { order: paidInPeriod },
      select: { costPrice: true, quantity: true },
    }),
    prisma.expense.aggregate({
      where: { spentAt: { gte: period.from, lt: period.to } },
      _sum: { amount: true },
    }),
  ]);

  let costOfGoods = 0;
  let linesMissingCost = 0;
  for (const line of lines) {
    if (line.costPrice === null) {
      linesMissingCost += 1;
      continue;
    }
    costOfGoods += money(line.costPrice) * line.quantity;
  }

  const productRevenue = money(orderTotals._sum.subtotal);
  const shippingCollected = money(orderTotals._sum.shippingCharge);
  const refunded = money(refunds._sum.refundAmount);
  const expenses = money(expenseTotal._sum.amount);
  const grossProfit = productRevenue - refunded - costOfGoods;

  return {
    productRevenue,
    shippingCollected,
    refunded,
    costOfGoods,
    grossProfit,
    expenses,
    netProfit: grossProfit - expenses,
    orderCount: orderTotals._count,
    linesMissingCost,
  };
}

export type InvestorRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  isActive: boolean;
  note: string | null;
  /** The manually-set percentage the split uses. */
  profitShare: number;
  /** Everything this partner has ever put in. */
  contributed: number;
  /** Their contributions as a share of all contributions, for comparison only. */
  contributedShare: number;
  /** Their cut of the period's net profit. Negative in a losing month. */
  periodProfit: number;
};

export type ProfitSplit = {
  investors: InvestorRow[];
  netProfit: number;
  totalContributed: number;
  /** Sum of profitShare across ACTIVE partners. Should be 100. */
  sharesTotal: number;
  /**
   * True when the shares do not add up to 100.
   *
   * Not corrected automatically, and that is deliberate: silently normalising
   * 40/40/40 to a third each would hand someone a different number from the one
   * they are looking at. The page says so; the humans decide.
   */
  sharesUnbalanced: boolean;
};

/**
 * Who is owed what.
 *
 * The split uses `profitShare`, set by hand — see the note on the model.
 * `contributedShare` is computed alongside it purely so the two can be
 * compared: a stake reflecting effort rather than cash will differ from the
 * money ratio on purpose, and seeing both is the point.
 */
export async function getProfitSplit(period: Period): Promise<ProfitSplit> {
  await requireRole("admin");

  const [investors, summary] = await Promise.all([
    prisma.investor.findMany({
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
      include: { investments: { select: { amount: true } } },
    }),
    getFinanceSummary(period),
  ]);

  const contributions = investors.map((i) =>
    i.investments.reduce((sum, c) => sum + money(c.amount), 0),
  );
  const totalContributed = contributions.reduce((a, b) => a + b, 0);
  const sharesTotal = investors
    .filter((i) => i.isActive)
    .reduce((sum, i) => sum + money(i.profitShare), 0);

  return {
    netProfit: summary.netProfit,
    totalContributed,
    sharesTotal,
    // A hair of tolerance, for decimal shares like 33.33 three times over.
    sharesUnbalanced: Math.abs(sharesTotal - 100) > 0.05,
    investors: investors.map((investor, index) => {
      const contributed = contributions[index];
      const share = money(investor.profitShare);
      return {
        id: investor.id,
        name: investor.name,
        email: investor.email,
        phone: investor.phone,
        isActive: investor.isActive,
        note: investor.note,
        profitShare: share,
        contributed,
        contributedShare: totalContributed > 0 ? (contributed / totalContributed) * 100 : 0,
        // A former partner takes no cut of a period they are no longer in.
        periodProfit: investor.isActive ? (summary.netProfit * share) / 100 : 0,
      };
    }),
  };
}

/** Expenses in a period, newest first. */
export async function listExpenses(period: Period) {
  await requireRole("admin");
  return prisma.expense.findMany({
    where: { spentAt: { gte: period.from, lt: period.to } },
    orderBy: { spentAt: "desc" },
    include: { recordedBy: { select: { name: true, email: true } } },
  });
}

/** Expense totals by category, for the period breakdown. */
export async function expensesByCategory(period: Period) {
  await requireRole("admin");
  const rows = await prisma.expense.groupBy({
    by: ["category"],
    where: { spentAt: { gte: period.from, lt: period.to } },
    _sum: { amount: true },
  });
  return rows
    .map((r) => ({ category: r.category, total: money(r._sum.amount) }))
    .sort((a, b) => b.total - a.total);
}

/** Every contribution, newest first — the ledger behind the totals. */
export async function listInvestments() {
  await requireRole("admin");
  return prisma.investment.findMany({
    orderBy: { investedAt: "desc" },
    include: { investor: { select: { id: true, name: true } } },
  });
}

/**
 * How much of the catalogue carries a cost price.
 *
 * Shown at the top of the finance page, because it is the honest caveat on
 * every margin figure below it: until nothing is missing, gross profit is an
 * over-estimate by an unknown amount.
 */
export async function costCoverage() {
  await requireRole("admin");
  const [total, withCost] = await Promise.all([
    prisma.product.count({ where: { isActive: true } }),
    prisma.product.count({ where: { isActive: true, costPrice: { not: null } } }),
  ]);
  return { total, withCost, missing: total - withCost };
}
