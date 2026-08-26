export function formatINR(rupees: number | string): string {
  const n = Number(rupees);
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: Number.isInteger(n) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(n);
}

export function formatINRPaise(paise: number): string {
  return formatINR(paise / 100);
}

/**
 * "Save ₹1,000 (20%)", or null when there is nothing honest to claim.
 *
 * A struck-through compare-at price shows a shopper that the price came down
 * and leaves them to work out by how much. Every Indian storefront states it
 * instead, because a saving the shopper has to calculate is a saving most of
 * them do not. Both figures are given: the percentage carries a small piece,
 * the rupees carry an expensive one, and which lands harder depends on the
 * price.
 *
 * ── When it says nothing ─────────────────────────────────────────────────────
 * Null on a missing compare-at price, and null when compare-at is at or BELOW
 * the price. That second guard is not theoretical: compare-at is a free-text
 * admin field, so one transposed digit would otherwise print "Save ₹-500".
 *
 * Also null below one percent. A ₹5 saving on a ₹5,000 piece is arithmetically
 * a saving and reads as a rounding error — claiming it makes the shop look like
 * it is counting coins, and a "(0%)" beside it looks broken.
 *
 * Integer paise throughout, like the order maths, so the figure a shopper is
 * shown is computed the same way as the one they are charged.
 */
export function savingLabel(
  price: number | string,
  compareAtPrice: number | string | null | undefined
): string | null {
  const saved = savingPaise(price, compareAtPrice);
  if (saved === 0) return null;

  const comparePaise = Math.round(Number(compareAtPrice) * 100);
  const percent = Math.round((saved / comparePaise) * 100);

  return `Save ${formatINRPaise(saved)} (${percent}%)`;
}

/**
 * What one unit saves, in paise. Zero when there is nothing honest to claim.
 *
 * The rules live here rather than in savingLabel so the cart totals a saving by
 * the same definition the product page states one by. Without that, a cart can
 * add up per-item savings the pages themselves declined to show.
 */
export function savingPaise(
  price: number | string,
  compareAtPrice: number | string | null | undefined
): number {
  if (compareAtPrice === null || compareAtPrice === undefined || compareAtPrice === "") return 0;

  const pricePaise = Math.round(Number(price) * 100);
  const comparePaise = Math.round(Number(compareAtPrice) * 100);
  if (!Number.isFinite(pricePaise) || !Number.isFinite(comparePaise)) return 0;
  if (comparePaise <= pricePaise || pricePaise <= 0) return 0;

  const saved = comparePaise - pricePaise;
  // Below one percent is a rounding error dressed as a discount, and the "(0%)"
  // that would sit beside it looks broken. See the note on savingLabel.
  if (Math.round((saved / comparePaise) * 100) < 1) return 0;

  return saved;
}

/**
 * "2026-08-26" → "26 Aug".
 *
 * For dashboard date axes and captions. The stored ISO date is unambiguous,
 * which is why it is the storage format, but nobody reads a chart in ISO — and
 * the year is noise on a window only thirty days wide.
 *
 * Parsed with an explicit T00:00:00 so it is read as LOCAL midnight. `new
 * Date("2026-08-26")` is parsed as UTC, which in IST (+05:30) is still the
 * 26th, but the same code west of Greenwich silently renders the day before.
 */
export function formatShortDay(day: string | undefined): string {
  if (!day) return "";
  const parsed = new Date(`${day}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return day;
  return parsed.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}
