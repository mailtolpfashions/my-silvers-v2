"use client";

import { useEffect, useState } from "react";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Spinner } from "@/components/ui/spinner";

/** What the shopper is waiting on. Drives the wording, nothing else. */
export type PaymentStage = "placing" | "verifying";

/**
 * Short on purpose, and not only for wrapping.
 *
 * The description sits in a 24rem column under `text-wrap: balance`, which
 * equalises LINE LENGTHS and knows nothing about grammar — so a long sentence
 * gets split wherever the lengths come out even, which is how "We're" ended up
 * stranded at the end of a line away from "confirming". Fewer words is the only
 * reliable fix; CSS cannot be told to keep a pronoun with its verb.
 *
 * It is also better copy for the situation. This is read by someone who has
 * just been charged and wants one thing confirmed. A sentence they can take in
 * at a glance does that; a paragraph does not get read at all.
 */
const COPY: Record<PaymentStage, { title: string; description: string }> = {
  placing: {
    title: "Placing your order",
    description: "One moment.",
  },
  verifying: {
    title: "Confirming your payment",
    description: "Payment received. Opening your order.",
  },
};

/**
 * The "don't touch anything" screen between pressing pay and seeing the order.
 *
 * ── Why an overlay rather than a disabled button ────────────────────────────
 * The button already said "Placing order…", which is enough feedback while the
 * shopper is looking at the button. They frequently are not: on the online
 * path, Razorpay's own window has just closed, so the page underneath reappears
 * looking exactly as it did before — a filled-in form with a Pay button — while
 * the payment is being confirmed. Nothing on screen says the work is still
 * happening, and the natural reactions are to press Pay again or to leave.
 *
 * ── There is deliberately NO cancel ─────────────────────────────────────────
 * ⚠️  Do not add one. By the time `verifying` is on screen Razorpay has taken
 * the money; nothing the browser can do walks that back, and the webhook will
 * fulfil the order regardless of what this tab does. A cancel button that
 * dismissed this overlay would tell the shopper the payment did not happen,
 * and the next thing they do is pay again. The honest options here are to wait
 * or to contact us, and waiting is nearly always right.
 *
 * ── Blocking, in three layers ───────────────────────────────────────────────
 * This element covers the viewport, so pointers cannot reach the form. That
 * alone leaves the form reachable by keyboard, so the caller also marks it
 * `inert`. And neither stops a browser Back or a tab close, which is what
 * `beforeunload` below is for.
 */
export function PaymentProcessingOverlay({ stage }: { stage: PaymentStage | null }) {
  // The whole card is a separate component so that its `slow` timer STATE is
  // created and discarded with the overlay. Keeping it out here would mean
  // resetting the flag from an effect when the stage cleared, which schedules a
  // second render for nothing — and which the project's lint rules reject, in
  // this case correctly.
  if (!stage) return null;
  return <ProcessingCard stage={stage} />;
}

function ProcessingCard({ stage }: { stage: PaymentStage }) {
  /**
   * Warn on leaving, for as long as this is up.
   *
   * ⚠️  The wording is the browser's, not ours — every engine ignores a custom
   * string. Setting `returnValue` is what triggers the prompt at all; the
   * legacy assignment is still required by some engines. Same shape as
   * lib/use-unsaved-changes.ts, which has the fuller note.
   */
  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
      return "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  /**
   * A second line of reassurance once this has been up a while.
   *
   * Measured, this should clear in a second or two. When it does not, the
   * shopper's worry is specifically "has my money gone?", and silence invites
   * a refresh — the one action that makes a duplicate payment likely. Ten
   * seconds is long enough that it never fires on a normal payment.
   */
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), 10_000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div
      // role="status" + aria-live, not role="dialog": nothing here is
      // actionable, and a dialog role would have a screen reader hunting for
      // controls that deliberately do not exist.
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-50 grid place-items-center bg-background/90 p-4 backdrop-blur-sm"
    >
      <Empty className="max-w-sm">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Spinner />
          </EmptyMedia>
          <EmptyTitle>{COPY[stage].title}</EmptyTitle>
          <EmptyDescription>{COPY[stage].description}</EmptyDescription>
        </EmptyHeader>
        <p className="mt-2 text-sm font-medium">Please don&apos;t close or refresh this page.</p>
        {slow && (
          <p className="mt-3 text-sm text-muted-foreground">
            This is taking longer than usual. Your payment is safe and your order will still be
            created — please keep waiting rather than paying again.
          </p>
        )}
      </Empty>
    </div>
  );
}
