"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { addToCartAction } from "@/actions/cart-actions";
import { addToGuestCart } from "@/lib/guest-cart";

export function AddToCartButton({
  productId,
  stock,
  isAuthed,
}: {
  productId: string;
  stock: number;
  isAuthed: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleClick() {
    if (isAuthed) {
      startTransition(async () => {
        try {
          await addToCartAction(productId);
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
    <Button
      size="lg"
      className="w-full sm:w-auto"
      disabled={stock === 0 || isPending}
      onClick={handleClick}
    >
      {stock === 0 ? "Out of stock" : isPending ? "Adding…" : "Add to cart"}
    </Button>
  );
}
