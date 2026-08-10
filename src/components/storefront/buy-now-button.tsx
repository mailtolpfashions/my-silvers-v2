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
      variant="cta"
      size="cta"
      // Square graphite block — the primary commerce CTA, and the only filled
      // one in the stack. It used to be a fully-rounded BRASS pill, which broke
      // the palette rule twice over: --brass is a decorative accent, not a fill
      // behind a label, and a gold pill beside a dark "Add to cart" read as a
      // promotional sticker rather than the primary action. Add to cart and
      // Save are now outlined beneath it, so the hierarchy is legible without
      // any colour at all.
      // `min-w-0 shrink px-4` matters in the pinned mobile bar, where this sits
      // beside Add to cart inside a 360px row. size="cta" carries `px-10
      // sm:px-14` and the Button base sets `shrink-0` and `whitespace-nowrap` —
      // so without this the label was clipped at the screen edge on a 360px
      // phone. Any cta-sized button in a flex row must restate its padding and
      // allow itself to shrink.
      className="w-full min-w-0 shrink px-4 text-[12px] tracking-[0.06em] sm:px-4 md:text-[13px] md:tracking-[0.08em]"
      disabled={stock === 0 || isPending}
      onClick={handleClick}
    >
      {stock === 0 ? "Out of stock" : isPending ? "Just a moment…" : "Buy now"}
    </Button>
  );
}
