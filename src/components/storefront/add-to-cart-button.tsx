"use client";

import { useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
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

/** Wording for stock outcomes — no counts, matching src/lib/stock-label.ts. */
const STOCK_MESSAGES = {
  out_of_stock: "Sorry — this piece just sold out.",
  stock_limit: "That's all we have available of this piece.",
  unavailable: "This piece is no longer available.",
} as const;

/**
 * Shows "Added to cart" for as long as the product is actually in the cart —
 * not as a brief flash. Clicking again adds another unit; quantity is then
 * adjusted with +/- on the cart page.
 *
 * The state reflects real cart contents, so it survives a page reload and is
 * still correct if the item was added on a previous visit.
 */
export function AddToCartButton({
  productId,
  stock,
  /**
   * Server-known values. Supplied only on the product page, where the CTA is
   * the page and a flip after hydration would be jarring. Listing cards omit
   * them and read the shared store, which is what lets those pages be cached.
   */
  isAuthed,
  cartQuantity,
  /** Compact rendering for listing cards: full width, small, no helper text. */
  compact = false,
}: {
  productId: string;
  stock: number;
  isAuthed?: boolean;
  cartQuantity?: number;
  compact?: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  // One store for guests and signed-in shoppers alike — it is filled from
  // localStorage for the former and /api/me/state for the latter.
  const state = useSyncExternalStore(
    subscribeUserState,
    getUserStateSnapshot,
    getUserStateServerSnapshot
  );

  const ready = state.status === "ready";
  const authed = ready ? state.isAuthed : (isAuthed ?? false);
  const quantityInCart = ready ? (state.cart.get(productId) ?? 0) : (cartQuantity ?? 0);

  const inCart = quantityInCart > 0;
  const atStockLimit = quantityInCart >= stock;

  function handleClick() {
    if (authed) {
      // Optimistic, so every card for this product updates at once. The guest
      // path needs no equivalent — writing localStorage notifies the store.
      setCartQuantityLocal(productId, quantityInCart + 1);
      startTransition(async () => {
        try {
          const result = await addToCartAction(productId);

          if (!result.ok) {
            setCartQuantityLocal(productId, quantityInCart);
            toast.error(STOCK_MESSAGES[result.reason]);
            return;
          }

          toast.success("Added to cart", {
            action: { label: "View cart", onClick: () => router.push("/cart") },
          });
        } catch {
          setCartQuantityLocal(productId, quantityInCart);
          toast.error("Could not add to cart. Please try again.");
        }
      });
    } else {
      addToGuestCart(productId);
      toast.success("Added to cart", {
        action: { label: "View cart", onClick: () => router.push("/cart") },
      });
    }
  }

  if (compact) {
    return (
      <Button
        size="sm"
        variant={inCart ? "outline" : "default"}
        className="mt-3 w-full"
        disabled={stock === 0 || isPending || atStockLimit}
        onClick={handleClick}
      >
        {stock === 0 ? (
          "Out of stock"
        ) : isPending ? (
          "Adding…"
        ) : inCart ? (
          <>
            <Check className="size-3.5" />
            In cart{quantityInCart > 1 && ` (${quantityInCart})`}
          </>
        ) : (
          "Add to cart"
        )}
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Button
        size="lg"
        variant={inCart ? "outline" : "default"}
        className="w-full sm:w-auto"
        // Blocked once the cart already holds every unit in stock — the server
        // would clamp it anyway, so offering the click would be a lie.
        disabled={stock === 0 || isPending || atStockLimit}
        onClick={handleClick}
      >
        {stock === 0 ? (
          "Out of stock"
        ) : isPending ? (
          "Adding…"
        ) : inCart ? (
          <>
            <Check className="size-4" />
            Added to cart
            {quantityInCart > 1 && ` (${quantityInCart})`}
          </>
        ) : (
          "Add to cart"
        )}
      </Button>

      {inCart && !atStockLimit && (
        <p className="text-xs text-muted-foreground">Click again to add another</p>
      )}
      {/* Never states the number — see src/lib/stock-label.ts. */}
      {inCart && atStockLimit && (
        <p className="text-xs text-muted-foreground">
          You&apos;ve added all we have available
        </p>
      )}
    </div>
  );
}
