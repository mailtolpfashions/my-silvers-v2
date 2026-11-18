/**
 * The product costing calculator — owner only.
 *
 * The shop buys silver BY WEIGHT, in batches: each batch at that day's silver
 * rate, each piece with its own making charge. Both are recorded ON THE
 * PRODUCT and never come from a shop-wide figure — a piece bought at ₹110/g
 * must still be costed at ₹110/g after the market falls to ₹95, or it gets
 * sold at a loss. Only the costs of selling (packing, delivery, gateway, GST)
 * and the margin bands are shop-wide (Settings → Costing).
 *
 * Pure, with no imports, so the product form's live preview, the CSV import
 * and the server write all use one rule.
 *
 * ── The arithmetic ──────────────────────────────────────────────────────────
 *   purchase   = weight × (silver rate + making charge)
 *   For a selling price P (what the customer pays, GST included):
 *     net       = P ÷ (1 + GST)            what the shop keeps before costs
 *     gateway   = P × gateway %            Razorpay charges on the full amount
 *     profit    = net − purchase − packing − delivery − gateway
 *     margin    = profit ÷ net
 *   The price for a margin m solves profit = m × net:
 *     P = (purchase + packing + delivery) ÷ ((1 − m) ÷ (1 + GST) − gateway %)
 *
 * ── Margin by price band ────────────────────────────────────────────────────
 * The target margin depends on the selling price (under ₹1,000 / up to
 * ₹10,000 / above), and the selling price depends on the margin. Each band's
 * margin is tried, highest first; the first whose price lands inside that band
 * wins. When none does — 55% gives ₹1,050 (a 40% price) but 40% gives ₹870 (a
 * 55% price) — the price sits at the top of the lower band (₹999), whose
 * margin falls between the two targets.
 *
 * Delivery and packing are per ORDER but counted per piece here — the safe
 * assumption, since a one-piece order has to stand on its own.
 */

export type MarginBands = {
  /** % margin for a price under ₹1,000. */
  under1k: number;
  /** % margin for ₹1,000 – ₹10,000. */
  upTo10k: number;
  /** % margin above ₹10,000. */
  over10k: number;
};

export type CostingDefaults = {
  /** ₹ per order: box, pouch, card, tape. */
  packingCost: number;
  /** ₹ per order the shop pays the courier and doesn't recover from the customer. */
  deliveryCost: number;
  /** % of the selling price the payment gateway keeps. */
  gatewayPercent: number;
  /** % GST on jewellery (3% in India for HSN 7113). */
  gstPercent: number;
  margins: MarginBands;
};

export const COSTING_DEFAULTS: CostingDefaults = {
  packingCost: 25,
  deliveryCost: 60,
  gatewayPercent: 2,
  gstPercent: 3,
  margins: { under1k: 55, upTo10k: 40, over10k: 30 },
};

/** The band edges, in rupees (prices GST included). */
export const BAND_EDGES = { low: 1_000, high: 10_000 } as const;

/** One product's own figures — all three are the product's, never defaults. */
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

/** The cost side, or null until weight, silver rate and making charge are all there. */
export function costBreakdown(input: ProductCostInput, d: CostingDefaults): Breakdown | null {
  const weight = input.weightGrams ?? 0;
  const rate = input.silverRatePerGram ?? 0;
  const making = input.makingChargePerGram;
  if (!(weight > 0) || !(rate > 0) || making === null || !(making >= 0)) return null;
  const silver = r2(weight * rate);
  const makingTotal = r2(weight * making);
  const purchase = r2(silver + makingTotal);
  return {
    weightGrams: weight,
    silverRate: rate,
    makingCharge: making,
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

/** The price (GST included, whole rupees, rounded up) for one margin, or null if impossible. */
export function priceForMargin(b: Breakdown, d: CostingDefaults, marginPercent: number): number | null {
  const m = marginPercent / 100;
  const denominator = (1 - m) / (1 + d.gstPercent / 100) - d.gatewayPercent / 100;
  if (denominator <= 0) return null;
  return Math.ceil(b.fixedCosts / denominator);
}

export type Suggestion = {
  price: number;
  /** Which band set the price, in words, for the panel. */
  band: string;
  /** The band's target, or null when the price sits on a band edge between two. */
  targetPercent: number | null;
};

/**
 * The suggested selling price by the margin bands — before charm rounding,
 * which the caller applies with the shop's own rule. Null when even the
 * lowest band's margin is impossible with these fees.
 */
export function suggestedPrice(b: Breakdown, d: CostingDefaults): Suggestion | null {
  const bands = [
    { margin: d.margins.under1k, min: 0, max: BAND_EDGES.low - 1, band: "Under ₹1,000" },
    { margin: d.margins.upTo10k, min: BAND_EDGES.low, max: BAND_EDGES.high, band: "₹1,000 – ₹10,000" },
    { margin: d.margins.over10k, min: BAND_EDGES.high + 1, max: Infinity, band: "Above ₹10,000" },
  ];
  // Cheapest band first: a band's price must land inside it to count.
  for (const band of bands) {
    const price = priceForMargin(b, d, band.margin);
    if (price !== null && price >= band.min && price <= band.max) {
      return { price, band: band.band, targetPercent: band.margin };
    }
  }
  // No band agrees with itself: the price sits on the edge between two. Use
  // the top of the lower band — the edge just below the price the lower
  // band's margin would push it over.
  for (let i = 0; i < bands.length - 1; i++) {
    const lowerPrice = priceForMargin(b, d, bands[i].margin);
    const upperPrice = priceForMargin(b, d, bands[i + 1].margin);
    if (lowerPrice !== null && upperPrice !== null && lowerPrice > bands[i].max && upperPrice < bands[i + 1].min) {
      return { price: bands[i].max, band: `${bands[i].band} (top of the band)`, targetPercent: null };
    }
  }
  return null;
}

/** The shop's rounding rule (Settings → Pricing), or null when rounding is off. */
export type CharmRuleLike = {
  style: "99" | "49-99";
  direction: "down" | "up" | "nearest";
} | null;

/**
 * THE price of a costed product: cost → margin band → rounding. Used by the
 * product form (live), the CSV import, saving a product and Recalculate, so a
 * price can only ever be worked out one way. Null when the margins can't be
 * met with these fees.
 *
 * `round` is passed in rather than imported so this file stays free of
 * imports; callers hand it lib/charm-price's charmPrice.
 */
export function calculatedPrice(
  b: Breakdown,
  d: CostingDefaults,
  charm: CharmRuleLike,
  round: (price: number, style: "99" | "49-99", direction: "down" | "up" | "nearest", mrp?: number | null) => number,
  mrp?: number | null
): { price: number; suggestion: Suggestion } | null {
  const suggestion = suggestedPrice(b, d);
  if (!suggestion) return null;
  const price = charm ? round(suggestion.price, charm.style, charm.direction, mrp) : suggestion.price;
  return { price, suggestion };
}
