/**
 * Where an ONLINE order stands on payment, in the shopper's terms.
 *
 * Pressing "Pay" creates the order (placed / pending) before Razorpay opens.
 * A shopper who closes the window leaves a real order row that was never paid
 * for, and it used to show in "Your orders" as an ordinary "Placed" — which
 * reads as "it's coming" to someone who never paid. This names that state.
 *
 *   awaiting   unpaid, still inside the payment window — offer "Pay now"
 *   expired    unpaid and past the window; the nightly sweep
 *              (api/cron/auto-refund-sweep) will mark it failed
 *   confirming the payment succeeded and is being verified ("paying")
 *   failed     Razorpay reported a failure, or the sweep gave up on it
 *   null       nothing to say — paid, COD, refunded or cancelled
 *
 * Pure and client-safe: the order pages, the list badges and the resume
 * action all decide from this one function, so they cannot disagree.
 */
export type UnpaidState = "awaiting" | "expired" | "confirming" | "failed";

/**
 * Matches the sweep's own cut-off (`dayAgo` in auto-refund-sweep/route.ts).
 * After it, Pay now is withdrawn even though the row may say pending for a few
 * more hours until the daily sweep actually runs.
 */
export const PAYMENT_WINDOW_HOURS = 24;

type OrderLike = {
  paymentMethod: string;
  paymentStatus: string;
  orderStatus: string;
  createdAt: Date | string;
};

export function unpaidState(order: OrderLike, now: number = Date.now()): UnpaidState | null {
  if (order.paymentMethod !== "razorpay") return null;
  if (order.orderStatus === "cancelled") return null;

  if (order.paymentStatus === "paying") return "confirming";
  if (order.paymentStatus === "failed") return "failed";
  if (order.paymentStatus !== "pending") return null;

  const age = now - new Date(order.createdAt).getTime();
  return age < PAYMENT_WINDOW_HOURS * 60 * 60 * 1000 ? "awaiting" : "expired";
}

export const UNPAID_LABELS: Record<UnpaidState, string> = {
  awaiting: "Payment not completed",
  expired: "Payment not completed",
  confirming: "Confirming payment",
  failed: "Payment failed",
};
