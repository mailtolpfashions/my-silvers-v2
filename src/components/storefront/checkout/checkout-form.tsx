"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Script from "next/script";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  placeOrderAction,
  verifyPaymentAction,
  type PlaceOrderResult,
} from "@/actions/order-actions";
import { StickyActionBar } from "@/components/storefront/sticky-action-bar";
import { readGuestCart, clearGuestCart } from "@/lib/guest-cart";
import { formatINRPaise } from "@/lib/format";
import { shippingChargePaise } from "@/server/orders/money";
import { INDIAN_STATES, MAX_ADDRESSES } from "@/lib/validation/account";
import { saveCheckoutAddressAction } from "@/actions/account-actions";

export type CheckoutLine = { name: string; quantity: number; pricePaise: number };

export type SavedAddress = {
  id: string;
  label: string | null;
  fullName: string;
  phone: string;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  state: string;
  pincode: string;
  isDefault: boolean;
};

const NEW_ADDRESS = "new";

/**
 * Razorpay's prefill.contact only accepts a bare 10-digit number or +91-prefixed
 * E.164 — anything with spaces, dashes or a leading 0 is dropped, and the
 * customer is asked for a number they already gave us.
 */
function normaliseContact(raw: string): string | undefined {
  const digits = raw.replace(/\D/g, "");
  const last10 = digits.slice(-10);
  return /^[6-9]\d{9}$/.test(last10) ? `+91${last10}` : undefined;
}

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
  savedAddresses = [],
}: {
  isAuthed: boolean;
  userEmail?: string;
  userName?: string;
  /** Authed carts are resolved server-side; guests hydrate client-side. */
  initialLines: CheckoutLine[] | null;
  /** The signed-in customer's address book; empty for guests. */
  savedAddresses?: SavedAddress[];
}) {
  const router = useRouter();
  const [lines, setLines] = useState<CheckoutLine[] | null>(initialLines);
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingPayment, setPendingPayment] = useState<PendingPayment | null>(null);
  const [paymentDismissed, setPaymentDismissed] = useState(false);
  const [saveAddress, setSaveAddress] = useState(true);

  // Preselect the default address so the common case is one click, not a form.
  const preselected = savedAddresses.find((a) => a.isDefault) ?? savedAddresses[0];
  const [selectedAddressId, setSelectedAddressId] = useState<string>(
    preselected?.id ?? NEW_ADDRESS
  );

  const [form, setForm] = useState({
    email: userEmail ?? "",
    fullName: preselected?.fullName ?? userName ?? "",
    phone: preselected?.phone ?? "",
    addressLine1: preselected?.addressLine1 ?? "",
    addressLine2: preselected?.addressLine2 ?? "",
    city: preselected?.city ?? "",
    state: preselected?.state ?? "",
    pincode: preselected?.pincode ?? "",
    notes: "",
    paymentMethod: "razorpay" as "razorpay" | "cod",
  });

  /** Copies a saved address into the form, or clears it for manual entry. */
  function chooseAddress(id: string) {
    setSelectedAddressId(id);
    const address = savedAddresses.find((a) => a.id === id);
    setForm((f) => ({
      ...f,
      fullName: address?.fullName ?? userName ?? "",
      phone: address?.phone ?? "",
      addressLine1: address?.addressLine1 ?? "",
      addressLine2: address?.addressLine2 ?? "",
      city: address?.city ?? "",
      state: address?.state ?? "",
      pincode: address?.pincode ?? "",
    }));
  }

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
      prefill: {
        name: form.fullName,
        email: form.email,
        contact: normaliseContact(form.phone),
      },
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
      modal: {
        // Razorpay draws the "are you sure you want to close?" prompt itself,
        // so there is no dialog of ours to keep in step with theirs. A customer
        // who has reached the payment window has already committed; an
        // accidental back-tap costing the sale is worse than one extra tap for
        // the rare deliberate exit.
        confirm_close: true,
        // Without this, Esc still closes the window silently and walks straight
        // past the prompt above.
        escape: false,
        ondismiss: () => setPaymentDismissed(true),
      },
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

      // Fire-and-forget: the order is already placed, so a failure to save the
      // address must never surface as a checkout error.
      if (isAuthed && selectedAddressId === NEW_ADDRESS && saveAddress) {
        void saveCheckoutAddressAction({
          fullName: form.fullName,
          phone: form.phone,
          addressLine1: form.addressLine1,
          addressLine2: form.addressLine2,
          city: form.city,
          state: form.state,
          pincode: form.pincode,
        });
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
            <p className="border-l-2 border-destructive bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          {pendingPayment && paymentDismissed && (
            <div className="border-l-2 border-brass bg-brass-subtle px-3 py-3 text-sm">
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
            <legend className="label-eyebrow mb-1">Shipping address</legend>

            {savedAddresses.length > 0 && (
              <div className="space-y-2">
                {savedAddresses.map((address) => (
                  <label
                    key={address.id}
                    className={`flex cursor-pointer gap-3 border p-3 text-sm transition-colors ${
                      selectedAddressId === address.id ? "border-foreground bg-muted/50" : ""
                    }`}
                  >
                    <input
                      type="radio"
                      name="savedAddress"
                      className="mt-1"
                      checked={selectedAddressId === address.id}
                      onChange={() => chooseAddress(address.id)}
                    />
                    <span>
                      <span className="font-medium">
                        {address.fullName}
                        {address.label && (
                          <span className="ml-2 text-xs text-muted-foreground">
                            ({address.label})
                          </span>
                        )}
                      </span>
                      <span className="block text-muted-foreground">
                        {address.addressLine1}
                        {address.addressLine2 ? `, ${address.addressLine2}` : ""}
                      </span>
                      <span className="block text-muted-foreground">
                        {address.city}, {address.state} — {address.pincode}
                      </span>
                      <span className="block text-muted-foreground">{address.phone}</span>
                    </span>
                  </label>
                ))}

                <label className="flex cursor-pointer items-center gap-3 border p-3 text-sm">
                  <input
                    type="radio"
                    name="savedAddress"
                    checked={selectedAddressId === NEW_ADDRESS}
                    onChange={() => chooseAddress(NEW_ADDRESS)}
                  />
                  Deliver to a different address
                </label>
              </div>
            )}

            {/* Hidden (not just disabled) when a saved address is chosen —
                `required` on an invisible input blocks submit with no visible
                explanation. */}
            {selectedAddressId === NEW_ADDRESS && (
              <div className="space-y-4">
                {field("fullName", "Full name", { required: true, autoComplete: "name" })}
                {field("phone", "Mobile number", {
                  required: true,
                  type: "tel",
                  inputMode: "numeric",
                  autoComplete: "tel",
                  placeholder: "9876543210",
                  pattern: "(\\+?91|0)?[6-9][0-9]{9}",
                  title: "10-digit Indian mobile number",
                })}
                {field("addressLine1", "Address line 1", {
                  required: true,
                  autoComplete: "address-line1",
                })}
                {field("addressLine2", "Address line 2 (optional)", {
                  autoComplete: "address-line2",
                })}
                <div className="grid grid-cols-2 gap-4">
                  {field("city", "City", { required: true, autoComplete: "address-level2" })}
                  <div className="space-y-1.5">
                    <Label htmlFor="state">State</Label>
                    <select
                      id="state"
                      required
                      autoComplete="address-level1"
                      value={form.state}
                      onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))}
                      className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                    >
                      <option value="" disabled>
                        Select…
                      </option>
                      {INDIAN_STATES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                {field("pincode", "Pincode", {
                  required: true,
                  autoComplete: "postal-code",
                  pattern: "[0-9]{6}",
                  title: "6-digit pincode",
                })}

                {isAuthed && savedAddresses.length < MAX_ADDRESSES && (
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={saveAddress}
                      onChange={(e) => setSaveAddress(e.target.checked)}
                      className="size-4 rounded border-input"
                    />
                    Save this address to my account
                  </label>
                )}
              </div>
            )}
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="label-eyebrow mb-1">Payment method</legend>
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

          {/* Hidden on mobile — the sticky bar below is the button there, and
              two submit buttons on one screen is a question, not a shortcut.
              Same split as the cart; see cart-summary.tsx. */}
          <Button
            type="submit"
            variant="cta"
            size="cta"
            className="hidden w-full md:inline-flex"
            disabled={submitting}
          >
            {submitting
              ? "Placing order…"
              : form.paymentMethod === "cod"
                ? `Place order — ${formatINRPaise(totalPaise)}`
                : `Pay ${formatINRPaise(totalPaise)}`}
          </Button>

          {/* Mobile: the amount and the action pinned to the bottom, matching
              the cart and product pages. Rendered inside the <form> so it stays
              a plain submit button — `fixed` takes it out of flow either way.
              Checkout is the longest page on the site and the button was under
              an address form, a payment choice and a notes field. */}
          <StickyActionBar>
            <div className="min-w-0 flex-1">
              <p className="truncate text-base font-medium leading-tight">
                {formatINRPaise(totalPaise)}
              </p>
              <p className="text-xs text-muted-foreground">
                {shippingPaise === 0 ? "Free shipping" : "Incl. shipping"}
              </p>
            </div>
            <Button
              type="submit"
              variant="cta"
              size="cta"
              className="h-12 shrink-0 px-8 sm:h-12"
              disabled={submitting}
            >
              {submitting
                ? "Placing…"
                : form.paymentMethod === "cod"
                  ? "Place order"
                  : "Pay now"}
            </Button>
          </StickyActionBar>
        </form>

        <div className="h-fit border-t pt-6 lg:sticky lg:top-[7.5rem]">
          <h2 className="label-eyebrow mb-5">Order summary</h2>
          <div className="space-y-3">
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
            <div className="flex justify-between border-t pt-3 text-sm font-medium">
              <span>Total</span>
              <span>{formatINRPaise(totalPaise)}</span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
