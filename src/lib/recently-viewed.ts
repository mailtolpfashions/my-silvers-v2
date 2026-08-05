/**
 * Recently viewed — client-only localStorage list of product ids.
 *
 * Deliberately NOT server state. Every product page is partial-prerendered and
 * shared across shoppers; recording views server-side would make each page
 * unique per visitor and undo the caching the whole storefront rests on. Same
 * reasoning, and the same useSyncExternalStore shape, as src/lib/guest-cart.ts.
 */
const KEY = "mysilvers.recently-viewed";
const MAX = 12;

type Listener = () => void;
const listeners = new Set<Listener>();

/** useSyncExternalStore compares by reference, so the snapshot must be stable. */
let cache: string[] = [];
let cacheRaw: string | null = null;

export function readRecentlyViewed(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw === cacheRaw) return cache;
    cacheRaw = raw;
    const parsed = raw ? JSON.parse(raw) : [];
    cache = Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string") : [];
    return cache;
  } catch {
    return [];
  }
}

/** Most recent first; re-viewing a product moves it to the front. */
export function recordProductView(productId: string) {
  if (typeof window === "undefined") return;
  const next = [productId, ...readRecentlyViewed().filter((id) => id !== productId)].slice(0, MAX);
  window.localStorage.setItem(KEY, JSON.stringify(next));
  cacheRaw = null;
  listeners.forEach((l) => l());
}

export function subscribeRecentlyViewed(listener: Listener) {
  listeners.add(listener);
  // Keeps a second tab in step, matching the guest cart's behaviour.
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      cacheRaw = null;
      listener();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function getRecentlyViewedSnapshot(): string[] {
  return readRecentlyViewed();
}

/** Server render has no localStorage — a frozen empty array keeps it stable. */
const SERVER_SNAPSHOT: string[] = [];
export function getRecentlyViewedServerSnapshot(): string[] {
  return SERVER_SNAPSHOT;
}
