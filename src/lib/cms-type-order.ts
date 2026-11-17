/**
 * The order content types appear in — the Studio sidebar and its start page
 * share it, so the two never list them differently. Types not named here
 * follow, alphabetically by label.
 */
const PREFERRED_ORDER = ["homepage", "heroSlide", "page", "blog", "collection", "announcement", "banner"];

export function sortContentTypes<T extends { name: string; label: string }>(types: T[]): T[] {
  const rank = (name: string) => {
    const index = PREFERRED_ORDER.indexOf(name);
    return index === -1 ? PREFERRED_ORDER.length : index;
  };
  return [...types].sort((a, b) => rank(a.name) - rank(b.name) || a.label.localeCompare(b.label));
}
