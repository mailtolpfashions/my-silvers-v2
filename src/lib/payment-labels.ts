/**
 * What a payment status is CALLED on screen — one place, for the admin and
 * the customer alike.
 *
 * ⚠️  "refunded" is stored the moment Razorpay ACCEPTS a refund request; the
 * money reaches the customer's bank 5–7 working days later, and the shop is
 * never told when. Showing "Refunded" claimed more than we know — the owner,
 * cancelling the ₹1 live test order (Nov 2026), expected "refund started" and
 * saw "Refunded". The stored value stays as it is; only the words change.
 */
export const REFUND_STARTED = "Refund started";

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  pending: "Payment pending",
  paying: "Payment processing",
  paid: "Paid",
  failed: "Payment failed",
  refunded: REFUND_STARTED,
};

export function paymentStatusLabel(status: string): string {
  return PAYMENT_STATUS_LABELS[status] ?? status;
}

/** The plain-words promise to go with it, wherever there is room. */
export const REFUND_TIMING = "Usually reaches the account it was paid from in 5–7 working days.";
