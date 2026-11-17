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

/**
 * The one-line description under each content type's title (its list page
 * and its editor) — every admin and Studio page has one; see PageHeader.
 * Types not named here use their own description, or a plain fallback.
 */
const TYPE_DESCRIPTIONS: Record<string, string> = {
  homepage: "The storefront's front page — its slides, sections and their order.",
  heroSlide: "The large rotating slides at the top of the homepage.",
  page: "Standalone pages such as About, Shipping, Returns and the care guide.",
  blog: "Journal articles, listed under Journal on the storefront.",
  collection: "Curated groups of pieces, each with its own page.",
  announcement: "The messages in the strip across the top of every page.",
  banner: "Promotional banners shown on the storefront.",
  faq: "The questions and answers on the FAQ page.",
  "product-info": "Notes shown on every product page — shipping, care and trust.",
};

export function describeContentType(type: { name: string; label: string; description?: string | null }): string {
  return TYPE_DESCRIPTIONS[type.name] ?? type.description?.trim() ?? `Every ${type.label.toLowerCase()} entry.`;
}
