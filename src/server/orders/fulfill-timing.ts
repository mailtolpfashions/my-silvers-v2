import "server-only";

/**
 * Step timing for the payment fulfilment path.
 *
 * ── Why this exists as real code rather than a temporary console.log ────────
 * Fulfilment is the one request on the site where a shopper is watching a
 * spinner having ALREADY been charged, and it is the hardest path to reason
 * about from the outside: two third-party round trips (Razorpay, Resend), a
 * transaction, and a race with the webhook. "Checkout feels slow" is otherwise
 * unfalsifiable — the guessing costs more than the log line.
 *
 * One line per fulfilment, at info level. This runs at the rate orders are
 * placed, not the rate pages are viewed, so it is not log noise at any volume
 * this shop will see.
 *
 * ⚠️  `performance.now()`, not `Date.now()`. Next's cacheComponents guard
 * rejects an unstable clock reading in a scope that has not declared itself
 * dynamic, and its own documentation names performance.now() as the exception
 * because it is meant for telemetry. Date.now() here would be the same class of
 * error as the two already fixed in this codebase — see the note in
 * server/admin/stats.ts.
 */
export type FulfillTimer = {
  /** Marks the end of a step and starts the next. */
  step: (name: string) => void;
  /** Emits the single summary line. */
  done: (orderNumber: string, outcome: string) => void;
};

export function startFulfillTimer(source: "webhook" | "client"): FulfillTimer {
  const began = performance.now();
  let last = began;
  const steps: string[] = [];

  return {
    step(name) {
      const now = performance.now();
      steps.push(`${name}=${Math.round(now - last)}ms`);
      last = now;
    },
    done(orderNumber, outcome) {
      const total = Math.round(performance.now() - began);
      // Total FIRST: it is the number anyone reading this actually wants, and
      // the breakdown is only interesting once the total looks wrong.
      console.info(
        `[fulfill] ${orderNumber} ${source} ${outcome} total=${total}ms ${steps.join(" ")}`
      );
    },
  };
}
