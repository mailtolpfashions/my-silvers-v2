import { getPublishedEntry } from "@/server/cms/entries";
import { getSearchTerms } from "@/server/products/search-terms";
import { SearchBox } from "@/components/storefront/search-box";

/**
 * Feeds the header search its placeholder phrases and idle suggestion chips.
 *
 * Separate from SiteHeader because that component is deliberately synchronous —
 * awaiting anything there would make every storefront route dynamic. Behind its
 * own Suspense boundary the header shell still prerenders, and a SearchBox with
 * its built-in default placeholder renders as the fallback, so the field is
 * usable before this resolves.
 *
 * Placeholders come from the catalogue by default. The CMS array is an OVERRIDE,
 * not the source: fill it in and those phrases win, leave it empty and the
 * categories drive it with nothing to maintain. That ordering matters — the
 * first version made the CMS the only source, so a fresh install showed one
 * hardcoded fallback string until someone typed four rows by hand.
 */
export async function HeaderSearch({ className }: { className?: string }) {
  const [entry, terms] = await Promise.all([
    getPublishedEntry("homepage"),
    getSearchTerms(),
  ]);

  // Array fields arrive as [{ text: "…" }] — the CMS array editor always wraps
  // rows in objects, even single-field ones.
  const rows = entry?.data?.searchPlaceholders;
  const override = Array.isArray(rows)
    ? rows
        .map((row) =>
          row && typeof row === "object" ? String((row as { text?: unknown }).text ?? "") : "",
        )
        .filter((text) => text.trim().length > 0)
    : [];

  return (
    <SearchBox
      className={className}
      placeholders={override.length > 0 ? override : terms.placeholders}
      popular={terms.popular}
    />
  );
}
