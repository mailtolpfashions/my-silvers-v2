import { prisma } from "@/server/db";
import { PageHeader } from "@/components/layout/page-header";
import { CouponManager, type CouponRow } from "@/components/admin/coupon-manager";

/** Blocking, like every other admin route — see admin/reviews/page.tsx. */
export const instant = false;

/** A Date as the IST calendar day, for <input type="date">. */
function istDay(d: Date | null): string {
  if (!d) return "";
  return new Date(d.getTime() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export default async function AdminCouponsPage() {
  const [coupons, usage] = await Promise.all([
    prisma.coupon.findMany({ orderBy: [{ active: "desc" }, { createdAt: "desc" }] }),
    // Same definition of "used" as the usage limit in server/coupons/coupons.ts:
    // not cancelled, and money actually came in (COD or a payment that cleared).
    prisma.order.groupBy({
      by: ["couponId"],
      where: {
        couponId: { not: null },
        orderStatus: { not: "cancelled" },
        OR: [{ paymentMethod: "cod" }, { paymentStatus: { in: ["paid", "paying", "refunded"] } }],
      },
      _count: true,
      _sum: { discount: true },
    }),
  ]);
  const byCoupon = new Map(usage.map((u) => [u.couponId, u]));
  const now = new Date();

  const rows: CouponRow[] = coupons.map((c) => {
    const u = byCoupon.get(c.id);
    const used = u?._count ?? 0;
    const status: CouponRow["status"] = !c.active
      ? "off"
      : c.endsAt && c.endsAt < now
        ? "expired"
        : c.startsAt && c.startsAt > now
          ? "scheduled"
          : c.usageLimit !== null && used >= c.usageLimit
            ? "used up"
            : "live";
    return {
      id: c.id,
      code: c.code,
      description: c.description ?? "",
      type: c.type,
      value: Number(c.value),
      minOrderValue: c.minOrderValue === null ? null : Number(c.minOrderValue),
      maxDiscount: c.maxDiscount === null ? null : Number(c.maxDiscount),
      startsOn: istDay(c.startsAt),
      endsOn: istDay(c.endsAt),
      usageLimit: c.usageLimit,
      onePerCustomer: c.onePerCustomer,
      firstOrderOnly: c.firstOrderOnly,
      active: c.active,
      used,
      given: Number(u?._sum.discount ?? 0),
      status,
    };
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Coupons"
        description="Discount codes shoppers enter at the cart or checkout. A coupon takes money off the products only — never shipping or gift wrap — and one code applies per order."
      />
      <CouponManager coupons={rows} />
    </div>
  );
}
