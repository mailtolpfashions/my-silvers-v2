"use client";

import { useTransition } from "react";
import { Minus, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { setCartQuantityAction, removeFromCartAction } from "@/actions/cart-actions";
import { adjustCartQuantityLocal } from "@/lib/user-state-store";

/**
 * Quantity and removal for one cart line.
 *
 * ── Every change is optimistic ──────────────────────────────────────────────
 * ⚠️  These three buttons used to call their action and nothing else, so the
 * header count sat on its old number for a second or two after a shopper
 * removed something — long enough to read as broken, on the one screen where
 * the count is the thing being watched.
 *
 * The badge reads the shared user-state store (see cart-button.tsx), and
 * AddToCartButton has always written to it optimistically. This is the other
 * half: adding was instant while removing was not.
 *
 * ── Why by DELTA and not by value ───────────────────────────────────────────
 * The store is keyed by PRODUCT and holds the total across every size. This
 * component is one LINE — a ring in size 16 and the same ring in size 18 are
 * two rows, and each knows only its own quantity. Setting the product's total
 * from a single row would wipe the other size out of the badge. See
 * adjustCartQuantityLocal.
 *
 * Rollback is the same delta with the sign flipped, so a failed request leaves
 * the count exactly where it started even if two rows changed at once.
 */
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

  /**
   * Applies `delta` to the badge immediately, runs `action`, and undoes the
   * delta if it fails. The server remains the authority — the revalidate inside
   * each action re-renders this page with the real quantities, and the store is
   * re-hydrated on navigation.
   */
  function optimistic(delta: number, action: () => Promise<{ ok: true }>, failure: string) {
    adjustCartQuantityLocal(productId, delta);
    startTransition(async () => {
      try {
        await action();
      } catch {
        adjustCartQuantityLocal(productId, -delta);
        toast.error(failure);
      }
    });
  }

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
          optimistic(
            -1,
            () => setCartQuantityAction(productId, quantity - 1, size),
            "Could not update the quantity."
          )
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
          optimistic(
            1,
            () => setCartQuantityAction(productId, quantity + 1, size),
            "Could not update the quantity."
          )
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
          // The whole line goes, so the delta is its entire quantity — not 1.
          optimistic(
            -quantity,
            () => removeFromCartAction(productId, size),
            "Could not remove that piece."
          )
        }
        aria-label="Remove from cart"
      >
        <Trash2 />
      </Button>
    </div>
  );
}
