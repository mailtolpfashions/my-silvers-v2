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
import {
  subscribeUserState,
  getUserStateSnapshot,
  getUserStateServerSnapshot,
} from "@/lib/user-state-store";

/**
 * Cart icon with a live item count.
 *
 * Both kinds of shopper read from a client store, so the badge moves the
 * instant something is added — guests from localStorage, signed-in shoppers
 * from the user-state store that AddToCartButton already updates optimistically.
 *
 * ⚠️  The signed-in half used to be `initialCount`, a server prop, and this
 * comment used to say "AddToCartButton calls router.refresh() after a
 * successful add, which re-renders the header with the new value." That call no
 * longer exists — it was replaced by the optimistic store — so nothing was
 * re-rendering the header at all. `addToCartAction` revalidates "/cart", which
 * is a different route from the product page the shopper is standing on.
 *
 * The result was a badge that stayed on its old number until the next
 * navigation. Intermittent rather than constant, because an action response can
 * refresh the tree anyway depending on what else invalidated — which is exactly
 * why it survived: it looked right most of the time, and the e2e suite caught
 * it as a flake rather than a failure.
 *
 * `initialCount` is still the value until the store hydrates, so the server
 * render and first paint show a real number instead of flashing zero.
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
  const state = useSyncExternalStore(
    subscribeUserState,
    getUserStateSnapshot,
    getUserStateServerSnapshot
  );

  const guestCount = guestItems.reduce((total, item) => total + item.quantity, 0);
  // Summed from the same map AddToCartButton writes to, so one add moves the
  // badge and every card for that product together.
  const authedCount =
    state.status === "ready"
      ? [...state.cart.values()].reduce((total, quantity) => total + quantity, 0)
      : initialCount;

  const count = isAuthed ? authedCount : guestCount;

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
