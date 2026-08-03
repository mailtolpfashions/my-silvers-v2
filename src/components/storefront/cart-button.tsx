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
    <Button asChild variant="ghost" size="icon" className="relative" aria-label="Cart">
      <Link href="/cart">
        <ShoppingBag />
        {count > 0 && (
          <span
            // Wider than tall past 9 so "12" doesn't get clipped by a circle.
            className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-gold px-1 text-[10px] font-semibold leading-none text-ink"
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
