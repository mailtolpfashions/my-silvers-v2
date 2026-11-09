/**
 * A coupon's rules as one line of plain English — shared by the shopper's
 * "Available offers" list and the admin Coupons page, so both say the same
 * thing about the same code. Plain numbers in rupees; no server imports, so it
 * runs on either side.
 */
export type CouponTerms = {
  type: "percent" | "flat";
  value: number;
  maxDiscount: number | null;
  minOrderValue: number | null;
  firstOrderOnly: boolean;
  onePerCustomer: boolean;
};

const inr = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

/** "15% off, up to ₹750" / "₹200 off" */
export function couponHeadline(c: Pick<CouponTerms, "type" | "value" | "maxDiscount">): string {
  return c.type === "percent"
    ? `${c.value}% off${c.maxDiscount ? `, up to ${inr(c.maxDiscount)}` : ""}`
    : `${inr(c.value)} off`;
}

/** "on orders above ₹1,999 · first order only" — "" when there are no conditions. */
export function couponConditions(c: CouponTerms): string {
  const parts: string[] = [];
  if (c.minOrderValue) parts.push(`on orders above ${inr(c.minOrderValue)}`);
  if (c.firstOrderOnly) parts.push("first order only");
  else if (c.onePerCustomer) parts.push("once per customer");
  return parts.join(" · ");
}

export function describeCoupon(c: CouponTerms): string {
  const conditions = couponConditions(c);
  return conditions ? `${couponHeadline(c)} · ${conditions}` : couponHeadline(c);
}
