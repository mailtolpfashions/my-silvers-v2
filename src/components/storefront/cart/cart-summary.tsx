import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
        <Button asChild size="lg" className="w-full">
          <Link href="/checkout">Proceed to checkout</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
