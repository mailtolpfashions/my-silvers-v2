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
