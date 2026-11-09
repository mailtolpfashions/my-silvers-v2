import type { Coupon, Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db";
import { toPaise } from "@/server/orders/money";

/**
 * Discount codes.
 *
 * Decisions agreed with the shop owner (2026-11-09):
 *   - A coupon discounts the PRODUCTS only — never shipping or gift wrap.
 *   - Free shipping is judged on the subtotal BEFORE the discount, so applying
 *     a code can never push a cart back under the threshold and add ₹49.
 *   - One code per order.
 *   - "First order" means no earlier order from this email OR this mobile
 *     number — email alone is beaten by typing a new address each time.
 *
 * The browser only ever gets a PREVIEW (cart, checkout summary). The binding
 * check is the one create-order.ts runs while placing the order, with the
 * prices read from the database and the email/mobile actually being used.
 */

export class CouponError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CouponError";
  }
}

export function normaliseCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, "");
}

/** Who is ordering — whatever is known at this point. */
export type CouponShopper = {
  userId?: string | null;
  email?: string | null;
  /** Bare 10-digit mobile, as checkout stores it. */
  phone?: string | null;
};

/**
 * Orders that count as having "ordered before": anything not cancelled whose
 * money is real — COD, or a Razorpay payment that went through (refunded and
 * returned orders included; they were orders). An abandoned Razorpay attempt
 * stuck at `pending`/`failed` is not an order and does not use up a first-order
 * code.
 */
const REAL_ORDER: Prisma.OrderWhereInput = {
  orderStatus: { not: "cancelled" },
  OR: [{ paymentMethod: "cod" }, { paymentStatus: { in: ["paid", "paying", "refunded"] } }],
};

function shopperOrders(shopper: CouponShopper): Prisma.OrderWhereInput | null {
  const who: Prisma.OrderWhereInput[] = [];
  if (shopper.userId) who.push({ userId: shopper.userId });
  if (shopper.email) {
    who.push({ user: { email: { equals: shopper.email.trim(), mode: "insensitive" } } });
  }
  if (shopper.phone) who.push({ shippingAddress: { path: ["phone"], equals: shopper.phone } });
  return who.length ? { AND: [REAL_ORDER, { OR: who }] } : null;
}

/** The discount a coupon gives on a product subtotal, in paise. */
export function discountFor(coupon: Coupon, subtotalPaise: number): number {
  let paise =
    coupon.type === "percent"
      ? Math.floor((subtotalPaise * Number(coupon.value)) / 100)
      : toPaise(coupon.value);
  if (coupon.type === "percent" && coupon.maxDiscount !== null) {
    paise = Math.min(paise, toPaise(coupon.maxDiscount));
  }
  // Never more than the products cost: a ₹500-off code on a ₹400 cart makes
  // the products free, not the shipping.
  return Math.max(0, Math.min(paise, subtotalPaise));
}

const rupees = (paise: number) =>
  `₹${(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

/**
 * Checks a code against a cart and a shopper. Throws CouponError with a
 * message meant for the shopper; returns the coupon and the discount.
 *
 * `tx` lets create-order run the check inside its own transaction.
 */
export async function evaluateCoupon(
  rawCode: string,
  subtotalPaise: number,
  shopper: CouponShopper,
  db: Prisma.TransactionClient = prisma,
): Promise<{ coupon: Coupon; discountPaise: number }> {
  const code = normaliseCode(rawCode);
  if (!code) throw new CouponError("Please enter a coupon code.");

  const coupon = await db.coupon.findUnique({ where: { code } });
  if (!coupon || !coupon.active) throw new CouponError(`“${code}” isn't a valid coupon code.`);

  const now = new Date();
  if (coupon.startsAt && coupon.startsAt > now) {
    throw new CouponError(`“${code}” isn't active yet.`);
  }
  if (coupon.endsAt && coupon.endsAt < now) throw new CouponError(`“${code}” has expired.`);

  if (coupon.minOrderValue !== null) {
    const short = toPaise(coupon.minOrderValue) - subtotalPaise;
    if (short > 0) throw new CouponError(`Add ${rupees(short)} more to use “${code}”.`);
  }

  if (coupon.usageLimit !== null) {
    const used = await db.order.count({ where: { couponId: coupon.id, ...REAL_ORDER } });
    if (used >= coupon.usageLimit) {
      throw new CouponError(`“${code}” has been fully used — sorry!`);
    }
  }

  const mine = shopperOrders(shopper);
  if (mine) {
    if (coupon.firstOrderOnly && (await db.order.count({ where: mine })) > 0) {
      throw new CouponError(`“${code}” is for first orders only.`);
    }
    if (
      coupon.onePerCustomer &&
      (await db.order.count({ where: { AND: [mine, { couponId: coupon.id }] } })) > 0
    ) {
      throw new CouponError(`You've already used “${code}”.`);
    }
  }

  const discountPaise = discountFor(coupon, subtotalPaise);
  if (discountPaise <= 0) throw new CouponError(`“${code}” doesn't apply to this cart.`);
  return { coupon, discountPaise };
}
