"use client";

import { useEffect, useState } from "react";
import { focusFirstInvalid } from "@/lib/form-validity";
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
import {
  PaymentProcessingOverlay,
  type PaymentStage,
} from "@/components/storefront/checkout/payment-processing-overlay";
import { readGuestCart, clearGuestCart } from "@/lib/guest-cart";
import { formatINRPaise } from "@/lib/format";
import { shippingChargePaise, type ShippingRates } from "@/server/orders/money";
import {
  INDIAN_STATES,
  MAX_ADDRESSES,
  PINCODE_STATE_MISMATCH,
  pincodeMatchesState,
} from "@/lib/validation/account";
import { saveCheckoutAddressAction } from "@/actions/account-actions";
import { checkPincodeAction, type PincodeCheck } from "@/actions/shipping-actions";
import { UseMyLocationButton } from "@/components/storefront/checkout/use-my-location-button";

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
  rates,
  codEnabled,
  geocodingEnabled,
}: {
  isAuthed: boolean;
  userEmail?: string;
  userName?: string;
  /** Authed carts are resolved server-side; guests hydrate client-side. */
  initialLines: CheckoutLine[] | null;
  /** The signed-in customer's address book; empty for guests. */
  savedAddresses?: SavedAddress[];
  /** Admin-editable shipping rates — see ShippingRates in server/orders/money.ts. */
  rates: ShippingRates;
  /**
   * Whether to offer cash on delivery.
   *
   * ⚠️  Presentation only. Hiding the radio does not stop a crafted POST, so
   * placeOrderAction and createOrder both re-check the same setting. Do not
   * treat this prop as the enforcement point.
   */
  codEnabled: boolean;
  /**
   * Whether a reverse-geocoding key is configured on the server.
   *
   * Resolved server-side because the key itself never comes near the browser —
   * the client cannot check for it, only be told. False hides the button
   * entirely rather than showing one that reports a failure on every tap.
   */
  geocodingEnabled: boolean;
}) {
  const router = useRouter();
  const [lines, setLines] = useState<CheckoutLine[] | null>(initialLines);
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [submitting, setSubmitting] = useState(false);
  /**
   * Which wait, if any, the shopper is currently in — see
   * checkout/payment-processing-overlay.tsx.
   *
   * Separate from `submitting`, which only covers the order-creation call and
   * goes false again the moment Razorpay opens its window. The gap this closes
   * is AFTER that window shuts, while the payment is being confirmed and the
   * form is back on screen looking untouched and pressable.
   */
  const [paymentStage, setPaymentStage] = useState<PaymentStage | null>(null);
  const [error, setError] = useState<string | null>(null);
  /**
   * The ids of fields the browser rejected on the last submit attempt.
   *
   * Empty until someone actually tries to pay — marking a form red before it
   * has been submitted scolds a shopper for not having filled in a field they
   * have not reached yet. Each id is dropped again as soon as that field is
   * edited, so the red clears as it is fixed rather than only on the next
   * attempt.
   */
  const [invalidFields, setInvalidFields] = useState<Set<string>>(new Set());
  const [pendingPayment, setPendingPayment] = useState<PendingPayment | null>(null);
  const [paymentDismissed, setPaymentDismissed] = useState(false);
  const [saveAddress, setSaveAddress] = useState(true);

  /**
   * The last serviceability answer, stored WITH the question it answers.
   *
   * Keyed rather than bare so both "is this still the pincode we asked about"
   * and "are we waiting" can be derived during render instead of reset from an
   * effect — clearing it with `useEffect(() => setX(null), [pincode])` is a
   * synchronous setState in an effect body, which schedules a second render on
   * every keystroke and which the project's lint rules reject. Same reasoning
   * as the open-panel state in mega-menu.tsx.
   *
   * `cod` is part of the key because COD serviceability is a different question
   * from prepaid: a pincode can take one and not the other, so switching
   * payment method has to re-ask rather than reuse the previous answer.
   */
  const [pincodeAnswer, setPincodeAnswer] = useState<{
    pincode: string;
    cod: boolean;
    result: PincodeCheck;
  } | null>(null);

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

  const { pincode: formPincode, paymentMethod } = form;
  /**
   * `codEnabled` wins over the form state, so the flag turning off mid-session
   * cannot leave a stale "cod" selection driving the serviceability lookup, the
   * submit payload or the button label. There is no effect resetting the form —
   * one derived value is enough, and it cannot get out of step.
   */
  const wantCod = codEnabled && paymentMethod === "cod";
  const pincodeComplete = /^\d{6}$/.test(formPincode);

  /** The stored answer, but only if it answers the question currently on screen. */
  const pincodeCheck =
    pincodeAnswer && pincodeAnswer.pincode === formPincode && pincodeAnswer.cod === wantCod
      ? pincodeAnswer.result
      : null;

  /** Six digits typed and no answer for them yet — nothing to reset. */
  const checkingPincode = pincodeComplete && pincodeCheck === null;

  /**
   * Ask Shiprocket, debounced.
   *
   * Every in-flight answer is discarded if the question changed while it was in
   * the air. Without that guard a slow reply for "560001" can land after a fast
   * one for "560002" and label the wrong pincode serviceable.
   */
  useEffect(() => {
    if (!pincodeComplete || !checkingPincode) return;

    let cancelled = false;
    const timer = setTimeout(async () => {
      const result = await checkPincodeAction(formPincode, wantCod);
      if (!cancelled) setPincodeAnswer({ pincode: formPincode, cod: wantCod, result });
    }, 450);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [formPincode, wantCod, pincodeComplete, checkingPincode]);

  /**
   * ONLY a definite "no" blocks the order. Not the pending check, not an
   * outage, not an un-asked pincode — the whole point of this is to stop taking
   * money for a parcel that cannot be delivered, not to gate checkout behind a
   * third-party API being up.
   */
  const blockedByPincode = pincodeCheck?.status === "unserviceable";

  /**
   * The state dropdown and the pincode disagreeing.
   *
   * ⚠️  Reported from the live site: choosing Punjab and typing a Chennai
   * pincode placed the order successfully. Both fields were valid on their own
   * and nothing compared them, so the shop only found out when the courier did.
   *
   * placeOrderAction rejects this too — that is the enforcement, and this is
   * not. Doing it here as well means the shopper sees it under the field they
   * mistyped, while they are still looking at it, instead of as a red banner
   * after they have committed to paying.
   *
   * Only speaks once both fields are filled; half-typed input is not a
   * contradiction yet.
   */
  const stateMismatch =
    pincodeComplete && form.state !== "" && !pincodeMatchesState(formPincode, form.state);

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
    return <p className="rhythm-transactional text-center text-muted-foreground">Your cart is empty.</p>;
  }

  const subtotalPaise = lines.reduce((s, l) => s + l.pricePaise * l.quantity, 0);
  const shippingPaise = shippingChargePaise(subtotalPaise, rates);
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
        /**
         * Timing the gap a shopper actually feels: Razorpay closing its window,
         * and the order page appearing.
         *
         * The server's own [fulfill] line (server/orders/fulfill-timing.ts)
         * measures the work inside the action. It cannot see two things that
         * happen out here and can easily be the larger half: the round trip to
         * the Server Action, and the navigation itself — which in `next dev`
         * includes compiling the destination route on demand, frequently
         * seconds, and does not exist in production.
         *
         * Read both numbers together. `verify` much larger than the server's
         * `total` means the network or the action round trip; `navigate` large
         * with a small `verify` means the destination page.
         */
        // Razorpay's window has just closed, so the form is visible again and
        // looks entirely pressable. This is the gap the overlay exists for.
        setPaymentStage("verifying");

        const began = performance.now();
        const result = await verifyPaymentAction({
          razorpayOrderId: resp.razorpay_order_id,
          razorpayPaymentId: resp.razorpay_payment_id,
          razorpaySignature: resp.razorpay_signature,
        });
        const verified = performance.now();
        console.info(`[checkout] verify=${Math.round(verified - began)}ms`);

        if (result.ok) {
          if (!isAuthed) clearGuestCart();
          router.push(successUrl(payment.orderId, payment.confirmationToken));
          // router.push resolves when the transition is committed, so this
          // measures the wait for the order page rather than just the call.
          console.info(`[checkout] navigate=${Math.round(performance.now() - verified)}ms`);
          /**
           * The overlay stays up through the navigation and is unmounted with
           * the page. Clearing it here would flash the checkout form back for a
           * frame before the order page paints — the last thing to show someone
           * who has just paid.
           */
        } else {
          // Verification refused: the form has to come back, because the error
          // banner is on it and there may be a retry to make.
          setPaymentStage(null);
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

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    /**
     * Read synchronously, before any await. `e.currentTarget` is null by the
     * time an awaited call resolves, so capturing it later would throw on the
     * one path that matters least and be invisible in testing.
     */
    const formElement = e.currentTarget;

    // The form carries noValidate, so this is the only thing standing between a
    // half-filled address and placeOrderAction. See lib/form-validity.ts.
    const invalid = focusFirstInvalid(formElement);
    if (invalid.length > 0) {
      setInvalidFields(new Set(invalid));
      setError(
        invalid.length === 1
          ? "One field still needs filling in — it's highlighted below."
          : `${invalid.length} fields still need filling in — they're highlighted below.`
      );
      return;
    }

    setInvalidFields(new Set());
    setError(null);
    setSubmitting(true);
    setPaymentStage("placing");
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
        paymentMethod: wantCod ? "cod" : "razorpay",
        notes: form.notes,
        idempotencyKey,
        guestEmail: isAuthed ? undefined : form.email,
        guestItems: isAuthed
          ? undefined
          : readGuestCart().map((i) => ({ productId: i.productId, quantity: i.quantity })),
      });

      if (!result.ok) {
        // Nothing was placed — put the form back so the banner can be read and
        // whatever it complains about can be fixed.
        setPaymentStage(null);
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
        /**
         * Razorpay's own window now covers the page and is the thing to look
         * at, so ours comes down. It goes back up in the handler, once their
         * window closes and the confirmation begins.
         */
        setPaymentStage(null);
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

  /** Drops a field's red mark the moment it is edited. */
  function clearInvalid(name: string) {
    setInvalidFields((current) => {
      if (!current.has(name)) return current; // no re-render on every keystroke
      const next = new Set(current);
      next.delete(name);
      return next;
    });
  }

  function field(name: keyof typeof form, label: string, props?: React.ComponentProps<typeof Input>) {
    return (
      <div className="space-y-1.5">
        <Label htmlFor={name}>{label}</Label>
        <Input
          id={name}
          value={form[name]}
          // ui/input.tsx already styles aria-invalid — destructive border and
          // ring. Nothing new is needed to make these read as errors.
          aria-invalid={invalidFields.has(name)}
          onChange={(e) => {
            setForm((f) => ({ ...f, [name]: e.target.value }));
            clearInvalid(name);
          }}
          {...props}
        />
      </div>
    );
  }

  return (
    <>
      <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="afterInteractive" />

      <PaymentProcessingOverlay stage={paymentStage} />

      {/**
       * `inert` while a payment is in flight — the overlay alone is not enough.
       *
       * Covering the page stops a POINTER reaching the form. It does nothing
       * about the keyboard: Tab still walks into the fields underneath, and
       * Enter on the focused pay button submits again. `inert` takes the whole
       * subtree out of the tab order, out of the accessibility tree and out of
       * reach of clicks in one attribute, which is exactly the intent.
       *
       * On the wrapper rather than the <form>, so the order summary beside it
       * is frozen too — it carries its own pay button on desktop.
       */}
      <div
        inert={paymentStage !== null}
        className="grid gap-8 lg:grid-cols-[1fr_360px]"
      >
        {/* noValidate hands reporting to focusFirstInvalid — see the note in
            lib/form-validity.ts. The browser still does the CHECKING; what it
            no longer does is place an unstyled bubble that vanishes on the next
            click and can sit under a phone keyboard. */}
        <form onSubmit={handleSubmit} noValidate className="space-y-6">
          {error && (
            <p className="border-l-2 border-destructive bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          {pendingPayment && paymentDismissed && (
            <div className="border-l-2 border-black bg-half-white px-3 py-3 text-sm">
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
            field("email", "Email", {
              type: "email",
              required: true,
              autoComplete: "email",
              placeholder: "Enter your email address",
            })}

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
                {/**
                 * Only rendered when a geocoding key is configured — a button
                 * that always fails is worse than no button. See
                 * isGeocodingConfigured.
                 *
                 * Placed above the fields rather than beside the pincode: it
                 * fills three of them, so it belongs to the group.
                 */}
                {geocodingEnabled && (
                  <UseMyLocationButton
                    disabled={submitting}
                    onFill={(fill) => {
                      setForm((f) => ({
                        ...f,
                        // Each field only if we actually got one — a partial
                        // answer must never blank what the shopper already
                        // typed.
                        city: fill.city ?? f.city,
                        state: fill.state ?? f.state,
                        pincode: fill.pincode ?? f.pincode,
                      }));
                      // Filled fields are no longer the ones holding up submit.
                      if (fill.city) clearInvalid("city");
                      if (fill.state) clearInvalid("state");
                      if (fill.pincode) clearInvalid("pincode");
                    }}
                  />
                )}

                {/**
                 * ⚠️  Placeholders instruct; they never show sample DATA.
                 *
                 * Mobile number was `placeholder="9876543210"`, and at a glance
                 * a grey ten-digit number is indistinguishable from one the
                 * shopper has typed. People skipped the field believing it was
                 * already filled, then had the submit refused on a box that
                 * looked complete. That is the exact confusion this form can
                 * least afford, being the last screen before payment.
                 */}
                {field("fullName", "Full name", {
                  required: true,
                  autoComplete: "name",
                  placeholder: "Enter your full name",
                })}
                {field("phone", "Mobile number", {
                  required: true,
                  type: "tel",
                  inputMode: "numeric",
                  autoComplete: "tel",
                  placeholder: "Enter your 10-digit mobile number",
                  pattern: "(\\+?91|0)?[6-9][0-9]{9}",
                  title: "10-digit Indian mobile number",
                })}
                {field("addressLine1", "Address line 1", {
                  required: true,
                  autoComplete: "address-line1",
                  // Says what belongs on THIS line rather than repeating the
                  // label — the split between the two lines is the thing people
                  // actually hesitate over.
                  placeholder: "House or flat number, building, street",
                })}
                {field("addressLine2", "Address line 2 (optional)", {
                  autoComplete: "address-line2",
                  placeholder: "Area, landmark",
                })}
                <div className="grid grid-cols-2 gap-4">
                  {field("city", "City", {
                    required: true,
                    autoComplete: "address-level2",
                    placeholder: "Enter your city",
                  })}
                  <div className="space-y-1.5">
                    <Label htmlFor="state">State</Label>
                    <select
                      id="state"
                      required
                      autoComplete="address-level1"
                      value={form.state}
                      aria-invalid={invalidFields.has("state")}
                      onChange={(e) => {
                        setForm((f) => ({ ...f, state: e.target.value }));
                        clearInvalid("state");
                      }}
                      // aria-invalid classes spelled out because this is a bare
                      // <select>, not ui/input.tsx — it gets none of Input's
                      // styling for free. Kept identical so a red state field
                      // matches a red text field beside it.
                      className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20"
                    >
                      <option value="" disabled>
                        Select your state
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
                  inputMode: "numeric",
                  pattern: "[0-9]{6}",
                  title: "6-digit pincode",
                  placeholder: "Enter your 6-digit pincode",
                })}

                {/* Only two of the four states say anything. "unknown" is an
                    outage and stays silent — telling a shopper we could not
                    reach our courier tells them nothing they can act on — and
                    the un-asked state has nothing to report either. */}
                {/* Takes precedence over everything below it: if the state and
                    the pincode disagree, a delivery estimate is an estimate for
                    somewhere the shopper may not have meant. */}
                {stateMismatch && (
                  <p className="text-xs text-destructive">{PINCODE_STATE_MISMATCH}</p>
                )}
                {!stateMismatch && checkingPincode && (
                  <p className="text-xs text-muted-foreground">Checking delivery…</p>
                )}
                {!stateMismatch && !checkingPincode && pincodeCheck?.status === "serviceable" && (
                  <p className="text-xs text-muted-foreground">
                    {pincodeCheck.estimatedDays
                      ? `Delivers in about ${pincodeCheck.estimatedDays} day${
                          pincodeCheck.estimatedDays === 1 ? "" : "s"
                        }.`
                      : "We deliver to this pincode."}
                  </p>
                )}
                {!stateMismatch && !checkingPincode && pincodeCheck?.status === "unserviceable" && (
                  <p className="text-xs text-destructive">
                    {wantCod
                      ? "Cash on delivery isn't available for this pincode. Try paying online, or use a different address."
                      : "We can't deliver to this pincode yet. Please try a different address."}
                  </p>
                )}

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

          {/* With COD switched off there is exactly one way to pay, and a
              radio group of one is a question with no answer to give — it reads
              as though something else was meant to be there. The whole fieldset
              goes; the button below already says "Pay ₹x", which is the only
              thing the single remaining method needed to communicate. */}
          {codEnabled && (
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
          )}

          <div className="space-y-1.5">
            <Label htmlFor="notes">Order notes (optional)</Label>
            <Textarea
              id="notes"
              value={form.notes}
              placeholder="Anything we should know — a delivery instruction, a gift message"
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
            disabled={submitting || blockedByPincode || stateMismatch}
          >
            {submitting
              ? "Placing order…"
              : wantCod
                ? `Place order — ${formatINRPaise(totalPaise)}`
                : `Pay ${formatINRPaise(totalPaise)}`}
          </Button>

          {/**
           * One line of reassurance at the button, which is where the doubt is.
           *
           * ⚠️  Both halves are literally true and neither is a badge. Razorpay
           * IS the gateway (see openRazorpay above), and card details genuinely
           * never reach this shop — Checkout.js collects them inside Razorpay's
           * own iframe on their domain, which is the whole reason the payment
           * window is not our markup.
           *
           * Naming the gateway is the trust cue that works in India: Razorpay
           * is recognised, and "secured by <company nobody has heard of>" says
           * nothing. This is deliberately NOT a row of card-network logos —
           * those are images of other companies' trademarks used as decoration,
           * and the shopper is about to see the real list inside the payment
           * window anyway.
           *
           * Hidden with the button it belongs to. The mobile equivalent would
           * sit in the sticky bar, which has room for an amount and an action
           * and nothing else.
           */}
          {!wantCod && (
            <p className="mt-3 hidden text-center text-xs text-muted-foreground md:block">
              Payments are handled by Razorpay. Your card details are entered on their
              secure page and never reach us.
            </p>
          )}

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
              disabled={submitting || blockedByPincode || stateMismatch}
            >
              {submitting
                ? "Placing…"
                : wantCod
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
                <span className="figures">{formatINRPaise(line.pricePaise * line.quantity)}</span>
              </div>
            ))}
            <div className="flex justify-between border-t pt-3 text-sm">
              <span className="text-muted-foreground">Shipping</span>
              <span className="figures">{shippingPaise === 0 ? "Free" : formatINRPaise(shippingPaise)}</span>
            </div>
            {/* Steps up while the line items stay at 14px — same reasoning as
                the cart's summary block, which this mirrors. */}
            <div className="flex items-baseline justify-between border-t pt-3 text-base font-semibold">
              <span>Total</span>
              <span className="figures">{formatINRPaise(totalPaise)}</span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
