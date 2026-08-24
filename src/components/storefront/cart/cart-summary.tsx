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
  // Rates arrive as a prop because they are admin-editable settings and this
  // component renders inside the client-side guest cart as well as the server
  // cart — see the note on ShippingRates in server/orders/money.ts.
  rates,
}: {
  subtotalPaise: number;
  rates: ShippingRates;
}) {
  const shippingPaise = shippingChargePaise(subtotalPaise, rates);
  const totalPaise = subtotalPaise + shippingPaise;
  const remainingForFree = rates.freeShippingThresholdPaise - subtotalPaise;

  return (
    <>
      {/* Below md the summary sits at the very bottom of a long list, so a
          shopper has to scroll past every line to reach checkout. The bar
          carries the total and the button; the block keeps the breakdown.
          Rendered here rather than on the page because the authed and guest
          carts both use this component — one place, both flows. */}
      <StickyActionBar>
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-semibold leading-tight">
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
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Subtotal</dt>
            <dd>{formatINRPaise(subtotalPaise)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Shipping</dt>
            <dd>{shippingPaise === 0 ? "Free" : formatINRPaise(shippingPaise)}</dd>
          </div>
          {remainingForFree > 0 && (
            <p className="text-xs text-black">
              Add {formatINRPaise(remainingForFree)} more for free shipping.
            </p>
          )}
          {/* The breakdown rows stay at 14px — they are arithmetic. Only the
              total steps up, because it is the one number in this block a
              shopper is actually deciding on. Bumping every row would make the
              summary louder without making the total lead. */}
          <div className="flex items-baseline justify-between border-t pt-3 text-base font-semibold">
            <dt>Total</dt>
            <dd>{formatINRPaise(totalPaise)}</dd>
          </div>
        </dl>

        {/* Hidden on mobile — the sticky bar is the button there, and two
            checkout buttons on one screen is a question, not a shortcut. */}
        <Button asChild variant="cta" size="cta" className="mt-6 hidden w-full md:inline-flex">
          <Link href="/checkout">Proceed to checkout</Link>
        </Button>
      </div>
    </>
  );
}
