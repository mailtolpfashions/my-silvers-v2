import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { StickyActionBar } from "@/components/storefront/sticky-action-bar";
import { formatINRPaise } from "@/lib/format";
import {
  FREE_SHIPPING_THRESHOLD_PAISE,
  shippingChargePaise,
} from "@/server/orders/money";

export function CartSummary({ subtotalPaise }: { subtotalPaise: number }) {
  const shippingPaise = shippingChargePaise(subtotalPaise);
  const totalPaise = subtotalPaise + shippingPaise;
  const remainingForFree = FREE_SHIPPING_THRESHOLD_PAISE - subtotalPaise;

  return (
    <>
      {/* Below md the summary card sits at the very bottom of a long list, so a
          shopper has to scroll past every line to reach checkout. The bar
          carries the total and the button; the card keeps the breakdown.
          Rendered here rather than on the page because the authed and guest
          carts both already use this component — one place, both flows. */}
      <StickyActionBar>
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-semibold leading-tight">
            {formatINRPaise(totalPaise)}
          </p>
          <p className="text-xs text-muted-foreground">
            {shippingPaise === 0 ? "Free shipping" : "Incl. shipping"}
          </p>
        </div>
        <Button asChild size="lg" className="h-12 shrink-0 rounded-full px-6 text-base">
          <Link href="/checkout">Checkout</Link>
        </Button>
      </StickyActionBar>

      <Card>
        <CardContent className="space-y-3 pt-6">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Subtotal</span>
            <span>{formatINRPaise(subtotalPaise)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Shipping</span>
            <span>{shippingPaise === 0 ? "Free" : formatINRPaise(shippingPaise)}</span>
          </div>
          {remainingForFree > 0 && (
            <p className="text-xs text-muted-foreground">
              Add {formatINRPaise(remainingForFree)} more for free shipping.
            </p>
          )}
          <div className="flex justify-between border-t pt-3 font-semibold">
            <span>Total</span>
            <span>{formatINRPaise(totalPaise)}</span>
          </div>
          {/* Hidden on mobile — the sticky bar is the button there, and two
              checkout buttons on one screen is a question, not a shortcut. */}
          <Button asChild size="lg" className="hidden w-full md:inline-flex">
            <Link href="/checkout">Proceed to checkout</Link>
          </Button>
        </CardContent>
      </Card>
    </>
  );
}
