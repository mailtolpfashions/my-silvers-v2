"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Script from "next/script";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { resumePaymentAction, verifyPaymentAction } from "@/actions/order-actions";
import { PAYMENT_WINDOW_HOURS } from "@/lib/order-payment";

/**
 * The notice and "Pay now" on an order whose payment was never completed.
 *
 * Opens the SAME Razorpay order the shopper abandoned at checkout and settles
 * it through verifyPaymentAction — the one path that marks an order paid,
 * takes the stock and clears the cart. Nothing here marks anything paid.
 */
export function PayNowNotice({
  orderId,
  token,
  successHref,
}: {
  orderId: string;
  /** The guest order link's token; absent for a signed-in account. */
  token?: string;
  /** Where to land once paid — the same order page with ?placed=1. */
  successHref: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function pay() {
    setBusy(true);
    const details = await resumePaymentAction({ orderId, token });
    if (!details.ok) {
      toast.error(details.error);
      setBusy(false);
      router.refresh();
      return;
    }
    if (!window.Razorpay) {
      toast.error("Payment gateway failed to load. Please refresh and try again.");
      setBusy(false);
      return;
    }

    const rzp = new window.Razorpay({
      key: details.keyId,
      order_id: details.razorpayOrderId,
      amount: details.amountPaise,
      currency: "INR",
      name: "MY Silvers",
      description: "Order payment",
      prefill: details.prefill,
      handler: async (resp) => {
        const result = await verifyPaymentAction({
          razorpayOrderId: resp.razorpay_order_id,
          razorpayPaymentId: resp.razorpay_payment_id,
          razorpaySignature: resp.razorpay_signature,
        });
        if (result.ok) {
          router.push(successHref);
          router.refresh();
        } else {
          toast.error(result.error);
          setBusy(false);
        }
      },
      modal: {
        confirm_close: true,
        escape: false,
        ondismiss: () => setBusy(false),
      },
    });
    rzp.on("payment.failed", (r) => {
      toast.error(
        r.error?.description ? `Payment failed: ${r.error.description}` : "Payment failed. Please try again."
      );
    });
    rzp.open();
  }

  return (
    <div className="border-l-2 border-destructive bg-destructive/5 px-4 py-4 text-sm">
      <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="afterInteractive" />
      <p className="font-medium">Payment not completed</p>
      <p className="mt-1 text-muted-foreground">
        This order isn&apos;t confirmed yet and you haven&apos;t been charged. Complete the payment
        within {PAYMENT_WINDOW_HOURS} hours of placing it, or it will be cancelled automatically.
      </p>
      <Button type="button" size="sm" className="mt-3" onClick={pay} disabled={busy}>
        {busy ? "Opening payment…" : "Pay now"}
      </Button>
    </div>
  );
}

/** The same order, past its payment window — nothing to press, just the facts. */
/**
 * Shown in place of Pay now when a piece in an unpaid order has sold out —
 * the order has just been cancelled (server/orders/sold-out.ts). Says plainly
 * that nothing was charged, which is the shopper's first worry.
 */
export function SoldOutNotice({ names }: { names: string[] }) {
  const list =
    names.length <= 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  return (
    <div className="border-l-2 border-destructive bg-destructive/5 px-4 py-4 text-sm">
      <p className="font-medium">Sorry — this piece has sold out</p>
      <p className="mt-1 text-muted-foreground">
        {list} {names.length > 1 ? "were" : "was"} bought by someone else before this order was paid
        for, so we&apos;ve cancelled it. You haven&apos;t been charged.
      </p>
    </div>
  );
}

export function PaymentExpiredNotice() {
  return (
    <div className="border-l-2 border-destructive bg-destructive/5 px-4 py-4 text-sm">
      <p className="font-medium">Payment not completed</p>
      <p className="mt-1 text-muted-foreground">
        The time to pay for this order has passed, so it will be cancelled automatically. You
        haven&apos;t been charged. If you still want these pieces, please place a new order.
      </p>
    </div>
  );
}
