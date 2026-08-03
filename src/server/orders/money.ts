import type { Prisma } from "@/generated/prisma/client";

/**
 * All order math happens in integer paise to avoid float drift.
 * Decimal columns are written back as fixed 2-decimal strings.
 */
export function toPaise(amount: Prisma.Decimal | string | number): number {
  return Math.round(Number(amount) * 100);
}

export function paiseToRupeeString(paise: number): string {
  return (paise / 100).toFixed(2);
}

export const FREE_SHIPPING_THRESHOLD_PAISE = 999 * 100;
export const SHIPPING_CHARGE_PAISE = 49 * 100;
/**
 * Per-item cap in a single order. Low for jewellery: pieces are often unique
 * or near-unique, a genuine customer rarely wants more than a matching pair,
 * and a large quantity of one design is more often a reseller or card testing.
 * The effective cap is min(this, product.stock) — see server/cart.ts.
 */
export const MAX_ITEM_QUANTITY = 3;

export function shippingChargePaise(subtotalPaise: number): number {
  return subtotalPaise >= FREE_SHIPPING_THRESHOLD_PAISE ? 0 : SHIPPING_CHARGE_PAISE;
}
