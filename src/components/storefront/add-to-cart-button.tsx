"use client";

import { useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { addToCartAction } from "@/actions/cart-actions";
import {
  addToGuestCart,
  subscribeGuestCart,
  getGuestCartSnapshot,
  getGuestCartServerSnapshot,
} from "@/lib/guest-cart";

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
  isAuthed,
  /** Quantity already in the signed-in customer's cart. */
  cartQuantity = 0,
}: {
  productId: string;
  stock: number;
  isAuthed: boolean;
  cartQuantity?: number;
}) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  // Guests: read localStorage directly so the state is right immediately and
  // after a reload, with no server round trip.
  const guestItems = useSyncExternalStore(
    subscribeGuestCart,
    getGuestCartSnapshot,
    getGuestCartServerSnapshot
  );

  const quantityInCart = isAuthed
    ? cartQuantity
    : (guestItems.find((i) => i.productId === productId)?.quantity ?? 0);

  const inCart = quantityInCart > 0;
  const atStockLimit = quantityInCart >= stock;

  function handleClick() {
    if (isAuthed) {
      startTransition(async () => {
        try {
          const result = await addToCartAction(productId);

          if (!result.ok) {
            // Stock changed since this page rendered — refresh so the button
            // and availability label reflect reality, then explain why.
            router.refresh();
            toast.error(STOCK_MESSAGES[result.reason]);
            return;
          }

          // Re-renders the server components so both this button's quantity
          // and the header badge pick up the new value.
          router.refresh();
          toast.success("Added to cart", {
            action: { label: "View cart", onClick: () => router.push("/cart") },
          });
        } catch {
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
