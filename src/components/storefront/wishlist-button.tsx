"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Heart } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { toggleWishlistAction } from "@/actions/cart-actions";

export function WishlistButton({
  productId,
  isAuthed,
  initialInWishlist,
  /** Circular heart-only button, for the corner of a listing card. */
  iconOnly = false,
}: {
  productId: string;
  isAuthed: boolean;
  initialInWishlist: boolean;
  iconOnly?: boolean;
}) {
  const [inWishlist, setInWishlist] = useState(initialInWishlist);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleClick() {
    if (!isAuthed) {
      router.push("/login?redirect=/wishlist");
      return;
    }
    startTransition(async () => {
      try {
        const result = await toggleWishlistAction(productId);
        setInWishlist(result.added);
        toast.success(result.added ? "Added to wishlist" : "Removed from wishlist");
      } catch {
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
