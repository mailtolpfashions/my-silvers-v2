/**
 * Comparing courier prices across partners — pure and client-safe, so the
 * Ship order dialog and the server rank quotes with the same code.
 *
 * ── GST ──────────────────────────────────────────────────────────────────────
 * NimbusPost quotes GST-EXCLUSIVE totals (its spec says so). Shiprocket's
 * `rate` doesn't say either way. The owner chose (Nov 2026) to treat both as
 * excluding GST and add 18% to each, so every figure in the table is all-in
 * and the cheapest pick can't be skewed by one partner's prices being net.
 * If a Shiprocket invoice shows its quoted rate already includes GST, flip
 * `shiprocket` to true below — that is the only change needed.
 */

export type CourierProviderId = "shiprocket" | "nimbuspost";

export const PROVIDER_LABEL: Record<CourierProviderId, string> = {
  shiprocket: "Shiprocket",
  nimbuspost: "NimbusPost",
};

/** Whether each partner's quoted total already includes GST. */
export const QUOTE_INCLUDES_GST: Record<CourierProviderId, boolean> = {
  shiprocket: false,
  nimbuspost: false,
};

export const SHIPPING_GST_RATE = 0.18;

/** One courier's price, as shown in the Ship order dialog. Rupees throughout. */
export type CourierQuote = {
  provider: CourierProviderId;
  /** The partner's own courier id — Shiprocket's is numeric, NimbusPost's a string. */
  courierId: string;
  courierName: string;
  estimatedDays: number | null;
  freight: number;
  codCharges: number;
  otherCharges: number;
  /** The partner's total as quoted. */
  quoted: number;
  /** All-in, GST included — what the comparison ranks on. */
  total: number;
};

export function withGst(provider: CourierProviderId, amount: number): number {
  const all = QUOTE_INCLUDES_GST[provider] ? amount : amount * (1 + SHIPPING_GST_RATE);
  return Math.round(all * 100) / 100;
}

/**
 * Cheapest first by the all-in total; a tie goes to the faster courier, and a
 * courier with no estimate sorts after one that has.
 */
export function rankQuotes(quotes: CourierQuote[]): CourierQuote[] {
  const days = (q: CourierQuote) => q.estimatedDays ?? Number.POSITIVE_INFINITY;
  return [...quotes].sort((a, b) => a.total - b.total || days(a) - days(b));
}

/** Stable key for one quote — what the dialog's radio buttons carry. */
export function quoteKey(q: Pick<CourierQuote, "provider" | "courierId">): string {
  return `${q.provider}:${q.courierId}`;
}
