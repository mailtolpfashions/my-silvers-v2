import { getPublishedEntry } from "@/server/cms/entries";
import { SearchBox } from "@/components/storefront/search-box";

/**
 * Feeds the header search its CMS-managed placeholder terms.
 *
 * Separate from SiteHeader because that component is deliberately synchronous —
 * awaiting anything there would make every storefront route dynamic. Behind its
 * own Suspense boundary the header shell still prerenders, and a SearchBox with
 * its built-in default placeholder renders as the fallback, so the field is
 * usable before this resolves.
 */
export async function HeaderSearch({ className }: { className?: string }) {
  const entry = await getPublishedEntry("homepage");

  // Array fields arrive as [{ text: "…" }] — the CMS array editor always wraps
  // rows in objects, even single-field ones.
  const rows = entry?.data?.searchPlaceholders;
  const placeholders = Array.isArray(rows)
    ? rows
        .map((row) => (row && typeof row === "object" ? String((row as { text?: unknown }).text ?? "") : ""))
        .filter((text) => text.trim().length > 0)
    : [];

  return <SearchBox className={className} placeholders={placeholders} />;
}
