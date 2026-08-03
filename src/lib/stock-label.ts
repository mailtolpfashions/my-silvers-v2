/**
 * Customer-facing stock wording. Exact counts are deliberately never shown —
 * they read like warehouse software rather than a jewellery boutique, and they
 * tell competitors what is selling.
 *
 * "Last one left" is kept distinct because for one-of-a-kind pieces scarcity is
 * a selling point, not something to hide.
 */

/** At or below this (and above 1), stock reads as "Only a few left". */
export const LOW_STOCK_THRESHOLD = 5;

export type StockStatus = "out" | "last" | "low" | "in";

export function stockStatus(stock: number): StockStatus {
  if (stock <= 0) return "out";
  if (stock === 1) return "last";
  if (stock <= LOW_STOCK_THRESHOLD) return "low";
  return "in";
}

const LABELS: Record<StockStatus, string> = {
  out: "Out of stock",
  last: "Last one left",
  low: "Only a few left",
  in: "In stock",
};

export function stockLabel(stock: number): string {
  return LABELS[stockStatus(stock)];
}

/** True for the states worth calling out on a listing card. */
export function isScarce(stock: number): boolean {
  const status = stockStatus(stock);
  return status === "last" || status === "low";
}
