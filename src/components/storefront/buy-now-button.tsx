"use client";

import { useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { addToCartAction } from "@/actions/cart-actions";
import { addToGuestCart } from "@/lib/guest-cart";
import {
  subscribeUserState,
  getUserStateSnapshot,
  getUserStateServerSnapshot,
  setCartQuantityLocal,
} from "@/lib/user-state-store";
import { useSize } from "@/components/storefront/size-selector";

/** Matches AddToCartButton's wording — no counts, per src/lib/stock-label.ts. */
const STOCK_MESSAGES = {
  out_of_stock: "Sorry — this piece just sold out.",
  stock_limit: "That's all we have available of this piece.",
  unavailable: "This piece is no longer available.",
  // Should be unreachable — the selector blocks the click first. Kept because
  // the server is the authority on which sizes exist, and it can reject a size
  // the page was still offering.
  size_required: "Please choose a size first.",
} as const;

/**
 * "Buy now": put this piece in the cart and go straight to it.
 *
 * Does NOT add a second unit when the product is already in the cart — it just
 * navigates. Adding on every click would mean a shopper who clicks Buy now,
 * comes back, and clicks it again arrives at a cart holding two of something
 * they only ever meant to buy once.
 *
 * Navigation waits for the server action so the cart page is not rendered from
 * a state the server has not committed yet. The optimistic local update still
 * fires first, so every other control for this product flips immediately.
 */
export function BuyNowButton({
  productId,
  stock,
  isAuthed,
  cartQuantity,
}: {
  productId: string;
  stock: number;
  /** Server-known values, same contract as AddToCartButton. */
  isAuthed?: boolean;
  cartQuantity?: number;
}) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const { requireSize } = useSize();

  const state = useSyncExternalStore(
    subscribeUserState,
    getUserStateSnapshot,
    getUserStateServerSnapshot,
  );

  const ready = state.status === "ready";
  const authed = ready ? state.isAuthed : (isAuthed ?? false);
  const quantityInCart = ready ? (state.cart.get(productId) ?? 0) : (cartQuantity ?? 0);

  function handleClick() {
    const size = requireSize();
    if (size === null) return;

    // Already there — skip the write entirely and just go.
    if (quantityInCart > 0) {
      router.push("/cart");
      return;
    }

    if (!authed) {
      addToGuestCart(productId, size);
      router.push("/cart");
      return;
    }

    setCartQuantityLocal(productId, quantityInCart + 1);
    startTransition(async () => {
      try {
        const result = await addToCartAction(productId, 1, size);
        if (!result.ok) {
          setCartQuantityLocal(productId, quantityInCart);
          toast.error(STOCK_MESSAGES[result.reason]);
          return;
        }
        router.push("/cart");
      } catch {
        setCartQuantityLocal(productId, quantityInCart);
        toast.error("Could not start checkout. Please try again.");
      }
    });
  }

  return (
    <Button
      size="lg"
      // Brass fill with a graphite label — the same pairing as the hero CTA, so
      // the strongest action on the page reads as the brand accent rather than
      // competing with "Add to cart" as a second dark button.
      className="h-12 w-full rounded-full bg-brass px-8 text-base text-graphite-950 hover:bg-brass-light sm:w-auto"
      disabled={stock === 0 || isPending}
      onClick={handleClick}
    >
      {stock === 0 ? "Out of stock" : isPending ? "Just a moment…" : "Buy now"}
    </Button>
  );
}
