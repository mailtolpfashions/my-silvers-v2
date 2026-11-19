/**
 * When an order has a tax invoice, and where it lives — one rule for the order
 * pages, both invoice routes and the emails, so a link is never offered that
 * would open "not found".
 *
 * A tax invoice exists for a sale: not for a cancelled order, and not for an
 * online order that was never paid. A COD order is billable from the start
 * (the money is collected at the door).
 */
export function hasInvoice(order: {
  orderStatus: string;
  paymentStatus: string;
  paymentMethod: string;
}): boolean {
  return (
    order.orderStatus !== "cancelled" &&
    (order.paymentStatus === "paid" || order.paymentMethod === "cod")
  );
}

/**
 * The invoice page for an order, as a path.
 *
 * A guest order (placed without an account) carries a confirmationToken; its
 * invoice opens with that token, exactly like the guest order page, so the
 * link works without signing in and only for someone holding it. An account
 * order's invoice is behind the account's sign-in.
 */
export function invoicePath(order: { id: string; confirmationToken: string | null }): string {
  return order.confirmationToken
    ? `/orders/${order.id}/invoice?ot=${encodeURIComponent(order.confirmationToken)}`
    : `/account/orders/${order.id}/invoice`;
}
