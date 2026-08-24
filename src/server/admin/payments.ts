import "server-only";
import { prisma } from "@/server/db";
import { requireRole } from "@/server/auth/require-role";
import type { PaymentStatus, RefundStatus } from "@/generated/prisma/enums";

/**
 * Money movement, viewed as money rather than as orders.
 *
 * Everything here is already on Order — the point is the angle. Orders answers
 * "what does this customer get"; this answers "did the money arrive, and where
 * is it stuck". Those are different questions and they were only reachable by
 * opening orders one at a time.
 */

export type PaymentFilter = "all" | "paid" | "pending" | "failed" | "refunds" | "cod";

export const PAYMENT_PAGE_SIZE = 40;

/**
 * Sortable columns, as an allowlist — the key arrives from the query string and
 * must never reach orderBy directly. See the note in server/products/admin.ts.
 *
 * The Razorpay payment ID is absent on purpose: it is an opaque gateway
 * reference, so ordering by it groups nothing a person is looking for. Sorting
 * by `refund` orders on refund STATUS rather than amount — the question that
 * column is scanned for is "which of these went back", not "how much".
 */
export const PAYMENT_SORTS = {
  order: (dir: SortDir) => ({ createdAt: dir }),
  customer: (dir: SortDir) => ({ user: { name: dir } }),
  method: (dir: SortDir) => ({ paymentMethod: dir }),
  status: (dir: SortDir) => ({ paymentStatus: dir }),
  refund: (dir: SortDir) => ({ refundStatus: dir }),
  amount: (dir: SortDir) => ({ totalAmount: dir }),
} as const;

type SortDir = "asc" | "desc";
export type PaymentSortKey = keyof typeof PAYMENT_SORTS;

export function isPaymentSortKey(value: unknown): value is PaymentSortKey {
  return typeof value === "string" && value in PAYMENT_SORTS;
}

function whereFor(filter: PaymentFilter) {
  switch (filter) {
    case "paid":
      return { paymentStatus: "paid" as PaymentStatus };
    case "failed":
      return { paymentStatus: "failed" as PaymentStatus };
    /**
     * `pending` AND `paying`.
     *
     * `paying` is the transient claimed state fulfillOrder() sets — an order
     * sitting in it is mid-flight or, more usefully, stuck mid-flight. Folding
     * it in with pending is deliberate: from a money point of view both mean
     * "we have not been paid yet", and separating them would hide the stuck
     * ones behind a tab nobody opens.
     */
    case "pending":
      return { paymentStatus: { in: ["pending", "paying"] as PaymentStatus[] } };
    case "refunds":
      return { refundStatus: { not: "idle" as RefundStatus } };
    case "cod":
      return { paymentMethod: "cod" as const };
    default:
      return {};
  }
}

export async function listPayments({
  filter = "all",
  page = 1,
  sort = "order",
  dir = "desc",
}: {
  filter?: PaymentFilter;
  page?: number;
  sort?: PaymentSortKey;
  dir?: SortDir;
}) {
  await requireRole("admin");
  const where = whereFor(filter);
  const skip = (Math.max(1, page) - 1) * PAYMENT_PAGE_SIZE;

  const [rows, total] = await Promise.all([
    prisma.order.findMany({
      where,
      orderBy: PAYMENT_SORTS[sort](dir),
      skip,
      take: PAYMENT_PAGE_SIZE,
      select: {
        id: true,
        orderNumber: true,
        createdAt: true,
        totalAmount: true,
        paymentMethod: true,
        paymentStatus: true,
        refundStatus: true,
        refundAmount: true,
        refundProcessedAt: true,
        razorpayPaymentId: true,
        razorpayOrderId: true,
        user: { select: { name: true, email: true } },
      },
    }),
    prisma.order.count({ where }),
  ]);

  return { rows, total, page: Math.max(1, page), pageSize: PAYMENT_PAGE_SIZE };
}

/** Tab counts, plus the two totals worth seeing without opening anything. */
export async function paymentCounts() {
  await requireRole("admin");
  const [all, paid, pending, failed, refunds, cod, capturedSum, refundedSum] = await Promise.all([
    prisma.order.count(),
    prisma.order.count({ where: { paymentStatus: "paid" } }),
    prisma.order.count({ where: { paymentStatus: { in: ["pending", "paying"] } } }),
    prisma.order.count({ where: { paymentStatus: "failed" } }),
    prisma.order.count({ where: { refundStatus: { not: "idle" } } }),
    prisma.order.count({ where: { paymentMethod: "cod" } }),
    prisma.order.aggregate({ where: { paymentStatus: "paid" }, _sum: { totalAmount: true } }),
    prisma.order.aggregate({
      where: { refundStatus: "completed" },
      _sum: { refundAmount: true },
    }),
  ]);

  return {
    all,
    paid,
    pending,
    failed,
    refunds,
    cod,
    captured: Number(capturedSum._sum.totalAmount?.toString() ?? 0),
    refunded: Number(refundedSum._sum.refundAmount?.toString() ?? 0),
  };
}
