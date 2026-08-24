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

/**
 * What shipping costs, and where it stops costing anything.
 *
 * Passed in rather than read here because these are admin-editable settings
 * (see server/settings/store-settings.ts) and this module is imported by client
 * components — the cart summary and the checkout form both do this arithmetic
 * to show a total before the server ever sees the order. Importing the settings
 * reader here would drag Prisma into the client bundle, so the rates travel as
 * a plain object from whichever server component is already fetching them.
 *
 * ⚠️  The figure shown to the shopper is not the binding one. create-order.ts
 * recomputes the charge server-side from the settings at the moment of sale and
 * snapshots the result onto the order.
 */
export type ShippingRates = {
  shippingChargePaise: number;
  freeShippingThresholdPaise: number;
};

/**
 * Per-item cap in a single order. Low for jewellery: pieces are often unique
 * or near-unique, a genuine customer rarely wants more than a matching pair,
 * and a large quantity of one design is more often a reseller or card testing.
 * The effective cap is min(this, product.stock) — see server/cart.ts.
 */
export const MAX_ITEM_QUANTITY = 3;

export function shippingChargePaise(subtotalPaise: number, rates: ShippingRates): number {
  return subtotalPaise >= rates.freeShippingThresholdPaise ? 0 : rates.shippingChargePaise;
}
