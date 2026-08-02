"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Script from "next/script";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  placeOrderAction,
  verifyPaymentAction,
  type PlaceOrderResult,
} from "@/actions/order-actions";
import { readGuestCart, clearGuestCart } from "@/lib/guest-cart";
import { formatINRPaise } from "@/lib/format";
import { shippingChargePaise } from "@/server/orders/money";

export type CheckoutLine = { name: string; quantity: number; pricePaise: number };

type PendingPayment = {
  orderId: string;
  confirmationToken: string | null;
  razorpayOrderId: string;
  amountPaise: number;
  keyId: string;
};

export function CheckoutForm({
  isAuthed,
  userEmail,
  userName,
  initialLines,
}: {
  isAuthed: boolean;
  userEmail?: string;
  userName?: string;
  /** Authed carts are resolved server-side; guests hydrate client-side. */
  initialLines: CheckoutLine[] | null;
}) {
  const router = useRouter();
  const [lines, setLines] = useState<CheckoutLine[] | null>(initialLines);
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingPayment, setPendingPayment] = useState<PendingPayment | null>(null);
  const [paymentDismissed, setPaymentDismissed] = useState(false);

  const [form, setForm] = useState({
    email: userEmail ?? "",
    fullName: userName ?? "",
    phone: "",
    addressLine1: "",
    addressLine2: "",
    city: "",
    state: "",
    pincode: "",
    notes: "",
    paymentMethod: "razorpay" as "razorpay" | "cod",
  });

  // Guest: hydrate the order summary from localStorage + public summaries API.
  useEffect(() => {
    if (isAuthed || initialLines) return;
    (async () => {
      const items = readGuestCart();
      if (items.length === 0) {
        setLines([]);
        return;
      }
      const ids = items.map((i) => i.productId).join(",");
      const res = await fetch(`/api/products/summaries?ids=${encodeURIComponent(ids)}`);
      const data = (await res.json()) as {
        products: Array<{ id: string; name: string; price: string }>;
      };
      const byId = new Map(data.products.map((p) => [p.id, p]));
      setLines(
        items
          .filter((i) => byId.has(i.productId))
          .map((i) => ({
            name: byId.get(i.productId)!.name,
            quantity: i.quantity,
            pricePaise: Math.round(Number(byId.get(i.productId)!.price) * 100),
          }))
      );
    })();
  }, [isAuthed, initialLines]);

  if (lines === null) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (lines.length === 0) {
    return <p className="py-12 text-center text-muted-foreground">Your cart is empty.</p>;
  }

  const subtotalPaise = lines.reduce((s, l) => s + l.pricePaise * l.quantity, 0);
  const shippingPaise = shippingChargePaise(subtotalPaise);
  const totalPaise = subtotalPaise + shippingPaise;

  function successUrl(orderId: string, token: string | null) {
    return isAuthed
      ? `/account/orders/${orderId}?placed=1`
      : `/orders/${orderId}?ot=${token}&placed=1`;
  }

  function openRazorpay(payment: PendingPayment) {
    if (!window.Razorpay) {
      setError("Payment gateway failed to load. Please refresh and try again.");
      return;
    }
    setPaymentDismissed(false);
    const rzp = new window.Razorpay({
      key: payment.keyId,
      order_id: payment.razorpayOrderId,
      amount: payment.amountPaise,
      currency: "INR",
      name: "MY Silvers",
      description: "Order payment",
      prefill: { name: form.fullName, email: form.email, contact: form.phone },
      handler: async (resp) => {
        const result = await verifyPaymentAction({
          razorpayOrderId: resp.razorpay_order_id,
          razorpayPaymentId: resp.razorpay_payment_id,
          razorpaySignature: resp.razorpay_signature,
        });
        if (result.ok) {
          if (!isAuthed) clearGuestCart();
          router.push(successUrl(payment.orderId, payment.confirmationToken));
        } else {
          setError(result.error);
        }
      },
      modal: { ondismiss: () => setPaymentDismissed(true) },
    });
    rzp.open();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const result: PlaceOrderResult = await placeOrderAction({
        address: {
          fullName: form.fullName,
          phone: form.phone,
          addressLine1: form.addressLine1,
          addressLine2: form.addressLine2,
          city: form.city,
          state: form.state,
          pincode: form.pincode,
        },
        paymentMethod: form.paymentMethod,
        notes: form.notes,
        idempotencyKey,
        guestEmail: isAuthed ? undefined : form.email,
        guestItems: isAuthed
          ? undefined
          : readGuestCart().map((i) => ({ productId: i.productId, quantity: i.quantity })),
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      if (result.razorpay) {
        const payment: PendingPayment = {
          orderId: result.orderId,
          confirmationToken: result.confirmationToken,
          razorpayOrderId: result.razorpay.razorpayOrderId,
          amountPaise: result.razorpay.amountPaise,
          keyId: result.razorpay.keyId,
        };
        setPendingPayment(payment);
        openRazorpay(payment);
      } else {
        // COD — order is final immediately.
        if (!isAuthed) clearGuestCart();
        toast.success(`Order ${result.orderNumber} placed!`);
        router.push(successUrl(result.orderId, result.confirmationToken));
      }
    } finally {
      setSubmitting(false);
    }
  }

  function field(name: keyof typeof form, label: string, props?: React.ComponentProps<typeof Input>) {
    return (
      <div className="space-y-1.5">
        <Label htmlFor={name}>{label}</Label>
        <Input
          id={name}
          value={form[name]}
          onChange={(e) => setForm((f) => ({ ...f, [name]: e.target.value }))}
          {...props}
        />
      </div>
    );
  }

  return (
    <>
      <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="afterInteractive" />

      <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          {pendingPayment && paymentDismissed && (
            <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-3 text-sm dark:border-amber-700 dark:bg-amber-950">
              <p>Your order is saved but payment wasn&apos;t completed.</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={() => openRazorpay(pendingPayment)}
              >
                Retry payment
              </Button>
            </div>
          )}

          {!isAuthed &&
            field("email", "Email", { type: "email", required: true, autoComplete: "email" })}

          <fieldset className="space-y-4">
            <legend className="text-sm font-semibold">Shipping address</legend>
            {field("fullName", "Full name", { required: true, autoComplete: "name" })}
            {field("phone", "Phone", { required: true, autoComplete: "tel" })}
            {field("addressLine1", "Address line 1", { required: true, autoComplete: "address-line1" })}
            {field("addressLine2", "Address line 2 (optional)", { autoComplete: "address-line2" })}
            <div className="grid grid-cols-2 gap-4">
              {field("city", "City", { required: true, autoComplete: "address-level2" })}
              {field("state", "State", { required: true, autoComplete: "address-level1" })}
            </div>
            {field("pincode", "Pincode", {
              required: true,
              autoComplete: "postal-code",
              pattern: "[0-9]{6}",
              title: "6-digit pincode",
            })}
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold">Payment method</legend>
            {(
              [
                ["razorpay", "Pay online (UPI / Card / Netbanking)"],
                ["cod", "Cash on delivery"],
              ] as const
            ).map(([value, label]) => (
              <label key={value} className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="paymentMethod"
                  value={value}
                  checked={form.paymentMethod === value}
                  onChange={() => setForm((f) => ({ ...f, paymentMethod: value }))}
                />
                {label}
              </label>
            ))}
          </fieldset>

          <div className="space-y-1.5">
            <Label htmlFor="notes">Order notes (optional)</Label>
            <Textarea
              id="notes"
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            />
          </div>

          <Button type="submit" size="lg" className="w-full" disabled={submitting}>
            {submitting
              ? "Placing order…"
              : form.paymentMethod === "cod"
                ? `Place order — ${formatINRPaise(totalPaise)}`
                : `Pay ${formatINRPaise(totalPaise)}`}
          </Button>
        </form>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="text-base">Order summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {lines.map((line, i) => (
              <div key={i} className="flex justify-between text-sm">
                <span className="text-muted-foreground">
                  {line.name} × {line.quantity}
                </span>
                <span>{formatINRPaise(line.pricePaise * line.quantity)}</span>
              </div>
            ))}
            <div className="flex justify-between border-t pt-3 text-sm">
              <span className="text-muted-foreground">Shipping</span>
              <span>{shippingPaise === 0 ? "Free" : formatINRPaise(shippingPaise)}</span>
            </div>
            <div className="flex justify-between font-semibold">
              <span>Total</span>
              <span>{formatINRPaise(totalPaise)}</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
