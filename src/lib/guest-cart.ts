/**
 * Guest cart — client-only localStorage store of {productId, quantity}.
 * Authed users use the DB cart instead; at guest checkout these items are
 * submitted to the server, which re-validates everything against live
 * product rows (the client copy is never trusted).
 */
export type GuestCartItem = { productId: string; quantity: number };

const KEY = "mys-guest-cart";
const MAX_QTY = 10;

export function readGuestCart(): GuestCartItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (i): i is GuestCartItem =>
          typeof i?.productId === "string" && typeof i?.quantity === "number"
      )
      .map((i) => ({ ...i, quantity: Math.max(1, Math.min(MAX_QTY, Math.trunc(i.quantity))) }));
  } catch {
    return [];
  }
}

function write(items: GuestCartItem[]) {
  window.localStorage.setItem(KEY, JSON.stringify(items));
  window.dispatchEvent(new CustomEvent("guest-cart-changed"));
}

export function addToGuestCart(productId: string, quantity = 1) {
  const items = readGuestCart();
  const existing = items.find((i) => i.productId === productId);
  if (existing) {
    existing.quantity = Math.min(MAX_QTY, existing.quantity + quantity);
  } else {
    items.push({ productId, quantity: Math.min(MAX_QTY, Math.max(1, quantity)) });
  }
  write(items);
}

export function setGuestCartQuantity(productId: string, quantity: number) {
  let items = readGuestCart();
  if (quantity <= 0) {
    items = items.filter((i) => i.productId !== productId);
  } else {
    const item = items.find((i) => i.productId === productId);
    if (item) item.quantity = Math.min(MAX_QTY, quantity);
  }
  write(items);
}

export function removeFromGuestCart(productId: string) {
  write(readGuestCart().filter((i) => i.productId !== productId));
}

export function clearGuestCart() {
  write([]);
}

// ── useSyncExternalStore bindings ───────────────────────────────────────────
// getSnapshot must be referentially stable while the underlying data is
// unchanged, so the parsed array is cached against the raw string.

let cachedRaw: string | null | undefined;
let cachedItems: GuestCartItem[] = [];
const SERVER_SNAPSHOT: GuestCartItem[] = [];

export function subscribeGuestCart(callback: () => void): () => void {
  window.addEventListener("guest-cart-changed", callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener("guest-cart-changed", callback);
    window.removeEventListener("storage", callback);
  };
}

export function getGuestCartSnapshot(): GuestCartItem[] {
  const raw = window.localStorage.getItem(KEY);
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedItems = readGuestCart();
  }
  return cachedItems;
}

export function getGuestCartServerSnapshot(): GuestCartItem[] {
  return SERVER_SNAPSHOT;
}
