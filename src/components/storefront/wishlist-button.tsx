"use client";

import { useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Heart } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { toggleWishlistAction } from "@/actions/cart-actions";
import {
  subscribeUserState,
  getUserStateSnapshot,
  getUserStateServerSnapshot,
  setWishlistLocal,
} from "@/lib/user-state-store";

/**
 * Always a heart, never a labelled block.
 *
 * The full-width "Save" button that used to stand under Add to cart on the
 * product page is gone. Saving is not a third thing to weigh against buying —
 * putting it in the same stack, at the same size, asked the shopper to choose
 * between two actions of wildly different consequence. As a heart at the top of
 * the rail it is available without competing.
 */
export function WishlistButton({
  productId,
  /**
   * Server-known state. Supplied only where a flip after hydration would be
   * jarring. Listing cards omit it and read the shared store instead, which is
   * what lets those pages be cached.
   */
  initialInWishlist,
  /**
   * Where the heart is sitting.
   *
   * "overlay" floats over a product photograph, on a listing tile — the
   * translucent fill is what makes it legible against whatever is behind it.
   * "plain" sits on the page's own background and needs no chrome at all.
   */
  surface = "overlay",
  className,
}: {
  productId: string;
  initialInWishlist?: boolean;
  surface?: "overlay" | "plain";
  className?: string;
}) {
  const state = useSyncExternalStore(
    subscribeUserState,
    getUserStateSnapshot,
    getUserStateServerSnapshot
  );
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  // Trust the server value until the store has actually loaded, so a page given
  // one never flickers from saved to unsaved and back.
  const inWishlist =
    state.status === "ready" ? state.wishlist.has(productId) : (initialInWishlist ?? false);

  function handleClick() {
    // Before hydration we can't know — send them to sign in and let the
    // redirect bring them back. After it, only guests take this path.
    if (state.status === "ready" && !state.isAuthed) {
      router.push("/login?redirect=/wishlist");
      return;
    }
    // Optimistic: every card showing this product updates immediately.
    setWishlistLocal(productId, !inWishlist);
    startTransition(async () => {
      try {
        const result = await toggleWishlistAction(productId);
        setWishlistLocal(productId, result.added);
        toast.success(result.added ? "Added to wishlist" : "Removed from wishlist");
      } catch {
        setWishlistLocal(productId, inWishlist); // roll back
        toast.error("Could not update wishlist.");
      }
    });
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      className={cn(
        // Square, like every other corner on a tile.
        "size-9 rounded-none",
        surface === "overlay" && "bg-background/80 backdrop-blur-sm hover:bg-background",
        className
      )}
      disabled={isPending}
      onClick={handleClick}
      aria-label={inWishlist ? "Remove from wishlist" : "Add to wishlist"}
      aria-pressed={inWishlist}
    >
      <Heart className={inWishlist ? "fill-destructive text-destructive" : ""} />
    </Button>
  );
}
