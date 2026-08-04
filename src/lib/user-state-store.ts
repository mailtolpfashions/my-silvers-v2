/**
 * Per-shopper wishlist + cart membership, held on the client.
 *
 * Why this exists: these two facts used to be fetched on the server and threaded
 * into every ProductCard as props. That made an otherwise identical product grid
 * different for every visitor, which is what kept listing pages from being
 * cached at all. They are button decorations — no SEO value, never the LCP
 * element — so they belong on the client.
 *
 * Modelled on src/lib/guest-cart.ts, including its snapshot-stability rules:
 * getSnapshot must return a referentially equal value while the data is
 * unchanged, or useSyncExternalStore will loop.
 */

export type UserState = {
  status: "loading" | "ready";
  isAuthed: boolean;
  /** Product ids in the wishlist. Authed users only — guests have no wishlist. */
  wishlist: ReadonlySet<string>;
  /** productId → quantity in cart. Covers guest and authed carts alike. */
  cart: ReadonlyMap<string, number>;
};

const EMPTY_WISHLIST: ReadonlySet<string> = new Set();
const EMPTY_CART: ReadonlyMap<string, number> = new Map();

/** Frozen so the server render and the first client render agree exactly. */
const SERVER_SNAPSHOT: UserState = Object.freeze({
  status: "loading",
  isAuthed: false,
  wishlist: EMPTY_WISHLIST,
  cart: EMPTY_CART,
});

let current: UserState = SERVER_SNAPSHOT;

const listeners = new Set<() => void>();

function emit(next: UserState) {
  current = next;
  for (const listener of listeners) listener();
}

export function subscribeUserState(callback: () => void): () => void {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

export function getUserStateSnapshot(): UserState {
  return current;
}

export function getUserStateServerSnapshot(): UserState {
  return SERVER_SNAPSHOT;
}

/** Replaces the whole state — called by UserStateHydrator after a fetch. */
export function hydrateUserState(input: {
  isAuthed: boolean;
  wishlist: string[];
  cart: Record<string, number>;
}) {
  emit({
    status: "ready",
    isAuthed: input.isAuthed,
    wishlist: new Set(input.wishlist),
    cart: new Map(Object.entries(input.cart)),
  });
}

/** Optimistic write. The server action still runs; this just avoids the wait. */
export function setWishlistLocal(productId: string, inWishlist: boolean) {
  const next = new Set(current.wishlist);
  if (inWishlist) next.add(productId);
  else next.delete(productId);
  emit({ ...current, wishlist: next });
}

/** Optimistic write. Quantity <= 0 removes the line entirely. */
export function setCartQuantityLocal(productId: string, quantity: number) {
  const next = new Map(current.cart);
  if (quantity <= 0) next.delete(productId);
  else next.set(productId, quantity);
  emit({ ...current, cart: next });
}

/** Test/route-change escape hatch — drops back to the pre-hydration state. */
export function resetUserState() {
  emit(SERVER_SNAPSHOT);
}
