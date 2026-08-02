"use client";

import { useTransition } from "react";
import { Minus, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { setCartQuantityAction, removeFromCartAction } from "@/actions/cart-actions";

export function CartRowControls({
  productId,
  quantity,
  maxQuantity,
}: {
  productId: string;
  quantity: number;
  maxQuantity: number;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="icon"
        disabled={isPending || quantity <= 1}
        onClick={() =>
          startTransition(async () => {
            await setCartQuantityAction(productId, quantity - 1);
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
            await setCartQuantityAction(productId, quantity + 1);
          })
        }
        aria-label="Increase quantity"
      >
        <Plus />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            await removeFromCartAction(productId);
          })
        }
        aria-label="Remove from cart"
      >
        <Trash2 />
      </Button>
    </div>
  );
}
