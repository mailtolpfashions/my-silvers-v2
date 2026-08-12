"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  subscribeGuestCart,
  getGuestCartSnapshot,
  getGuestCartServerSnapshot,
} from "@/lib/guest-cart";

/**
 * Cart icon with a live item count.
 *
 * Guests: read from localStorage via useSyncExternalStore, so the badge updates
 * the instant an item is added, without a round trip.
 *
 * Signed in: the count is a server prop. AddToCartButton calls router.refresh()
 * after a successful add, which re-renders the header with the new value.
 */
export function CartButton({
  isAuthed,
  initialCount = 0,
}: {
  isAuthed: boolean;
  initialCount?: number;
}) {
  const guestItems = useSyncExternalStore(
    subscribeGuestCart,
    getGuestCartSnapshot,
    getGuestCartServerSnapshot
  );

  const count = isAuthed
    ? initialCount
    : guestItems.reduce((total, item) => total + item.quantity, 0);

  return (
    <Button asChild variant="ghost" size="icon" className="relative size-10 rounded-none md:size-11" aria-label="Cart">
      <Link href="/cart">
        <ShoppingBag className="size-5" />
        {count > 0 && (
          <span
            // Wider than tall past 9 so "12" doesn't get clipped by a circle.
            // Inset rather than hung off the corner: the button is 48px around a
            // 24px glyph, so a negative offset would float the badge in dead
            // space well clear of the bag.
            // `cart-count` is the hook the transparent header uses to flip the
            // digit to ink. Over a hero the header re-points --black to white,
            // so `bg-black` correctly becomes a white pill — but `text-white`
            // came with it and the count went white-on-white. See the
            // `.cart-count` rule in globals.css.
            className="cart-count absolute right-0.5 top-1 flex h-[17px] min-w-[17px] items-center justify-center bg-black px-1 text-micro font-medium leading-none text-white"
            aria-hidden
          >
            {count > 99 ? "99+" : count}
          </span>
        )}
        <span className="sr-only">
          {count === 0 ? "Cart is empty" : `${count} item${count === 1 ? "" : "s"} in cart`}
        </span>
      </Link>
    </Button>
  );
}
