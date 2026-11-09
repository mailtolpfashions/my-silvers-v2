"use client";

import { useState } from "react";
import { Tag, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatINRPaise } from "@/lib/format";
import type { CouponState } from "@/components/storefront/cart/use-coupon";

/**
 * "Have a coupon?" — the input, or the applied code with its saving.
 *
 * The state lives in useCoupon (one per summary), so this is presentation
 * only and the cart and checkout render the same control.
 */
export function CouponBox({ coupon }: { coupon: CouponState }) {
  const [draft, setDraft] = useState("");
  const [open, setOpen] = useState(false);

  if (coupon.code && !coupon.error) {
    return (
      <div className="flex items-center justify-between gap-3 border border-dashed border-foreground/40 px-3 py-2.5 text-sm">
        <span className="flex min-w-0 items-center gap-2">
          <Tag className="size-4 shrink-0" aria-hidden />
          <span className="min-w-0">
            <span className="font-medium tracking-wide">{coupon.code}</span>{" "}
            <span className="text-muted-foreground">
              {coupon.pending
                ? "checking…"
                : `applied — you save ${formatINRPaise(coupon.discountPaise)}`}
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

  if (!open && !coupon.error) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 text-sm underline underline-offset-4"
      >
        <Tag className="size-4" aria-hidden />
        Have a coupon code?
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
