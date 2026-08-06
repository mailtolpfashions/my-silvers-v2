"use client";

import { useTransition } from "react";
import { Minus, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { setCartQuantityAction, removeFromCartAction } from "@/actions/cart-actions";

export function CartRowControls({
  productId,
  size = "",
  quantity,
  maxQuantity,
}: {
  productId: string;
  /** Part of the line's identity — without it, changing one size changes both. */
  size?: string;
  quantity: number;
  maxQuantity: number;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    // Below sm this row sits under the product name and spans the card, so the
    // bin goes to the far edge — away from the stepper it would otherwise be
    // touching. From sm up the whole group is right-aligned and stays together.
    <div className="flex shrink-0 items-center gap-2">
      <Button
        variant="outline"
        size="icon"
        disabled={isPending || quantity <= 1}
        onClick={() =>
          startTransition(async () => {
            await setCartQuantityAction(productId, quantity - 1, size);
          })
        }
        aria-label="Decrease quantity"
      >
        <Minus />
      </Button>
      <span className="w-8 text-center text-sm tabular-nums">{quantity}</span>
      <Button
        variant="outline"
        size="icon"
        disabled={isPending || quantity >= maxQuantity}
        onClick={() =>
          startTransition(async () => {
            await setCartQuantityAction(productId, quantity + 1, size);
          })
        }
        aria-label="Increase quantity"
      >
        <Plus />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="ml-auto sm:ml-0"
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            await removeFromCartAction(productId, size);
          })
        }
        aria-label="Remove from cart"
      >
        <Trash2 />
      </Button>
    </div>
  );
}
