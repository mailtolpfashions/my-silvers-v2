/**
 * Charm pricing: ₹1,500 → ₹1,499, or ₹1,420 → ₹1,499, or whichever is nearer.
 *
 * Applied to the STORED price, never as a display trick. The listing filters,
 * search, sort, checkout total and invoice all read Product.price, so changing
 * it is what keeps "shown ₹999" and "charged ₹999" the same number everywhere.
 *
 * Two choices, both store settings:
 *   style      what a charm price ends in — 99, or 49 or 99
 *   direction  which way a typed price moves to get there:
 *                down     never raises a price (₹1,000 → ₹999)
 *                up       never lowers one (₹1,420 → ₹1,499) — more margin,
 *                         but round numbers jump most (₹1,000 → ₹1,099)
 *                nearest  whichever is closer, a tie going DOWN in the
 *                         customer's favour — moves a price by at most half
 *                         a step (₹50 in the 99 style)
 *
 * Rules, all of them load-bearing:
 *
 *   - Idempotent. A price already in the style comes back unchanged in every
 *     direction, so running it twice, or on every save, changes nothing.
 *   - Never more than 10% either way. ₹150 in the 99 style would otherwise
 *     become ₹99 (down) or ₹199 (up); past that line it falls back to ending
 *     in 9 instead (₹149 / ₹159).
 *   - Never at or above the MRP. When a piece has a struck-through price, an
 *     offer price rounded up past it would read "Save ₹-50" — so rounding up
 *     that would reach the MRP rounds down instead.
 *   - Whole rupees. A fractional price is floored first.
 *
 * Lives in lib/ with no imports so the admin's preview and the server's write
 * use one rule — a preview computed differently from the write would promise
 * prices the shop then doesn't set.
 */

export type CharmStyle = "99" | "49-99";
export type CharmDirection = "down" | "up" | "nearest";

export const CHARM_STYLES: Array<{ value: CharmStyle; label: string; example: string }> = [
  { value: "99", label: "End in 99", example: "Prices end in ₹99 — ₹999, ₹1,499" },
  { value: "49-99", label: "End in 49 or 99", example: "Prices end in ₹49 or ₹99 — ₹1,249, ₹1,299" },
];

export const CHARM_DIRECTIONS: Array<{ value: CharmDirection; label: string; example: string }> = [
  { value: "down", label: "Round down", example: "₹1,500 → ₹1,499 · ₹1,420 → ₹1,399. Never raises a price." },
  { value: "up", label: "Round up", example: "₹1,420 → ₹1,499 · ₹1,000 → ₹1,099. Never lowers a price." },
  { value: "nearest", label: "Nearest", example: "₹1,420 → ₹1,399 · ₹1,460 → ₹1,499. Moves at most ₹50." },
];

export function isCharmStyle(v: unknown): v is CharmStyle {
  return v === "99" || v === "49-99";
}

export function isCharmDirection(v: unknown): v is CharmDirection {
  return v === "down" || v === "up" || v === "nearest";
}

/** The largest number ≤ `price` that is one less than a multiple of `step`. */
function endingBelow(price: number, step: number): number {
  return Math.floor((price + 1) / step) * step - 1;
}

/** The smallest number ≥ `price` that is one less than a multiple of `step`. */
function endingAbove(price: number, step: number): number {
  return Math.ceil((price + 1) / step) * step - 1;
}

function roundDown(p: number, step: number): number {
  const candidate = endingBelow(p, step);
  if (candidate > 0 && candidate >= p * 0.9) return candidate;
  // Too steep a cut for a small price — end in 9 instead.
  const fallback = endingBelow(p, 10);
  return fallback > 0 ? fallback : p;
}

function roundUp(p: number, step: number): number {
  const candidate = endingAbove(p, step);
  if (candidate <= p * 1.1) return candidate;
  // Too steep a rise for a small price — end in 9 instead.
  return endingAbove(p, 10);
}

export function charmPrice(
  price: number,
  style: CharmStyle,
  direction: CharmDirection = "down",
  /** The struck-through MRP, when the piece has one — the result stays below it. */
  mrp?: number | null
): number {
  const p = Math.floor(price);
  if (!Number.isFinite(p) || p <= 0) return price;
  const step = style === "99" ? 100 : 50;

  const down = roundDown(p, step);
  if (direction === "down") return down;

  const up = roundUp(p, step);
  const pick = direction === "up" ? up : up - p < p - down ? up : down;

  // Rounding up must never reach the MRP — that would show a negative saving.
  if (mrp && mrp > 0 && pick >= mrp) return down;
  return pick;
}
