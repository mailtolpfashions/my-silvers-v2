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
  /**
   * The Product.tags value this collection is built from. Collections have no
   * Prisma relation to Product — membership rides on this tag.
   *
   * Carried on the summary so a section can show a collection's own pieces
   * beside it without a second entry lookup. Frequently unset: a collection is
   * a valid editorial entry before anyone has decided what belongs in it.
   */
  productTag?: string;
};

const str = (v: unknown): string | undefined =>
  typeof v === "string" && v.trim() !== "" ? v : undefined;

/**
 * Every published collection, unfiltered. Fetch once, then select repeatedly.
 * Cached via listPublishedEntries, which carries the cms:collection tag.
 */
export function listCollectionEntries() {
  return listPublishedEntries("collection", 50);
}

/**
 * Published `collection` entries as cards, ordered by the editor's sortOrder.
 * listPublishedEntries sorts by publishedAt, which editors don't control.
 */
export async function getCollections(
  options: { featuredOnly?: boolean; take?: number } = {}
): Promise<CollectionSummary[]> {
  return selectCollections(await listCollectionEntries(), options);
}

/**
 * The pure half of getCollections. Split out so a page rendering several
 * collection sections fetches the entries once rather than once per section.
 */
export function selectCollections(
  entries: Awaited<ReturnType<typeof listCollectionEntries>>,
  options: { featuredOnly?: boolean; take?: number } = {}
): CollectionSummary[] {
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
        productTag: str(d.productTag),
        isFeatured: d.isFeatured === true,
        sortOrder: Number(d.sortOrder ?? 0),
      };
    })
    .filter((c) => (options.featuredOnly ? c.isFeatured : true))
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .slice(0, options.take ?? 50)
    // sortOrder is an ordering input, not part of the card's contract — drop it
    // rather than leak it into CollectionSummary.
    .map((c): CollectionSummary => {
      const { sortOrder, ...summary } = c;
      void sortOrder;
      return summary;
    });
}
