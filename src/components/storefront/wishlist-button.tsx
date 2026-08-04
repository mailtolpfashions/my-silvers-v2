"use client";

import { useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Heart } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { toggleWishlistAction } from "@/actions/cart-actions";
import {
  subscribeUserState,
  getUserStateSnapshot,
  getUserStateServerSnapshot,
  setWishlistLocal,
} from "@/lib/user-state-store";

export function WishlistButton({
  productId,
  /**
   * Server-known state. Supplied only on the product page, where the CTA is the
   * page and a flip after hydration would be jarring. Listing cards omit it and
   * read the shared store instead, which is what lets those pages be cached.
   */
  initialInWishlist,
  /** Circular heart-only button, for the corner of a listing card. */
  iconOnly = false,
}: {
  productId: string;
  initialInWishlist?: boolean;
  iconOnly?: boolean;
}) {
  const state = useSyncExternalStore(
    subscribeUserState,
    getUserStateSnapshot,
    getUserStateServerSnapshot
  );
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  // Trust the server value until the store has actually loaded, so the product
  // page never flickers from "In wishlist" to "Wishlist" and back.
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

  if (iconOnly) {
    return (
      <Button
        variant="secondary"
        size="icon"
        className="size-8 rounded-full bg-background/80 backdrop-blur-sm hover:bg-background"
        disabled={isPending}
        onClick={handleClick}
        aria-label={inWishlist ? "Remove from wishlist" : "Add to wishlist"}
        aria-pressed={inWishlist}
      >
        <Heart className={`size-4 ${inWishlist ? "fill-destructive text-destructive" : ""}`} />
      </Button>
    );
  }

  return (
    <Button
      variant="outline"
      size="lg"
      className="w-full sm:w-auto"
      disabled={isPending}
      onClick={handleClick}
    >
      <Heart className={inWishlist ? "fill-current" : ""} />
      {inWishlist ? "In wishlist" : "Wishlist"}
    </Button>
  );
}
