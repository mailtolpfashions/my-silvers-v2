/**
 * Recent searches — client-only localStorage list of query strings.
 *
 * Same shape and the same reasoning as src/lib/recently-viewed.ts: the header
 * renders on every partial-prerendered route, so this cannot be server state
 * without making each page unique per shopper.
 */
const KEY = "mysilvers.recent-searches";
const MAX = 6;

type Listener = () => void;
const listeners = new Set<Listener>();

/** useSyncExternalStore compares by reference, so the snapshot must be stable. */
let cache: string[] = [];
let cacheRaw: string | null = null;

export function readRecentSearches(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw === cacheRaw) return cache;
    cacheRaw = raw;
    const parsed = raw ? JSON.parse(raw) : [];
    cache = Array.isArray(parsed)
      ? parsed.filter((term): term is string => typeof term === "string")
      : [];
    return cache;
  } catch {
    return [];
  }
}

/** Most recent first; searching the same term again moves it to the front. */
export function recordSearch(term: string) {
  if (typeof window === "undefined") return;
  const trimmed = term.trim();
  if (trimmed.length === 0) return;

  // Case-insensitive de-dupe so "Rings" doesn't sit next to "rings", keeping
  // whatever casing the shopper typed most recently.
  const lower = trimmed.toLowerCase();
  const next = [
    trimmed,
    ...readRecentSearches().filter((t) => t.toLowerCase() !== lower),
  ].slice(0, MAX);

  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Private mode or a full quota — the search itself still works.
    return;
  }
  cacheRaw = null;
  listeners.forEach((l) => l());
}

export function clearRecentSearches() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    return;
  }
  cacheRaw = null;
  listeners.forEach((l) => l());
}

export function subscribeRecentSearches(listener: Listener) {
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

export function getRecentSearchesSnapshot(): string[] {
  return readRecentSearches();
}

/** Server render has no localStorage — a frozen empty array keeps it stable. */
const SERVER_SNAPSHOT: string[] = [];
export function getRecentSearchesServerSnapshot(): string[] {
  return SERVER_SNAPSHOT;
}
