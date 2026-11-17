/**
 * A human label for a CMS entry.
 *
 * Content types don't agree on which field is the name — blog/page/collection
 * use `title`, announcements use `text`, banners use `title`. Try the likely
 * ones in order and fall back to the slug, so a type added later still renders
 * something sensible rather than blank.
 */
export function entryTitle(entry: { slug: string; data: unknown }): string {
  const d = (entry.data ?? {}) as Record<string, unknown>;
  for (const key of ["title", "headline", "text", "name"]) {
    const v = d[key];
    if (typeof v === "string" && v.trim() !== "") {
      // Headlines can carry a deliberate line break; a list wants one line.
      return v.split("\n")[0].trim();
    }
  }
  return entry.slug;
}
