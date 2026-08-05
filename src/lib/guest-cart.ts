/**
 * Guest cart — client-only localStorage store of {productId, size, quantity}.
 * Authed users use the DB cart instead; at guest checkout these items are
 * submitted to the server, which re-validates everything against live
 * product rows (the client copy is never trusted).
 */
export type GuestCartItem = { productId: string; size: string; quantity: number };

/**
 * Lines are identified by product AND size, so ring size 7 and size 9 are two
 * lines. Unsized products use "" — never undefined, so the key is always a
 * string and old carts written before sizes existed still match.
 */
const lineKey = (productId: string, size: string) => `${productId}::${size}`;
export const guestLineKey = lineKey;

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
      // size is coerced rather than required: carts saved before sizes existed
      // have no such field, and dropping those lines would silently empty a
      // returning shopper's basket.
      .map((i) => ({
        productId: i.productId,
        size: typeof i.size === "string" ? i.size : "",
        quantity: Math.max(1, Math.min(MAX_QTY, Math.trunc(i.quantity))),
      }));
  } catch {
    return [];
  }
}

function write(items: GuestCartItem[]) {
  window.localStorage.setItem(KEY, JSON.stringify(items));
  window.dispatchEvent(new CustomEvent("guest-cart-changed"));
}

export function addToGuestCart(productId: string, size = "", quantity = 1) {
  const items = readGuestCart();
  const key = lineKey(productId, size);
  const existing = items.find((i) => lineKey(i.productId, i.size) === key);
  if (existing) {
    existing.quantity = Math.min(MAX_QTY, existing.quantity + quantity);
  } else {
    items.push({ productId, size, quantity: Math.min(MAX_QTY, Math.max(1, quantity)) });
  }
  write(items);
}

export function setGuestCartQuantity(productId: string, size: string, quantity: number) {
  let items = readGuestCart();
  const key = lineKey(productId, size);
  if (quantity <= 0) {
    items = items.filter((i) => lineKey(i.productId, i.size) !== key);
  } else {
    const item = items.find((i) => lineKey(i.productId, i.size) === key);
    if (item) item.quantity = Math.min(MAX_QTY, quantity);
  }
  write(items);
}

export function removeFromGuestCart(productId: string, size = "") {
  const key = lineKey(productId, size);
  write(readGuestCart().filter((i) => lineKey(i.productId, i.size) !== key));
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
