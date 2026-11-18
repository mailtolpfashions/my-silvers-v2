/**
 * The return window: how long after delivery a customer may ask for a return.
 *
 * One place for the arithmetic, so the order page that hides the button and
 * requestReturn that refuses a late request can't disagree. The length is the
 * `returnRequestHours` store setting; 0 means no limit.
 *
 * An order with no `deliveredAt` (delivered before the date was recorded and
 * missed by the backfill) is treated as open — the customer gets the benefit
 * of the doubt, and the owner still reviews every request.
 */

export function returnDeadline(deliveredAt: Date | null, hours: number): Date | null {
  if (!deliveredAt || hours <= 0) return null;
  return new Date(deliveredAt.getTime() + hours * 3_600_000);
}

export function isReturnWindowOpen(
  deliveredAt: Date | null,
  hours: number,
  now: Date = new Date()
): boolean {
  const deadline = returnDeadline(deliveredAt, hours);
  return deadline === null || now.getTime() <= deadline.getTime();
}

/** "20 Nov, 3:40 pm" — always Indian time, whatever the server's clock zone. */
export function formatDeadline(d: Date): string {
  return d.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** "48 hours", or "7 days" for a whole number of days past three. */
export function windowLength(hours: number): string {
  if (hours > 72 && hours % 24 === 0) return `${hours / 24} days`;
  return `${hours} ${hours === 1 ? "hour" : "hours"}`;
}
