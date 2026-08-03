import { listPublishedEntries } from "@/server/cms/entries";
import type { EntryData } from "@/server/cms/types";

export type CollectionSummary = {
  id: string;
  slug: string;
  title: string;
  eyebrow?: string;
  description?: string;
  thumbnailImage?: string;
  heroImage?: string;
  cta?: string;
  isFeatured: boolean;
};

const str = (v: unknown): string | undefined =>
  typeof v === "string" && v.trim() !== "" ? v : undefined;

/**
 * Published `collection` entries as cards, ordered by the editor's sortOrder.
 * listPublishedEntries sorts by publishedAt, which editors don't control.
 */
export async function getCollections(
  options: { featuredOnly?: boolean; take?: number } = {}
): Promise<CollectionSummary[]> {
  const entries = await listPublishedEntries("collection", 50);

  return entries
    .map((entry) => {
      const d = entry.data as EntryData & Record<string, unknown>;
      return {
        id: entry.id,
        slug: entry.slug,
        title: str(d.title) ?? entry.slug,
        eyebrow: str(d.eyebrow),
        description: str(d.description),
        // Fall back to the hero when no thumbnail is set, so a card is never blank.
        thumbnailImage: str(d.thumbnailImage) ?? str(d.heroImage),
        heroImage: str(d.heroImage),
        cta: str(d.cta),
        isFeatured: d.isFeatured === true,
        sortOrder: Number(d.sortOrder ?? 0),
      };
    })
    .filter((c) => (options.featuredOnly ? c.isFeatured : true))
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .slice(0, options.take ?? 50)
    .map(({ sortOrder: _sortOrder, ...rest }) => rest);
}
