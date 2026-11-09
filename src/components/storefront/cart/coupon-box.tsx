"use client";

import { useState } from "react";
import { Tag, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatINRPaise } from "@/lib/format";
import type { CouponState } from "@/components/storefront/cart/use-coupon";
import type { Offer } from "@/server/coupons/coupons";

/**
 * Coupons in the order summary: the applied code (if any), the shop's listed
 * offers with an Apply button each, and a field for a code typed by hand.
 *
 * The state lives in useCoupon (one per summary), so this is presentation
 * only and the cart and checkout render the same control. One code per order:
 * applying an offer replaces whatever was applied before.
 */
export function CouponBox({ coupon }: { coupon: CouponState }) {
  const applied = coupon.code && !coupon.error ? coupon.code : "";
  const others = coupon.offers.filter((o) => o.code !== applied);

  return (
    <div className="space-y-4">
      {applied && <AppliedCoupon coupon={coupon} />}

      {others.length > 0 && (
        <section aria-label={applied ? "Other offers" : "Available offers"}>
          <h3 className="label-eyebrow mb-2">{applied ? "Other offers" : "Available offers"}</h3>
          <ul className="space-y-2">
            {others.map((offer) => (
              <OfferRow
                key={offer.code}
                offer={offer}
                disabled={coupon.pending}
                switching={!!applied}
                onApply={() => void coupon.apply(offer.code)}
              />
            ))}
          </ul>
        </section>
      )}

      {!applied && <CodeEntry coupon={coupon} hasOffers={others.length > 0} />}
    </div>
  );
}

function AppliedCoupon({ coupon }: { coupon: CouponState }) {
  return (
    <div className="flex items-center justify-between gap-3 border border-dashed border-foreground/40 px-3 py-2.5 text-sm">
      <span className="flex min-w-0 items-center gap-2">
        <Tag className="size-4 shrink-0" aria-hidden />
        <span className="min-w-0">
          <span className="font-medium tracking-wide">{coupon.code}</span>{" "}
          <span className="text-muted-foreground">
            {coupon.pending ? "checking…" : `applied — you save ${formatINRPaise(coupon.discountPaise)}`}
          </span>
        </span>
      </span>
      <button
        type="button"
        onClick={coupon.remove}
        className="shrink-0 p-1 text-muted-foreground hover:text-foreground"
        aria-label={`Remove coupon ${coupon.code}`}
      >
        <X className="size-4" />
      </button>
    </div>
  );
}

function OfferRow({
  offer,
  disabled,
  switching,
  onApply,
}: {
  offer: Offer;
  disabled: boolean;
  switching: boolean;
  onApply: () => void;
}) {
  const available = offer.discountPaise !== null;
  return (
    <li
      className={`flex items-start justify-between gap-3 border px-3 py-2.5 text-sm ${
        available ? "" : "bg-muted/40 text-muted-foreground"
      }`}
    >
      <div className="min-w-0">
        <p>
          <span className="font-medium tracking-wide text-foreground">{offer.code}</span>
          <span> · {offer.headline}</span>
        </p>
        {offer.conditions && <p className="mt-0.5 text-xs text-muted-foreground">{offer.conditions}</p>}
        {available ? (
          <p className="saving mt-1 text-xs">You save {formatINRPaise(offer.discountPaise!)}</p>
        ) : (
          <p className="mt-1 text-xs text-foreground">{offer.locked}</p>
        )}
      </div>
      {available && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0"
          disabled={disabled}
          onClick={onApply}
          aria-label={`Apply ${offer.code}`}
        >
          {switching ? "Use this" : "Apply"}
        </Button>
      )}
    </li>
  );
}

function CodeEntry({ coupon, hasOffers }: { coupon: CouponState; hasOffers: boolean }) {
  const [draft, setDraft] = useState("");
  const [open, setOpen] = useState(false);

  if (!open && !coupon.error) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 text-sm underline underline-offset-4"
      >
        <Tag className="size-4" aria-hidden />
        {hasOffers ? "Have a different code?" : "Have a coupon code?"}
      </button>
    );
  }

  return (
    <div className="space-y-2">
      <form
        className="flex gap-2"
        onSubmit={async (e) => {
          // Its own tiny form: Enter applies the code instead of submitting
          // the checkout around it. Not nested — the checkout summary sits
          // outside the checkout <form>.
          e.preventDefault();
          if (await coupon.apply(draft)) setDraft("");
        }}
      >
        <Input
          aria-label="Coupon code"
          placeholder="Enter coupon code"
          value={draft}
          onChange={(e) => setDraft(e.target.value.toUpperCase())}
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          className="uppercase"
          maxLength={40}
        />
        <Button type="submit" variant="outline" disabled={!draft.trim() || coupon.pending}>
          {coupon.pending ? "Checking…" : "Apply"}
        </Button>
      </form>
      {coupon.error && (
        <p className="flex items-start justify-between gap-3 text-sm text-destructive" role="alert">
          <span>{coupon.error}</span>
          <button type="button" onClick={coupon.remove} className="shrink-0 underline underline-offset-4">
            Clear
          </button>
        </p>
      )}
    </div>
  );
}
