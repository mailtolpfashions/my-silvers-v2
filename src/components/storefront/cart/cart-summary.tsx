import Link from "next/link";
import { Button } from "@/components/ui/button";
import { StickyActionBar } from "@/components/storefront/sticky-action-bar";
import { formatINRPaise } from "@/lib/format";
import { shippingChargePaise, type ShippingRates } from "@/server/orders/money";

/**
 * The order summary.
 *
 * No <Card>. The shadcn Card is a rounded, bordered, shadowed surface built for
 * an admin dashboard, and it was the last one on the storefront — a soft app
 * panel sitting beside a hairline-ruled cart list. It is now a ruled block:
 * same information, same arithmetic, no container.
 */
export function CartSummary({
  subtotalPaise,
  /**
   * Total saved across the order, in paise. Computed by the CALLER, because
   * only the caller holds the per-line compare-at prices — and both callers
   * total it with the same savingPaise the product pages use, so the cart can
   * never claim a saving a product page declined to show.
   *
   * Defaulted rather than required: the summary renders nothing for it at
   * zero, so a caller with no discounted lines passes nothing.
   */
  savedPaise = 0,
  // Rates arrive as a prop because they are admin-editable settings and this
  // component renders inside the client-side guest cart as well as the server
  // cart — see the note on ShippingRates in server/orders/money.ts.
  rates,
}: {
  subtotalPaise: number;
  savedPaise?: number;
  rates: ShippingRates;
}) {
  const shippingPaise = shippingChargePaise(subtotalPaise, rates);
  const totalPaise = subtotalPaise + shippingPaise;
  const remainingForFree = rates.freeShippingThresholdPaise - subtotalPaise;

  /**
   * What this order would have cost at the undiscounted prices.
   *
   * Derived rather than passed: `savedPaise` already carries every rule about
   * what counts (see savingPaise), so adding it back is the only definition of
   * "before" that can agree with the saving stated below. A separately computed
   * original could drift from it, and the two sit four lines apart where a
   * shopper can check the subtraction.
   */
  const originalSubtotalPaise = subtotalPaise + savedPaise;

  /**
   * Delivery earned rather than delivery absent.
   *
   * Free shipping shown as the word "Free" alone says nothing about what was
   * avoided. Struck against the real charge it says what the threshold was
   * worth — and the charge is an admin setting, so this is whatever the shop
   * has configured, not a number invented here.
   */
  const shippingSavedPaise = shippingPaise === 0 ? rates.shippingChargePaise : 0;

  /**
   * ⚠️  Includes the shipping saving, and must.
   *
   * The two struck figures above are the shopper's own working: subtotal saved
   * plus delivery saved. If this line counted only the product discount, anyone
   * adding up the strikes would land on a bigger number than the total claims
   * and conclude one of them is wrong. Every figure in this block reconciles.
   */
  const totalSavedPaise = savedPaise + shippingSavedPaise;

  return (
    <>
      {/* Below md the summary sits at the very bottom of a long list, so a
          shopper has to scroll past every line to reach checkout. The bar
          carries the total and the button; the block keeps the breakdown.
          Rendered here rather than on the page because the authed and guest
          carts both use this component — one place, both flows. */}
      <StickyActionBar>
        <div className="min-w-0 flex-1">
          <p className="figures truncate text-lg font-semibold leading-tight">
            {formatINRPaise(totalPaise)}
          </p>
          <p className="text-xs text-muted-foreground">
            {shippingPaise === 0 ? "Free shipping" : "Incl. shipping"}
          </p>
        </div>
        <Button asChild variant="cta" size="cta" className="h-12 shrink-0 px-8 sm:h-12">
          <Link href="/checkout">Checkout</Link>
        </Button>
      </StickyActionBar>

      <div className="border-t pt-6">
        <h2 className="label-eyebrow mb-5">Order summary</h2>

        <dl className="space-y-3 text-sm">
          {/* The struck figure sits to the LEFT of the one being charged, in
              both rows. Read left to right that is "was, now" — the order the
              price is read in on the product page and the grid tiles, so the
              cart says it the same way the rest of the site does. */}
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Subtotal</dt>
            <dd className="flex items-baseline gap-2">
              {savedPaise > 0 && (
                <span className="figures text-muted-foreground line-through">
                  {formatINRPaise(originalSubtotalPaise)}
                </span>
              )}
              <span className="figures">{formatINRPaise(subtotalPaise)}</span>
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Shipping</dt>
            <dd className="flex items-baseline gap-2">
              {shippingSavedPaise > 0 && (
                <span className="figures text-muted-foreground line-through">
                  {formatINRPaise(shippingSavedPaise)}
                </span>
              )}
              <span className="figures">
                {shippingPaise === 0 ? "Free" : formatINRPaise(shippingPaise)}
              </span>
            </dd>
          </div>
          {/* Two different jobs, so never both at once.
              Under the threshold the shopper can still act, and the actionable
              form of this fact is what is missing rather than what the rule is.
              Over it, the rule is what explains the struck charge above. */}
          {remainingForFree > 0 ? (
            <p className="text-xs text-black">
              Add {formatINRPaise(remainingForFree)} more for free shipping.
            </p>
          ) : (
            rates.freeShippingThresholdPaise > 0 && (
              <p className="text-xs text-muted-foreground">
                Free delivery on orders above {formatINRPaise(rates.freeShippingThresholdPaise)}.
              </p>
            )
          )}
          {/* The breakdown rows stay at 14px — they are arithmetic. Only the
              total steps up, because it is the one number in this block a
              shopper is actually deciding on. Bumping every row would make the
              summary louder without making the total lead. */}
          <div className="flex items-baseline justify-between border-t pt-3 text-base font-semibold">
            <dt>Total</dt>
            <dd className="figures">{formatINRPaise(totalPaise)}</dd>
          </div>
        </dl>

        {/* Below the total, and deliberately OUTSIDE the <dl>.

            It is not a line item. The subtotal above is already the discounted
            money, so a "You saved" row sitting among Subtotal/Shipping/Total
            reads as something still to be taken off — a shopper doing the
            arithmetic would find it does not add up. Placed under the rule it
            is what it actually is: a statement about the order just totalled.

            Same `.saving` treatment as the product page and the grid tiles. */}
        {totalSavedPaise > 0 && (
          <p className="saving mt-3">You saved {formatINRPaise(totalSavedPaise)} on this order</p>
        )}

        {/* Hidden on mobile — the sticky bar is the button there, and two
            checkout buttons on one screen is a question, not a shortcut. */}
        <Button asChild variant="cta" size="cta" className="mt-6 hidden w-full md:inline-flex">
          <Link href="/checkout">Proceed to checkout</Link>
        </Button>
      </div>
    </>
  );
}
