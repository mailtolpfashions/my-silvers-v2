"use client";

import { useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ShoppingBag } from "lucide-react";
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

/** Wording for stock outcomes — no counts, matching src/lib/stock-label.ts. */
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
  /**
   * Full width and no helper text — for the pinned mobile action bar on the
   * product page, where the row is already two controls wide.
   *
   * This used to also serve a CTA rendered on every listing card. That is gone:
   * the card navigates, the product page sells. Buying 925 silver is a
   * considered purchase with a size attached, so add-to-cart from a grid both
   * mostly cannot succeed for a sized piece and doubled the visual weight of
   * every tile in the grid.
   */
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
  // Returns "" on pages with no selector, so this is a no-op there.
  const { requireSize } = useSize();

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
    // Null means the product needs a size and none is chosen; the selector has
    // already shown its own error, so stop here rather than adding a line the
    // packer cannot fulfil.
    const size = requireSize();
    if (size === null) return;

    if (authed) {
      // Optimistic, so every card for this product updates at once. The guest
      // path needs no equivalent — writing localStorage notifies the store.
      setCartQuantityLocal(productId, quantityInCart + 1);
      startTransition(async () => {
        try {
          const result = await addToCartAction(productId, 1, size);

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
      addToGuestCart(productId, size);
      toast.success("Added to cart", {
        action: { label: "View cart", onClick: () => router.push("/cart") },
      });
    }
  }

  if (compact) {
    return (
      <Button
        variant="cta"
        size="cta"
        // Square commerce block, full width, and one step shorter than the
        // standalone version so the pinned bar stays a single row on a phone.
        // The in-cart state keeps the shape and swaps the fill — `secondary`
        // rather than `outline`, whose only affordance is a border-border
        // hairline at 1.24:1 against the page, far too faint to read as a 44px
        // control. cn() is tailwind-merge, so these beat the variant's own
        // background rather than fighting it.
        className={`h-12 w-full min-w-0 shrink px-4 text-xs tracking-[0.06em] sm:h-12 sm:px-4 ${
          inCart ? "bg-secondary text-secondary-foreground hover:bg-secondary/80" : ""
        }`}
        disabled={stock === 0 || isPending || atStockLimit}
        onClick={handleClick}
      >
        {stock === 0 ? (
          "Sold out"
        ) : isPending ? (
          "Adding…"
        ) : inCart ? (
          <>
            <Check className="size-3.5" />
            In cart{quantityInCart > 1 && ` (${quantityInCart})`}
          </>
        ) : (
          <>
            <ShoppingBag className="size-3.5" />
            Add to cart
          </>
        )}
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      {/* Square, outlined, full width — one step below Buy now, which is the
          only filled block in the stack. It was a fully-rounded black pill,
          which is the app-control shape and sat directly under a square CTA. */}
      <Button
        variant="cta"
        size="cta"
        className="w-full border-input bg-transparent text-foreground hover:bg-muted"
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

      {/* Never states the number — see src/lib/stock-label.ts. */}
      {inCart && atStockLimit && (
        <p className="text-xs text-muted-foreground">
          You&apos;ve added all we have available
        </p>
      )}
    </div>
  );
}
