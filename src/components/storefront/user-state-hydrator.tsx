"use client";

import { useEffect } from "react";
import { hydrateUserState } from "@/lib/user-state-store";
import { readGuestCart, subscribeGuestCart } from "@/lib/guest-cart";

/**
 * Fills the per-shopper store once, from the storefront layout. Renders nothing.
 *
 * Mounted in the layout rather than per page so it survives client navigation
 * and fetches once per session, not once per route.
 */
export function UserStateHydrator() {
  useEffect(() => {
    const controller = new AbortController();
    // Set once the server tells us; guests never need to hit the API again.
    let isAuthed = false;

    async function load() {
      try {
        const res = await fetch("/api/me/state", {
          signal: controller.signal,
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = (await res.json()) as {
          isAuthed: boolean;
          wishlist: string[];
          cart: Record<string, number>;
        };

        isAuthed = data.isAuthed;

        // A guest's cart lives only in localStorage, so read it from there —
        // otherwise every card would offer to add something already added.
        hydrateUserState({
          isAuthed: data.isAuthed,
          wishlist: data.wishlist,
          cart: data.isAuthed ? data.cart : readLocalCart(),
        });
      } catch {
        // An aborted or failed fetch leaves the store in its neutral default,
        // which renders correctly — just without the shopper's own state.
      }
    }

    function readLocalCart(): Record<string, number> {
      return Object.fromEntries(readGuestCart().map((i) => [i.productId, i.quantity]));
    }

    void load();

    // Re-read when the tab regains focus: the shopper may have changed their
    // cart in another tab, or signed in elsewhere.
    const refresh = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);

    // Guests: mirror localStorage writes straight into the store. No fetch —
    // /api/me/state has nothing to tell a guest that localStorage doesn't.
    const unsubscribeGuest = subscribeGuestCart(() => {
      if (isAuthed) return;
      hydrateUserState({ isAuthed: false, wishlist: [], cart: readLocalCart() });
    });

    return () => {
      controller.abort();
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
      unsubscribeGuest();
    };
  }, []);

  return null;
}
