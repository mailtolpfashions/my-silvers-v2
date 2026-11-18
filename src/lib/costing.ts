/**
 * The product costing calculator — owner only.
 *
 * The shop buys silver BY WEIGHT: silver rate per gram + making charge per
 * gram. Everything else that a sale costs is a shop-wide default (Settings →
 * Costing). From those, this works out the price that earns the target margin,
 * and the profit at any other price.
 *
 * Pure, with no imports, so the product form's live preview, the CSV import
 * and the server write all use one rule — a preview that disagreed with what
 * gets saved would be worse than none.
 *
 * ── The arithmetic ──────────────────────────────────────────────────────────
 *   purchase   = weight × (silver rate + making charge)
 *   For a selling price P (what the customer pays, GST included):
 *     net       = P ÷ (1 + GST)            what the shop keeps before costs
 *     gateway   = P × gateway %            Razorpay charges on the full amount
 *     profit    = net − purchase − packing − delivery − gateway
 *     margin    = profit ÷ net
 *   The price for a target margin m solves profit = m × net:
 *     P = (purchase + packing + delivery) ÷ ((1 − m) ÷ (1 + GST) − gateway %)
 *
 * Delivery and packing are per ORDER but counted per piece here — the safe
 * assumption, since a one-piece order is the one that has to stand on its own.
 * Gateway fees are counted on every sale even though COD orders don't pay
 * them; a COD order's ₹49 charge roughly covers the courier's COD fee instead.
 */

export type CostingDefaults = {
  /** ₹ per gram of silver — update when the rate moves. */
  silverRatePerGram: number;
  /** ₹ per gram — the usual making charge; a product can override it. */
  makingChargePerGram: number;
  /** ₹ per order: box, pouch, card, tape. */
  packingCost: number;
  /** ₹ per order the shop pays the courier and doesn't recover from the customer. */
  deliveryCost: number;
  /** % of the selling price the payment gateway keeps. */
  gatewayPercent: number;
  /** % GST on jewellery (3% in India for HSN 7113). */
  gstPercent: number;
  /** % of the GST-free price the shop aims to keep as profit. */
  targetMarginPercent: number;
};

export const COSTING_DEFAULTS: CostingDefaults = {
  silverRatePerGram: 0,
  makingChargePerGram: 0,
  packingCost: 25,
  deliveryCost: 60,
  gatewayPercent: 2,
  gstPercent: 3,
  targetMarginPercent: 40,
};

/** One product's own figures; a blank rate or making charge uses the default. */
export type ProductCostInput = {
  weightGrams: number | null;
  silverRatePerGram: number | null;
  makingChargePerGram: number | null;
};

export type Breakdown = {
  weightGrams: number;
  silverRate: number;
  makingCharge: number;
  silver: number;
  making: number;
  /** silver + making — what the piece cost to buy. Stored as the product's Cost price. */
  purchase: number;
  packing: number;
  delivery: number;
  /** purchase + packing + delivery — before gateway, which depends on the price. */
  fixedCosts: number;
};

const r2 = (n: number) => Math.round(n * 100) / 100;

/** The cost side, or null until there is a weight and a silver rate to work from. */
export function costBreakdown(input: ProductCostInput, d: CostingDefaults): Breakdown | null {
  const weight = input.weightGrams ?? 0;
  const rate = input.silverRatePerGram ?? d.silverRatePerGram;
  const making = input.makingChargePerGram ?? d.makingChargePerGram;
  if (!(weight > 0) || !(rate > 0)) return null;
  const silver = r2(weight * rate);
  const makingTotal = r2(weight * Math.max(0, making));
  const purchase = r2(silver + makingTotal);
  return {
    weightGrams: weight,
    silverRate: rate,
    makingCharge: Math.max(0, making),
    silver,
    making: makingTotal,
    purchase,
    packing: d.packingCost,
    delivery: d.deliveryCost,
    fixedCosts: r2(purchase + d.packingCost + d.deliveryCost),
  };
}

export type PriceResult = {
  price: number;
  net: number;
  gst: number;
  gateway: number;
  profit: number;
  /** % of net. */
  marginPercent: number;
};

/** Profit and margin at a given selling price (GST included). */
export function profitAt(price: number, b: Breakdown, d: CostingDefaults): PriceResult {
  const net = price / (1 + d.gstPercent / 100);
  const gateway = price * (d.gatewayPercent / 100);
  const profit = net - b.fixedCosts - gateway;
  return {
    price,
    net: r2(net),
    gst: r2(price - net),
    gateway: r2(gateway),
    profit: r2(profit),
    marginPercent: net > 0 ? Math.round((profit / net) * 1000) / 10 : 0,
  };
}

/**
 * The selling price (GST included, whole rupees, rounded up so the margin is
 * met) that earns the target margin — before any charm rounding, which the
 * caller applies with the shop's own rule. Null when the margin is impossible
 * (fees and GST would eat it before any cost is paid).
 */
export function suggestedPrice(b: Breakdown, d: CostingDefaults, marginPercent = d.targetMarginPercent): number | null {
  const m = marginPercent / 100;
  const denominator = (1 - m) / (1 + d.gstPercent / 100) - d.gatewayPercent / 100;
  if (denominator <= 0) return null;
  return Math.ceil(b.fixedCosts / denominator);
}
