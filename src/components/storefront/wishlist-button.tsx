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
}: {
  productId: string;
  isAuthed: boolean;
  initialInWishlist: boolean;
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
