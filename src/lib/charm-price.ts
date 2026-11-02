/**
 * Charm pricing: ₹1,000 → ₹999, ₹1,500 → ₹1,499.
 *
 * Applied to the STORED price, never as a display trick. The listing filters,
 * search, sort, checkout total and invoice all read Product.price, so changing
 * it is what keeps "shown ₹999" and "charged ₹999" the same number everywhere.
 *
 * Rules, all of them load-bearing:
 *
 *   - Always DOWN. A price never goes up by being "charmed".
 *   - Idempotent. A price already in the style comes back unchanged, so running
 *     it twice, or on every save, changes nothing the second time.
 *   - Never more than a 10% cut. ₹150 in the 99 style would otherwise become
 *     ₹99; below that line it falls back to ending in 9 (₹149) instead.
 *   - Whole rupees. A fractional price is floored first.
 *
 * Lives in lib/ with no imports so the admin's preview and the server's write
 * use one rule — a preview computed differently from the write would promise
 * prices the shop then doesn't set.
 */

export type CharmStyle = "99" | "49-99";

export const CHARM_STYLES: Array<{ value: CharmStyle; label: string; example: string }> = [
  { value: "99", label: "End in 99", example: "₹1,000 → ₹999 · ₹1,250 → ₹1,199" },
  { value: "49-99", label: "End in 49 or 99", example: "₹1,000 → ₹999 · ₹1,250 → ₹1,249" },
];

export function isCharmStyle(v: unknown): v is CharmStyle {
  return v === "99" || v === "49-99";
}

/** The largest number ≤ `price` that is one less than a multiple of `step`. */
function endingBelow(price: number, step: number): number {
  return Math.floor((price + 1) / step) * step - 1;
}

export function charmPrice(price: number, style: CharmStyle): number {
  const p = Math.floor(price);
  if (!Number.isFinite(p) || p <= 0) return price;

  const candidate = endingBelow(p, style === "99" ? 100 : 50);
  if (candidate > 0 && candidate >= p * 0.9) return candidate;

  // Too steep a cut for a small price — end in 9 instead.
  const fallback = endingBelow(p, 10);
  return fallback > 0 ? fallback : p;
}
